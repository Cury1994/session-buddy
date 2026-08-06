import { createHmac, randomUUID } from 'node:crypto'

import type {
  BillingMode,
  BssSource,
  HttpJsonSource,
  RemainingSpec,
  SubscriptionSource,
  UsageSourceConfig
} from '../shared/types'

/**
 * M13.3 — quota-reader 注册表（可插拔余量读取适配器，DESIGN §6.1 泛化）
 *
 * 用量视图泛化的核心：按 usage_source.kind 分发到对应适配器，返回统一的 QuotaInfo。
 * M13.5 调度泛化时遍历检测器发现的 called APIs → 匹配 usage_sources → 逐个调 readQuota。
 *
 * 三个适配器：
 *   ① http-json —— 通用 GET + JSON 路径提取，配置驱动零代码适配 90% 厂商
 *      （DeepSeek/OpenAI/OpenRouter 等）。鉴权仅支持 bearer / none；
 *      remaining.path 提取剩余值本体，若 API 返回 limit+usage 则填 remaining.limit
 *      自动算 limit-usage。路径解析 getPath 支持点号 + 数组下标（balance_infos[0].total_balance）。
 *   ② bss —— 阿里云 BSS QueryAccountBalance（RPC v1.0 HMAC-SHA1 签名，Version=2017-12-14，
 *      端点 https://business.aliyuncs.com）。解析 Data.AvailableCashAmount（或 AvailableAmount）。
 *   ③ subscription —— 厂商订阅套餐专属（百炼等）：url 空串 = 占位（warn + null，端点待用户提供）；
 *      url 有值时与 http-json 完全同路（GET + auth + remaining 提取）。
 *
 * 错误处理（NFR-3：失败不崩，调用方保留上次数据）：
 *   key 缺失 / 网络错误 / 超时 / 非 200 / JSON 异常 / 路径缺失 / 数值非法 / 未知 kind
 *   → console.warn + 返回 null。M13.5 调度见 null 则跳过该源本轮入库与 push。
 *
 * 纯 node 模块，不 import electron，可裸 node `require('./out/main/quota-reader')` 验收。
 * getPath / percentEncode / buildBss* / computeBssSignature / parseBssBalance / readBssQuota
 * 导出仅为单测/mock 验收用（签名向量断言 + mock BSS 端点），生产入口只有 readQuota。
 */

// ─── 统一返回类型（M13.5 调度消费） ───

/** 一个用量源的单次余量读取结果 */
export interface QuotaInfo {
  sourceId: string
  name: string
  /** 计费形式（透传 source.billing） */
  billing: BillingMode
  /** 剩余值（payg=剩余金额；subscription=剩余套餐额度） */
  remaining: number
  /** 显示单位（CNY/USD/次数/token 等，透传 source.unit；bss 源取币种） */
  unit: string
  /** 金额币种（billing=payg 时有意义） */
  currency?: string
  /** 本地时间 "YYYY-MM-DD HH:MM:SS"（与全链路本地时间约定一致，渲染端按字面展示） */
  updatedAt: string
}

// ─── 常量 ───

/** HTTP 请求超时（15s，原 deepseek.ts 约定沿袭） */
const REQUEST_TIMEOUT_MS = 15000

/** 阿里云 BSS QueryAccountBalance 端点与 API 版本（RPC 风格，M13.3 任务书指定） */
const BSS_ENDPOINT = 'https://business.aliyuncs.com'
const BSS_API_VERSION = '2017-12-14'

// ─── 工具 ───

/** Date → 本地 "YYYY-MM-DD HH:MM:SS"（与 cc-switch-usage.ts formatLocalTime 同约定） */
function formatLocalTime(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** unknown → 有限数字（接受 number 与数字字符串，如 DeepSeek total_balance 是 "10.23"），否则 undefined */
function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value.trim())
    return Number.isFinite(num) ? num : undefined
  }
  return undefined
}

/**
 * JSON 点号路径提取，支持数组下标：`balance_infos[0].total_balance` / `data.usage` / `data.limits[2]`。
 * 语法：正则把 `[N]` 归一为 `.N` 再按 `.` 分段走对象；途中任一键缺失 / 走到非对象
 * （含 null）→ undefined；根为 undefined/null → undefined；空路径（''）→ obj[''] → undefined。
 */
export function getPath(obj: unknown, path: string): unknown {
  if (obj === undefined || obj === null) return undefined
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  let current: unknown = obj
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/** RemainingSpec → 剩余数值：有 limit 则 limit-usage（path 视为已用），否则 path 本体；非法 → undefined */
function extractRemaining(data: unknown, spec: RemainingSpec): number | undefined {
  if (spec.limit !== undefined && spec.limit !== '') {
    const limitValue = toFiniteNumber(getPath(data, spec.limit))
    const usedValue = toFiniteNumber(getPath(data, spec.path ?? ''))
    if (limitValue === undefined || usedValue === undefined) return undefined
    return limitValue - usedValue
  }
  return toFiniteNumber(getPath(data, spec.path ?? ''))
}

// ─── 适配器①③共用：GET + 鉴权 + remaining 提取（http-json / 有 url 的 subscription） ───

async function fetchRemainingViaHttp(source: HttpJsonSource | SubscriptionSource): Promise<QuotaInfo | null> {
  const headers: Record<string, string> = {}
  if (source.auth.type === 'bearer') {
    // key_env 缺省按 source.id 大写推断（deepseek → DEEPSEEK_API_KEY）
    const envName =
      source.auth.key_env && source.auth.key_env.length > 0
        ? source.auth.key_env
        : `${source.id.toUpperCase()}_API_KEY`
    const key = process.env[envName]
    if (!key) {
      console.warn(`[quota-reader] ${source.id}: 环境变量 ${envName} 未设置，跳过余量查询`)
      return null
    }
    headers['Authorization'] = `Bearer ${key}`
  }

  let resp: Response
  try {
    resp = await fetch(source.url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch (err) {
    console.warn(`[quota-reader] ${source.id}: 请求失败: ${(err as Error).message}`)
    return null
  }

  if (!resp.ok) {
    console.warn(`[quota-reader] ${source.id}: 非 200 响应: HTTP ${resp.status}`)
    return null
  }

  let data: unknown
  try {
    data = await resp.json()
  } catch (err) {
    console.warn(`[quota-reader] ${source.id}: JSON 解析失败: ${(err as Error).message}`)
    return null
  }

  const remaining = extractRemaining(data, source.remaining)
  if (remaining === undefined) {
    console.warn(`[quota-reader] ${source.id}: remaining 提取失败（path=${source.remaining.path ?? ''}, limit=${source.remaining.limit ?? ''}）`)
    return null
  }

  const info: QuotaInfo = {
    sourceId: source.id,
    name: source.name,
    billing: source.billing,
    remaining,
    unit: source.unit,
    updatedAt: formatLocalTime(new Date())
  }
  if (source.kind === 'http-json' && source.currency !== undefined) {
    info.currency = source.currency
  }
  return info
}

// ─── 适配器②：阿里云 BSS QueryAccountBalance（RPC v1.0 HMAC-SHA1 签名） ───

/**
 * 阿里云 RPC percentEncode：encodeURIComponent 后 `+`→%20、`*`→%2A、%7E→`~`。
 * （encodeURIComponent 本身不产生 `+`/不编码 `*` 与 `~`，逐项替换是签名规范的保险写法。）
 */
export function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~')
}

/** 规范化查询串：参数名 ASCII 升序 → 各 k/v percentEncode → `&` 连接（阿里云 RPC 签名规范） */
export function buildBssCanonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key] ?? '')}`)
    .join('&')
}

/** StringToSign = HTTPMethod & percentEncode("/") & percentEncode(规范化查询串) */
export function buildBssStringToSign(params: Record<string, string>, method: 'GET' | 'POST' = 'GET'): string {
  return `${method}&${percentEncode('/')}&${percentEncode(buildBssCanonicalQuery(params))}`
}

/** 签名 = Base64(HMAC-SHA1(accessKeySecret + "&", StringToSign))（阿里云 RPC 签名规范） */
export function computeBssSignature(
  params: Record<string, string>,
  accessKeySecret: string,
  method: 'GET' | 'POST' = 'GET'
): string {
  const stringToSign = buildBssStringToSign(params, method)
  return createHmac('sha1', accessKeySecret + '&').update(stringToSign, 'utf8').digest('base64')
}

/**
 * 构造 QueryAccountBalance 公共请求参数（不含 Signature）。
 * now/nonce 可注入，供确定性签名向量测试。Timestamp 为 UTC 秒级 ISO8601（yyyy-MM-ddTHH:mm:ssZ）。
 */
export function buildBssParams(accessKeyId: string, opts?: { now?: Date; nonce?: string }): Record<string, string> {
  const now = opts?.now ?? new Date()
  const timestamp = now.toISOString().replace(/\.\d+Z$/, 'Z')
  return {
    Action: 'QueryAccountBalance',
    AccessKeyId: accessKeyId,
    Format: 'JSON',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: opts?.nonce ?? randomUUID(),
    SignatureVersion: '1.0',
    Timestamp: timestamp,
    Version: BSS_API_VERSION
  }
}

/**
 * 解析 QueryAccountBalance JSON 响应 → { remaining, currency }；字段缺失/非法 → null。
 * 优先取 Data.AvailableCashAmount（可用现金余额），回退 Data.AvailableAmount（含信用额度）；
 * 兼容字段直接位于顶层的形态（防网关改包）。Currency 缺省 CNY。
 */
export function parseBssBalance(json: unknown): { remaining: number; currency: string } | null {
  if (!isRecord(json)) return null
  const data = isRecord(json['Data']) ? json['Data'] : json
  const rawAmount = data['AvailableCashAmount'] ?? data['AvailableAmount']
  const remaining = toFiniteNumber(rawAmount)
  if (remaining === undefined) return null
  const rawCurrency = data['Currency']
  const currency = typeof rawCurrency === 'string' && rawCurrency.trim() !== '' ? rawCurrency.trim() : 'CNY'
  return { remaining, currency }
}

/**
 * 读取 BSS 余量。endpoint 默认官方地址，可注入供 mock 端点验收。
 *
 * 可信度说明：签名按阿里云 RPC v1.0 规范实现（SignatureVersion=1.0 / HMAC-SHA1 / secret+"&"），
 * 正确性以已知向量断言（验收脚本与 python hmac 交叉核对）；解析以 mock BSS 端点验证。
 * 无真实 AccessKey 做过联调，首次真实调用若报签名错误，优先核对 Timestamp 时钟偏差与
 * AccessKey 权限（需要 AliyunBSSReadOnlyAccess）。
 */
export async function readBssQuota(source: BssSource, endpoint: string = BSS_ENDPOINT): Promise<QuotaInfo | null> {
  const accessKeyId = process.env[source.access_key_id_env]
  const accessKeySecret = process.env[source.access_key_secret_env]
  if (!accessKeyId || !accessKeySecret) {
    console.warn(
      `[quota-reader] ${source.id}: AccessKey 环境变量缺失（${source.access_key_id_env} / ${source.access_key_secret_env}），跳过`
    )
    return null
  }

  const params = buildBssParams(accessKeyId)
  const signature = computeBssSignature(params, accessKeySecret)
  const url = `${endpoint}/?${buildBssCanonicalQuery(params)}&Signature=${percentEncode(signature)}`

  let resp: Response
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch (err) {
    console.warn(`[quota-reader] ${source.id}: BSS 请求失败: ${(err as Error).message}`)
    return null
  }

  if (!resp.ok) {
    console.warn(`[quota-reader] ${source.id}: BSS 非 200 响应: HTTP ${resp.status}`)
    return null
  }

  let json: unknown
  try {
    json = await resp.json()
  } catch (err) {
    console.warn(`[quota-reader] ${source.id}: BSS JSON 解析失败: ${(err as Error).message}`)
    return null
  }

  const parsed = parseBssBalance(json)
  if (parsed === null) {
    // 阿里云错误响应（Code/Message）在此一并降级为 null，不区分签名错与业务错（NFR-3）
    console.warn(`[quota-reader] ${source.id}: BSS 响应无可用余额字段（或为错误响应）`)
    return null
  }

  return {
    sourceId: source.id,
    name: source.name,
    billing: 'payg',
    remaining: parsed.remaining,
    unit: parsed.currency,
    currency: parsed.currency,
    updatedAt: formatLocalTime(new Date())
  }
}

// ─── 适配器③：subscription（url 空串占位 → null；有 url → http-json 同路） ───

async function readSubscriptionQuota(source: SubscriptionSource): Promise<QuotaInfo | null> {
  if (source.url.trim() === '') {
    console.warn(`[quota-reader] ${source.id}: subscription 源 url 未配置（占位，端点待提供），跳过`)
    return null
  }
  return fetchRemainingViaHttp(source)
}

// ─── 主入口 ───

/**
 * 按 source.kind 分发到对应适配器读取余量；任一失败 → null（NFR-3：不抛、不崩，
 * 调用方保留上次数据）。未知 kind（用户手改配置）→ warn + null。
 */
export async function readQuota(source: UsageSourceConfig): Promise<QuotaInfo | null> {
  try {
    switch (source.kind) {
      case 'http-json':
        return await fetchRemainingViaHttp(source)
      case 'bss':
        return await readBssQuota(source)
      case 'subscription':
        return await readSubscriptionQuota(source)
      default: {
        // 类型上已穷尽；运行时防用户手改配置塞入未知 kind
        const unknownKind = (source as { kind?: unknown }).kind
        console.warn(`[quota-reader] 未知 usage source kind: ${String(unknownKind)}，跳过`)
        return null
      }
    }
  } catch (err) {
    // 兜底安全网：适配器内部已各自降级，此处保证 readQuota 永不向上抛
    console.warn(`[quota-reader] ${source.id}: 余量读取未预期异常: ${(err as Error).message}`)
    return null
  }
}
