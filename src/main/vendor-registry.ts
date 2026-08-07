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
    }
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