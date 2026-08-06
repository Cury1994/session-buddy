/**
 * 共享类型定义（DESIGN §6.12）
 *
 * IPC 两端（主进程 ↔ 渲染进程）与 HTTP 端共用的核心类型，统一放在此处，
 * 避免各端字段名漂移。各类型随对应模块落地逐步追加（§6.12 为整体规划）。
 *
 * M2 引入：AppConfig 及其嵌套子接口（DESIGN §6.1 / §8.1）。
 * M3 引入：UsageRecord / BalanceDailySnapshot / ApprovalRecord / BalanceInfo（§6.12）。
 * M5 引入：ApprovalPayload / PendingApproval / ApprovalResponse / SessionStatus / SessionInfo（§6.12 / §5.3 / §6.8）。
 * M12 引入：ApprovalPayload 增 toolInput / permissionMode，tool/command 注释勘误（§6.12 / §6.14 审批镜像轮）。
 * M13.1 引入：usage_sources 可插拔泛化（BillingMode / UsageSourceKind / HttpJsonSource / BssSource /
 *   SubscriptionSource / DetectionConfig），替换并删除 ApiBalanceSource / BssBalanceSource / CcSwitchConfig（§6.1）。
 * M13.2 引入：CalledApi（检测器发现的"调用过的 API"）；三类余量源补可选 detect_ids 桥接字段。
 * M13.4 引入：UsageRecord 增可选 billing/unit（计费形式 + 显示单位，用量视图多卡泛化的 db 层支撑）。
 * M13.5 引入：UsageCard（调度产出的用量卡：余量卡/槽位卡统一模型）；AppConfig 增
 *   usage_poll_interval_min（全局用量源轮询间隔，替代过渡的 providers.deepseek.check_interval_min）；
 *   删除 BalanceInfo（唯一消费方 deepseek.ts 随 M13.5 删除）。
 */

// ─── 通用工具类型 ───

/**
 * 递归部分覆盖类型：对象逐层可选，**数组整体保留**（不做元素级可选），标量可选。
 * config:save / saveConfig 的入参语义（§6.1 / §8.2 深合并写回）——允许只传需要覆盖的
 * 嵌套子集（如 `{ providers: { deepseek: { balance_warn_threshold: 5 } } }`）。
 * 放此作为 IPC 两端单一真源（§6.12），主进程 config.ts 自此 import 并再导出。
 */
export type DeepPartial<T> = T extends unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

// ─── 配置（AppConfig，DESIGN §6.1） ───

export interface ServerConfig {
  host: string
  port: number
}

export interface DeepSeekProviderConfig {
  balance_url: string
  check_interval_min: number // 默认 1（分钟）
  balance_warn_threshold: number // 默认 10（CNY 绝对金额，v2.3 由比例 0.15 改绝对值）
}

export interface ProvidersConfig {
  deepseek: DeepSeekProviderConfig
}

export interface ClaudeCodeHarnessConfig {
  sessions_glob: string
  settings_path: string
  refresh_interval_sec: number // 默认 3
  config_dirs: string[] // Claude config 目录（多 profile，默认 ["~/.claude"]，见 §6.8.1）
}

export interface HarnessesConfig {
  'claude-code': ClaudeCodeHarnessConfig
}

export interface NotificationsConfig {
  enabled: boolean
  approve_timeout_sec: number // 默认 60
}

export interface WindowConfig {
  width: number
  height: number
}

// ─── M13 用量源配置（M13.1 泛化为可插拔配置驱动，2026-08-06，DESIGN §6.1 追加） ───

/** 计费形式：payg=按量消费（余量=剩余金额）；subscription=订阅消费（余量=剩余套餐额度） */
export type BillingMode = 'payg' | 'subscription'

/** 接入方式：http-json=通用 GET+JSON 提取（零代码适配 90% 厂商）；bss=阿里云 BSS 签名 RPC；subscription=厂商订阅套餐专属 */
export type UsageSourceKind = 'http-json' | 'bss' | 'subscription'

/** http-json 通用适配器的鉴权方式 */
export interface HttpAuthSpec {
  type: 'bearer' | 'none'
  /** 环境变量名，存 key；type=bearer 时必填，缺省按 source.id 推断 */
  key_env?: string
}

/** 余量提取：path=剩余值本体（JSON 点号路径）；若 API 返回 limit+usage 而非剩余，填 limit 自动算 limit-usage */
export interface RemainingSpec {
  path?: string
  limit?: string
}

/** 通用 http-json 余量源（覆盖 DeepSeek/OpenAI/OpenRouter 等 90% 厂商） */
export interface HttpJsonSource {
  id: string
  name: string
  billing: BillingMode
  kind: 'http-json'
  url: string
  auth: HttpAuthSpec
  remaining: RemainingSpec
  /** 显示单位：CNY/USD/次数/token 等 */
  unit: string
  /** 金额币种（billing=payg 时有意义） */
  currency?: string
  /** 低余量告警线（可选，命中即告警） */
  warn_threshold?: number
  /**
   * M13.2 检测标识桥接：该 API 的所有检测标识（cc-switch provider_id / model 名等），
   * 缺省 = [id]。卡片匹配：`source.detect_ids?.includes(item.id) || source.id === item.id`。
   * 背景：cc-switch provider_id 与 usage_sources.id 不对应（如 DeepSeek 在 cc-switch 是 'default'）。
   */
  detect_ids?: string[]
}

/** 阿里云 BSS QueryAccountBalance（HMAC-SHA1 签名，按量） */
export interface BssSource {
  id: string
  name: string
  billing: 'payg'
  kind: 'bss'
  access_key_id_env: string
  access_key_secret_env: string
  /** M13.2 检测标识桥接：该 API 的所有检测标识，缺省 = [id]（见 HttpJsonSource.detect_ids 说明） */
  detect_ids?: string[]
}

/** 厂商订阅套餐专属余量查询 */
export interface SubscriptionSource {
  id: string
  name: string
  billing: 'subscription'
  kind: 'subscription'
  url: string
  auth: HttpAuthSpec
  remaining: RemainingSpec
  unit: string
  warn_threshold?: number
  /** M13.2 检测标识桥接：该 API 的所有检测标识，缺省 = [id]（见 HttpJsonSource.detect_ids 说明） */
  detect_ids?: string[]
}

export type UsageSourceConfig = HttpJsonSource | BssSource | SubscriptionSource

/**
 * 检测器发现的一个"调用过的 API"（M13.2 检测器注册表产出，UI 与调度共用）。
 * 卡片匹配逻辑：`source.detect_ids?.includes(item.id) || source.id === item.id`。
 */
export interface CalledApi {
  /** 检测标识（cc-switch provider_id / model 名 / source.id） */
  id: string
  /** 展示名 */
  name: string
  /** 证据来源：cc-switch > transcript > manual（合并时保留高优先级） */
  evidence: 'cc-switch' | 'transcript' | 'manual'
  /** 请求数（cc-switch 证据有） */
  calls?: number
}

/** 检测器注册表配置：cc_switch 可选（无装自动跳过）；claude_sessions 扫会话记录；manual 恒生效（无配置项） */
export interface DetectionConfig {
  cc_switch: { enabled: boolean; db_path: string } // db_path 支持 ~ 展开
  claude_sessions: { enabled: boolean }
}

/**
 * 一张用量卡（余量卡或槽位卡），M13.5 调度产出、M13.6 渲染。
 *   - status=ok：余量卡（readQuota 成功，remaining/unit/updatedAt 有值）
 *   - status=missing-config：已调用但未配置端点（如 subscription url 空）/ 检测到了但无对应 usage_source（槽位卡，引导补配置）
 *   - status=missing-credential：缺凭证环境变量（missingHint 指出缺哪个）
 *   - status=error：余量查询失败（网络/解析等，NFR-3 保留上次展示）
 */
export interface UsageCard {
  sourceId: string
  name: string
  billing: BillingMode
  status: 'ok' | 'missing-config' | 'missing-credential' | 'error'
  remaining?: number
  unit?: string
  currency?: string
  updatedAt?: string // 本地时间 "YYYY-MM-DD HH:MM:SS"（渲染端按字面展示）
  warnThreshold?: number
  calls?: number // 调用次数（cc-switch 证据，槽位卡展示用）
  missingHint?: string // status=missing-config/missing-credential 时的引导文案
}

/**
 * 应用配置顶层结构（DESIGN §6.1，字段名严格对齐 config.yaml schema §8.1）。
 */
export interface AppConfig {
  server: ServerConfig
  providers: ProvidersConfig
  harnesses: HarnessesConfig
  notifications: NotificationsConfig
  window: WindowConfig
  /** M13.1：余量源列表（可插拔：http-json 配置驱动 / bss / subscription，多 provider 惰性出卡） */
  usage_sources: UsageSourceConfig[]
  /** M13.1：检测器注册表（cc_switch 可选 + claude_sessions 开关；manual 恒生效无配置项） */
  detection: DetectionConfig
  /**
   * M13.5：全局用量源轮询间隔（分钟，缺省 1，运行时 Math.max(1, …) 兜底）。
   * 替代过渡字段 providers.deepseek.check_interval_min（单卡时代的遗留，渲染端 M13.6 迁移后删除）。
   */
  usage_poll_interval_min: number
}

// ─── API 用量 / 审批历史（DESIGN §6.12，db INTEGER/REAL → TS 映射） ───

/** api_usage 表行（§6.2）→ UsageView 渲染（M13.4：增可选 billing/unit，多卡用量视图按卡展示计费形式与单位） */
export interface UsageRecord {
  provider: string
  model: string
  balance: number
  balanceCurrency: string
  timestamp: string // 本地时间 "YYYY-MM-DD HH:MM:SS"（db datetime('now','localtime')），渲染端按字面展示
  /** 计费形式：'payg' / 'subscription'；'' 或 undefined = 旧行/旧调用方未记录（M13.4 新增，可选保持向后兼容） */
  billing?: string
  /** 显示单位：CNY/token/次数…；'' 或 undefined = 旧行/旧调用方未记录（M13.4 新增，可选保持向后兼容） */
  unit?: string
}

/** get30DayBalance 聚合行（§6.2）→ TrendSparkline */
export interface BalanceDailySnapshot {
  day: string // "YYYY-MM-DD"（本地日期）
  balance: number // 当日最后一次快照余额
}

// ─── M13 消耗卡（cc-switch proxy_request_logs 聚合，2026-08-06） ───

/** 单个时间窗内的消耗聚合 */
export interface ConsumptionBucket {
  costUsd: number // Σ total_cost_usd
  inputTokens: number
  outputTokens: number
  cacheTokens: number // cache_read + cache_creation
  requests: number
}

/** 单个 cc-switch provider 的消耗卡数据（惰性出卡：有日志的 provider 才出现） */
export interface ConsumptionSummary {
  providerId: string // cc-switch provider_id（default=DeepSeek / UUID=百炼）
  providerName: string // 展示名（cc-switch provider.name 或 id 兜底）
  h5: ConsumptionBucket
  h24: ConsumptionBucket
  d7: ConsumptionBucket
  lastRequestAt: string | null // 最近一次请求时间，字面展示
}

/** approval_history 表行（§6.2）→ ApprovalHistory 渲染；allowed INTEGER → boolean */
export interface ApprovalRecord {
  id: number
  harness: string
  sessionName: string | null
  command: string
  cwd: string | null
  tool: string
  allowed: boolean
  timestamp: string // 本地时间（同 UsageRecord.timestamp 约定）
}

// ─── 审批流程（DESIGN §6.12 / §5.3 / §6.6） ───

/** approve.sh POST /approve 的请求体 / IPC approval:pending 的负载（§5.3 / §6.12） */
export interface ApprovalPayload {
  harness: string // "claude-code"
  session: string // session 名 / id
  command: string // 待审批内容摘要（server buildCommandSummary 从 toolInput 按工具构建，§6.5 前置管线；Bash 为命令全文）
  cwd: string // 工作目录
  tool: string // 实际工具名（hook 输入 tool_name：Bash/Edit/Write/WebFetch/Skill/mcp__*…；2026-08-03 勘误，原固定 "Bash"）
  description: string // 命令的人类可读摘要（Bash hook 输入自带 description；approve.sh 透传，仅实时展示不落库，可空；F1，2026-07-31 增）
  toolInput: Record<string, unknown> // hook 输入原始 tool_input 对象（§6.14 规则求值 + 摘要构建用；2026-08-03 审批镜像轮增）
  permissionMode: string // hook 输入 permission_mode（default/acceptEdits/bypassPermissions/plan，空按 default；2026-08-03 审批镜像轮增）
}

/** 队列内审批项 = payload + 运行时字段（§6.6 getAll()） */
export interface PendingApproval extends ApprovalPayload {
  id: string // crypto.randomUUID()（§6.6 id 策略）
  createdAt: number // Unix ms
  timeoutSec: number // 配置超时，默认 60（§6.6）
}

/** approval:respond / respondApproval 的负载（§6.12） */
export interface ApprovalResponse {
  id: string
  allowed: boolean
}

// ─── Session 监控（DESIGN §6.12 / §6.8，M6 scanner 产出） ───

/** Session 状态：busy=Working（脉冲灯）/ idle=Waiting（静止灯） */
export type SessionStatus = 'busy' | 'idle'

/**
 * claude-sessions.ts 产出 → GET /api/sessions / SessionCard 渲染（§6.8 / §4）。
 * M5 仅定义类型并暴露 /api/sessions 注入口（缺省 []）；实际数据由 M6 scanner 填充。
 */
export interface SessionInfo {
  sessionId: string // Claude session 唯一 id（截断 256，§6.8.2b）
  pid: number
  name: string // 显示名：transcript 首条用户消息 → json name → cwd basename → 'unknown'（命名链见 claude-sessions.ts 头注）
  status: SessionStatus
  tool: string // harness 身份，固定 "Claude Code"（非逐会话当前工具；审批匹配不依赖此字段）
  apiProvider: string // API 实际返回的模型（transcript 尾读 message.model → settings 解析降级，§6.8.2f）
  uptimeSec: number // 运行时长（秒）= (now - startedAt)/1000
  memoryMB: number // 物理内存 MB（进程死亡为 0）
  ctxPct: number // 上下文消耗百分比 0-100（§6.8.2e）
  cwd: string // 实际工作目录（transcript 尾读 lastCwd → json cwd 降级；截断 4096，§6.8.2b）
  startedAt: number // Unix ms
  hasPendingApproval: boolean // approvalQueue 中存在匹配项
  recentlyActive: boolean // 进程存活且 transcript 最近写入（mtime ≤ ACTIVE_WINDOW_MS，§6.8）→ 执行中
  lastActivity: string // 最近一条可读对话/任务内容（transcript 尾读，截断 120；无则空串）
}
