import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { CcSwitchUsageReader, urlHost } from './cc-switch-usage'
import type { AppConfig, CalledApi } from '../shared/types'

/**
 * M13.2 — 检测器注册表（可插拔）：发现所有"调用过的 API"
 *
 * 三个检测器，合并产出 CalledApi[]（归并键 = 厂商 URL host，M15）：
 *   ① manual（恒生效）——遍历 config.usage_sources，配置声明过的 API 恒出卡，
 *      兜底保证：即使所有自动检测器失效，已配置的用量源也不会消失。
 *   ② cc-switch（config.detection.cc_switch.enabled 时尝试）——读 cc-switch 本地库
 *      proxy_request_logs 按 provider_id 分组（含请求数，仅成功 status_code 2xx），
 *      再经 provider 的 base_url 翻译成 host —— 同 host 的调用合并成一张卡。
 *      db 不存在 / 打不开 / 查询失败 → CcSwitchUsageReader 内部 warn + 返回 []，
 *      等价于跳过该检测器（NFR-3 不崩）。
 *   ③ claude-sessions（config.detection.claude_sessions.enabled 时）——读
 *      config.harnesses['claude-code'].settings_path（~/.claude/settings.json）的
 *      env.ANTHROPIC_BASE_URL → host。无 cc-switch 时 settings 配的就是真实厂商 URL
 *      （非代理），故能据此识别厂商（M15 用户约定）。settings 不可读 / base_url
 *      缺失 / host 解析失败 → 不产出（无厂商证据，不出卡）。
 *
 * 合并规则（以 id 去重）：
 *   - evidence 保留高优先级：cc-switch > transcript > manual
 *   - name：manual 优先（配置声明的展示名最用户友好，如 "阿里云百炼" 优于 cc-switch 的
 *     "阿里云百炼-coding模型"）；无 manual 项时取高优先级 evidence 的 name
 *   - calls：取最大值（两者皆无则保持 undefined，不伪造 0）
 * 排序：evidence 优先级 → calls 降序（无 calls 者靠后）→ id 升序（确定性输出）。
 *
 * 纯 node 模块，不 import electron，可裸 node `require('./out/main/detectors')` 验收
 * （cc-switch 检测器走真实库需 Electron ABI 的 better-sqlite3，裸 node 下会走失败降级路径）。
 */

// ─── 常量 ───

/** evidence 优先级：数值越小越优先（合并时保留字段 + 输出排序用） */
const EVIDENCE_RANK: Record<CalledApi['evidence'], number> = {
  'cc-switch': 0,
  transcript: 1,
  manual: 2
}

// ─── 工具 ───

/** `~` / `~/…` 展开为 home（同 config / claude-sessions / cc-switch-usage 的约定） */
function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return p
}

// ─── ③ claude-sessions 检测器：读 settings 的 base_url 识别厂商 ───

/** 本地代理地址（cc-switch 代理 / 本地回环）——非真实厂商 URL，跳过（无厂商证据） */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '0.0.0.0', '::1'])

/**
 * claude-sessions 检测器：读 Claude settings 的 env.ANTHROPIC_BASE_URL → host。
 * 无 cc-switch 时 settings 配的就是真实厂商 URL（M15 用户约定），故据此识别厂商。
 * 本机有 cc-switch 时 settings 是代理地址（127.0.0.1:15721）→ 跳过（cc-switch 检测器
 * 已按真实 provider host 归并，避免产生代理地址垃圾卡）。
 * settings 不可读 / base_url 缺失 / host 为本地代理 / 解析失败 → 不产出（NFR-3 不崩）。
 * 产出 id=host（归并键），evidence='transcript'。
 */
function detectFromSessions(config: AppConfig): CalledApi[] {
  const cc = config.harnesses?.['claude-code']
  const settingsPath = expandHome(cc?.settings_path || '~/.claude/settings.json')

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>
  } catch (err) {
    console.warn(`[detectors] settings 不可读 ${settingsPath}: ${(err as Error).message}`)
    return []
  }

  const env = (parsed['env'] ?? {}) as Record<string, unknown>
  const baseUrl = typeof env['ANTHROPIC_BASE_URL'] === 'string' ? env['ANTHROPIC_BASE_URL'] : ''
  if (baseUrl === '') return [] // 无 base_url → 无厂商证据
  const host = urlHost(baseUrl)
  if (!host || host === baseUrl) return [] // host 解析失败（非 URL）→ 不产出
  if (LOOPBACK_HOSTS.has(host)) return [] // 本地代理地址（cc-switch）→ 无真实厂商证据

  return [{ id: host, name: host, evidence: 'transcript' }]
}

// ─── 合并 ───

/**
 * 并入一条检测结果（以 id 去重）：
 *   - evidence 保留高优先级（cc-switch > transcript > manual）
 *   - name：manual 项优先；否则取高优先级 evidence 的 name
 *   - calls：取最大值（两者皆无则保持 undefined）
 */
function mergeInto(map: Map<string, CalledApi>, item: CalledApi): void {
  const existing = map.get(item.id)
  if (!existing) {
    map.set(item.id, { ...item })
    return
  }

  const keepExistingPriority = EVIDENCE_RANK[existing.evidence] <= EVIDENCE_RANK[item.evidence]
  const evidence = keepExistingPriority ? existing.evidence : item.evidence

  let name: string
  if (existing.evidence === 'manual') name = existing.name
  else if (item.evidence === 'manual') name = item.name
  else name = keepExistingPriority ? existing.name : item.name

  let calls: number | undefined
  if (existing.calls === undefined && item.calls === undefined) {
    calls = undefined
  } else {
    calls = Math.max(existing.calls ?? 0, item.calls ?? 0)
  }

  const merged: CalledApi = { id: item.id, name, evidence }
  if (calls !== undefined) merged.calls = calls
  map.set(item.id, merged)
}

// ─── 注册表入口 ───

/**
 * 合并所有检测器的"调用过"集合，按 id 去重（evidence 保留 cc-switch > transcript > manual，
 * name manual 优先，calls 取最大），返回 CalledApi[]。
 *
 * 排序：evidence 优先级 → calls 降序（无 calls 者靠后）→ id 升序（确定性输出）。
 * 任何检测器失败都只降级该检测器（warn），不抛、不影响其余检测器与 manual 兜底。
 */
export function detectCalled(config: AppConfig): CalledApi[] {
  const merged = new Map<string, CalledApi>()

  // ① manual 检测器（恒生效）：配置声明过的 API 恒出卡
  const sources = config.usage_sources ?? []
  for (const source of sources) {
    if (typeof source?.id === 'string' && source.id !== '') {
      mergeInto(merged, { id: source.id, name: source.name, evidence: 'manual' })
    }
  }

  // ② cc-switch 检测器：db 不存在 / 打不开 / 查询失败 → reader 内部 warn + []，自动跳过
  if (config.detection?.cc_switch?.enabled) {
    const reader = new CcSwitchUsageReader(config.detection.cc_switch.db_path)
    for (const item of reader.detectCalled()) mergeInto(merged, item)
  }

  // ③ claude-sessions 检测器：读 settings 的 base_url → host 识别厂商（无 cc-switch 兜底）
  if (config.detection?.claude_sessions?.enabled) {
    for (const item of detectFromSessions(config)) mergeInto(merged, item)
  }

  const result = [...merged.values()]
  result.sort((a, b) => {
    const rankDiff = EVIDENCE_RANK[a.evidence] - EVIDENCE_RANK[b.evidence]
    if (rankDiff !== 0) return rankDiff
    // 无 calls 视为 -1，排在同 evidence 内有 calls 者之后
    const callsDiff = (b.calls ?? -1) - (a.calls ?? -1)
    if (callsDiff !== 0) return callsDiff
    return a.id.localeCompare(b.id)
  })
  return result
}
