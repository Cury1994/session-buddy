import type { HttpJsonSource } from '../shared/types'

/**
 * M15 — 内置厂商模板 registry（零配置余量展示）
 *
 * 针对"只需 API key 即可查询余量"的厂商（DeepSeek 等）：当检测器发现调用了某
 * 内置厂商的 URL host，但用户未在 usage_sources 配置该源时，services.buildUsageCards
 * 用这里的模板自动生成 source 走 readQuota → 直接出余量卡。用户只需设好环境变量
 * （如 DEEPSEEK_API_KEY），无需手填 URL/path/unit。
 *
 * 反膨胀约束（CLAUDE.md）：静态数组 + 一个 matchVendor 函数，无插件系统/动态加载；
 * **只放已实测验证的厂商**，未验证的用注释占位、不塞猜测值。加厂商 = 加一行。
 * 纯 node 模块，不 import electron（同 quota-reader/cc-switch-usage 约定）。
 */

export interface VendorTemplate {
  /** URL host 精确匹配（归并键，与 cc-switch-usage urlHost 同源） */
  host: string
  /** 卡片展示名（厂商友好名，非 model 名） */
  name: string
  /** 完整余量源模板；id 由 matchVendor 按 host 派生，name 用本字段 */
  source: HttpJsonSource
  /** M17: 该厂商已知模型 → 上下文长度（模型名前缀匹配，长键优先） */
  modelContext?: { prefix: string; len: number }[]
}

export const VENDOR_TEMPLATES: VendorTemplate[] = [
  {
    host: 'api.deepseek.com',
    name: 'DeepSeek',
    source: {
      id: 'deepseek',
      name: 'DeepSeek',
      billing: 'payg',
      kind: 'http-json',
      url: 'https://api.deepseek.com/user/balance',
      auth: { type: 'bearer', key_env: 'DEEPSEEK_API_KEY' },
      remaining: { path: 'balance_infos[0].total_balance' },
      unit: 'CNY',
      currency: 'CNY',
      warn_threshold: 10,
      detect_ids: ['api.deepseek.com']
    },
    modelContext: [
      { prefix: 'deepseek-v4-pro', len: 1_000_000 },
      { prefix: 'deepseek-v4-flash', len: 1_000_000 }
    ]
  },
  {
    // M17: 本模板**不出现在 API Usage 余量卡**（无实测余量端点），仅为 contextForModel
    // 解析 qwen 系模型的上下文长度而存在。source 有意用 bearer + 未设 env → 走
    // buildSourceCard 的 missing-credential 分支，被 M17.7 过滤（与"只展示免配置卡"一致）
    host: 'token-plan.cn-beijing.maas.aliyuncs.com',
    name: '百炼',
    source: {
      id: 'bailian',
      name: '百炼',
      billing: 'subscription',
      kind: 'http-json',
      url: '',
      auth: { type: 'bearer', key_env: 'ALIYUN_BAILIAN_API_KEY' },
      remaining: { path: '' },
      unit: 'token',
      detect_ids: ['token-plan.cn-beijing.maas.aliyuncs.com']
    },
    modelContext: [{ prefix: 'qwen3.8-max-preview', len: 1_000_000 }]
  },
  {
    // M17: 智谱（glm-5.2 旧 MODEL_CONTEXT_WINDOWS 已知 1M）。context-only（无实测余量端点），
    // source 用 bearer + 未设 env → missing-credential → 被 M17.7 过滤，不出 API Usage 卡。
    // host 为真实智谱端点；contextForModel 按模型名前缀 'glm-5.2' 命中 → 1M。
    host: 'open.bigmodel.cn',
    name: '智谱',
    source: {
      id: 'zhipu',
      name: '智谱',
      billing: 'payg',
      kind: 'http-json',
      url: '',
      auth: { type: 'bearer', key_env: 'ZHIPU_API_KEY' },
      remaining: { path: '' },
      unit: 'token',
      detect_ids: ['open.bigmodel.cn']
    },
    modelContext: [{ prefix: 'glm-5.2', len: 1_000_000 }]
  }
  // OpenRouter / OpenAI / Gemini 等：API 响应实测确认后再加，不塞猜测值
]

/**
 * 按 host 精确匹配内置厂商模板。命中 → 返回派生 id 的完整 HttpJsonSource（id 取
 * 模板 source.id，与手动配置一致，db.recordUsage provider key 一致）；未命中 → null。
 */
export function matchVendor(host: string): HttpJsonSource | null {
  const template = VENDOR_TEMPLATES.find((t) => t.host === host)
  if (!template) return null
  return { ...template.source, id: template.source.id, name: template.name }
}

/**
 * M17: 按模型名前缀在所有厂商模板中匹配上下文长度（长键优先）。
 * 命中 → { len, source: 'registry' }；未命中 → null。
 */
export function contextForModel(modelId: string): { len: number; source: 'registry' } | null {
  const id = modelId.trim().toLowerCase()
  const pairs = VENDOR_TEMPLATES.flatMap((t) => t.modelContext ?? [])
    .sort((a, b) => b.prefix.length - a.prefix.length)
  const hit = pairs.find((p) => id.startsWith(p.prefix.toLowerCase()))
  if (!hit) return null
  return { len: hit.len, source: 'registry' }
}