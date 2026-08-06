import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { CcSwitchUsageReader } from './cc-switch-usage'
import type { AppConfig, CalledApi } from '../shared/types'

/**
 * M13.2 — 检测器注册表（可插拔）：发现所有"调用过的 API"
 *
 * 三个检测器，合并产出 CalledApi[]：
 *   ① manual（恒生效）——遍历 config.usage_sources，配置声明过的 API 恒出卡，
 *      兜底保证：即使所有自动检测器失效，已配置的用量源也不会消失。
 *   ② cc-switch（config.detection.cc_switch.enabled 时尝试）——读 cc-switch 本地库
 *      proxy_request_logs 按 provider_id 分组（含请求数）。db 不存在 / 打不开 /
 *      查询失败 → CcSwitchUsageReader 内部 warn + 返回 []，等价于跳过该检测器（NFR-3 不崩）。
 *      产出 id = cc-switch provider_id（与 usage_sources.id 不对应，桥接靠 detect_ids，M13.6 卡片匹配用）。
 *   ③ claude-sessions（config.detection.claude_sessions.enabled 时）——扫
 *      config.harnesses['claude-code'].sessions_glob 的 session json，读每个 session
 *      用过的 model 名。优先读 json 的 model 字段（最轻）；当前 Claude Code 版本的
 *      session json 无该字段（本机实测 keys 无 model）→ 读对应 transcript 尾部 256KB
 *      逆扫 message.model（复用 claude-sessions.ts tailFacts 的尾部读思路，独立轻量实现）。
 *
 * 合并规则（以 id 去重）：
 *   - evidence 保留高优先级：cc-switch > transcript > manual
 *   - name：manual 优先（配置声明的展示名最用户友好，如 "阿里云百炼" 优于 cc-switch 的
 *     "阿里云百炼-coding模型"）；无 manual 项时取高优先级 evidence 的 name
 *   - calls：取最大值（两者皆无则保持 undefined，不伪造 0）
 * 排序：evidence 优先级 → calls 降序（无 calls 者靠后）→ id 升序（确定性输出）。
 *
 * 性能约束：claude-sessions 检测器只读小 session json + transcript 尾部小块（256KB 上限），
 * 绝不全量读大 transcript；session 数超过 MAX_SESSIONS 时只取最近修改的 N 个。
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

/** claude-sessions 检测器单次最多扫描的 session 数（扫描成本上限，取最近修改者） */
const MAX_SESSIONS = 50

/** transcript 尾部读取窗口（与 claude-sessions.ts TAIL_BYTES 同源约定）：末条 message.model 总在此范围内 */
const TAIL_BYTES = 262144

// ─── 工具 ───

/** `~` / `~/…` 展开为 home（同 config / claude-sessions / cc-switch-usage 的约定） */
function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return p
}

/** 简易 glob（仅支持 `*`，匹配单段内任意字符）→ 精确 RegExp */
function globPatternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')
  return new RegExp(`^${escaped}$`)
}

// ─── ③ claude-sessions 检测器内部：transcript 定位与尾部读 ───

/** session json 只有 sessionId，transcript 位于 <configDir>/projects/<proj>/<sessionId>.jsonl */
function findTranscript(projectsDir: string, sessionId: string): string | null {
  let entries: string[]
  try {
    entries = readdirSync(projectsDir)
  } catch {
    return null
  }
  for (const sub of entries) {
    const candidate = join(projectsDir, sub, `${sessionId}.jsonl`)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * 尾部限读 transcript，逆扫提取最后一条 message.model（API 实际返回的模型名）。
 * 手法与 claude-sessions.ts tailFacts 的尾读一致（size ≤ 256KB 全读；否则 openSync +
 * readSync 读尾部 256KB、丢弃可能截断的首行），此处只取单量、找到即早退，保持轻量。
 * 文件不可读 / 无 model 记录 → null。
 */
function lastModelFromTranscript(transcriptPath: string): string | null {
  let lines: string[]
  try {
    const size = statSync(transcriptPath).size
    if (size <= TAIL_BYTES) {
      lines = readFileSync(transcriptPath, 'utf8').split('\n')
    } else {
      const fd = openSync(transcriptPath, 'r')
      let content: string
      try {
        const buf = Buffer.allocUnsafe(TAIL_BYTES)
        readSync(fd, buf, 0, TAIL_BYTES, size - TAIL_BYTES)
        content = buf.toString('utf8')
      } finally {
        closeSync(fd)
      }
      lines = content.split('\n')
      lines.shift() // 尾读首行可能被截断为非法 JSON，丢弃
    }
  } catch {
    return null
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = (lines[i] ?? '').trim()
    if (!line) continue
    let obj: unknown
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof obj !== 'object' || obj === null) continue
    const msg = (obj as Record<string, unknown>)['message']
    if (typeof msg === 'object' && msg !== null) {
      const m = (msg as Record<string, unknown>)['model']
      if (typeof m === 'string' && m !== '') return m
    }
  }
  return null
}

/**
 * 单个 session 用过的 model：优先 session json 的 model 字段（最轻，未来 Claude Code
 * 版本若内置该字段即零 transcript IO）；无则经 sessionId 定位 transcript 尾读。
 */
function modelOfSession(sessionFilePath: string, projectsDir: string): string | null {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(readFileSync(sessionFilePath, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
  const model = raw['model']
  if (typeof model === 'string' && model !== '') return model

  const sessionId = raw['sessionId']
  if (typeof sessionId !== 'string' || sessionId === '') return null
  const transcript = findTranscript(projectsDir, sessionId)
  if (transcript === null) return null
  return lastModelFromTranscript(transcript)
}

/**
 * claude-sessions 检测器：扫 sessions_glob 命中的 session json，收集用过的 model 名去重。
 * 目录不可读 → warn + []（不崩）。只取最近修改的 MAX_SESSIONS 个 session（成本上限）。
 */
function detectFromSessions(config: AppConfig): CalledApi[] {
  const cc = config.harnesses?.['claude-code']
  const glob = cc?.sessions_glob || '~/.claude/sessions/*.json'
  const expanded = expandHome(glob)
  const sessionsDir = dirname(expanded)
  const fileRe = globPatternToRegExp(basename(expanded))
  // sessions 目录的父目录即 Claude config 目录（~/.claude），transcript 在其 projects/ 下
  const projectsDir = join(dirname(sessionsDir), 'projects')

  let files: string[]
  try {
    files = readdirSync(sessionsDir)
  } catch (err) {
    console.warn(`[detectors] sessions 目录不可读 ${sessionsDir}: ${(err as Error).message}`)
    return []
  }

  const entries: { path: string; mtimeMs: number }[] = []
  for (const f of files) {
    if (!fileRe.test(f)) continue
    const p = join(sessionsDir, f)
    try {
      entries.push({ path: p, mtimeMs: statSync(p).mtimeMs })
    } catch {
      continue // 枚举间隙被删 / 无权限 → 跳过
    }
  }
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs)

  const models = new Map<string, CalledApi>()
  for (const entry of entries.slice(0, MAX_SESSIONS)) {
    const model = modelOfSession(entry.path, projectsDir)
    if (model === null || models.has(model)) continue
    models.set(model, { id: model, name: model, evidence: 'transcript' })
  }
  return [...models.values()]
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

  // ③ claude-sessions 检测器：扫 session json / transcript 尾部拿 model 名
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
