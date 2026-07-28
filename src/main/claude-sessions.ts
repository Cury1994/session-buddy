import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

import type { ApprovalQueue } from './approval-queue'
import type { AppConfig, SessionInfo, SessionStatus } from '../shared/types'

/**
 * M6 — Claude Code Session 扫描器（v2.3 简化版，DESIGN §6.8）
 *
 * 仅扫 `config.harnesses['claude-code'].config_dirs` 列表（默认 ["~/.claude"]），
 * 不做多 profile 自动发现（§6.8.1）。每个 config_dir 下：
 *   - sessions 目录的 .json 文件 → session 元数据（pid / sessionId / cwd / startedAt）
 *   - projects/<proj>/<sessionId>.jsonl → transcript（ctxPct 估算真源，§6.8.2e）
 *
 * 状态判定（v3.2 简化）：`fs.existsSync(/proc/{pid})` 存活 → busy；不存在 → idle + memory=0。
 * 不做 CPU 阈值 / 进程树遍历。
 *
 * ctxPct 与用户 `~/.claude/statusline.py` **逐字同源**：
 *   used_tokens = 末条 usage 的 input_tokens + cache_read_input_tokens + cache_creation_input_tokens
 *   （兼容 message.usage 与顶层 usage 两种位置）；
 *   窗口：模型 id 含 [1m]/1m → 1_000_000，否则 200_000；
 *   ctxPct = min(100, round(used / window × 100))。
 *
 * ⚠ 与 DESIGN §6.8.2c 的偏差（实测驱动）：§6.8.2c 写「/proc/{pid}/stat 第 22 字段 (rss)」，
 *   实测 field 22 = starttime（进程启动时刻），**rss 实为 field 24**（Linux proc(5)）。
 *   用 field 22 会得到几十 GB 的荒谬值（与 VmRSS 相差百倍）。本实现取 field 24，
 *   与 /proc/{pid}/status 的 VmRSS 交叉验证一致（几百 MB 级，符合预期）。
 */

// ─── 系统页大小（/proc stat rss 以页为单位，缓存一次） ───

let cachedPageSize: number | null = null
function pageSize(): number {
  if (cachedPageSize !== null) return cachedPageSize
  try {
    // 注意：是 `PAGE_SIZE` 而非 `PAGESZ`（后者在 GNU getconf 不可识别）
    const out = execSync('getconf PAGE_SIZE', { encoding: 'utf8', timeout: 2000 }).trim()
    const n = parseInt(out, 10)
    cachedPageSize = Number.isFinite(n) && n > 0 ? n : 4096
  } catch {
    cachedPageSize = 4096
  }
  return cachedPageSize
}

// ─── 路径展开 ───

function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return p
}

// ─── ctxPct（移植自 statusline.py，逐字同源） ───

/** 与 statusline.py `context_window()` 一致：含 [1m]/1m → 1M，否则 200K */
function contextWindowForModel(modelId: string): number {
  const mid = (modelId || '').toLowerCase()
  if (mid.includes('[1m]') || mid.includes('1m')) return 1_000_000
  return 200_000
}

/** 与 statusline.py `used_tokens()` 一致：末条 usage 的三项之和 */
function usedTokens(transcriptPath: string): number {
  if (!transcriptPath || !existsSync(transcriptPath)) return 0
  let content: string
  try {
    content = readFileSync(transcriptPath, 'utf8')
  } catch {
    return 0
  }

  let last: Record<string, unknown> | null = null
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    let obj: unknown
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof obj !== 'object' || obj === null) continue
    const record = obj as Record<string, unknown>

    let usage: unknown
    const msg = record['message']
    if (typeof msg === 'object' && msg !== null) {
      usage = (msg as Record<string, unknown>)['usage']
    }
    if (!(typeof usage === 'object' && usage !== null)) {
      usage = record['usage']
    }
    if (typeof usage === 'object' && usage !== null) {
      last = usage as Record<string, unknown>
    }
  }

  if (!last) return 0
  const num = (k: string): number => {
    const v = last?.[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  return num('input_tokens') + num('cache_read_input_tokens') + num('cache_creation_input_tokens')
}

// ─── API provider / 模型解析（§6.8.2f） ───

interface ModelInfo {
  modelId: string // ANTHROPIC_DEFAULT_*_MODEL（驱动 ctxPct 窗口判定）
  providerName: string // ANTHROPIC_DEFAULT_*_MODEL_NAME（卡片 provider 徽章）
}

/** 优先取 SONNET，其次 OPUS / HAIKU，再退到任意 ANTHROPIC_DEFAULT_*_MODEL */
const MODEL_TIERS = ['SONNET', 'OPUS', 'HAIKU'] as const

function resolveModel(settingsPath: string): ModelInfo {
  let env: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      env?: Record<string, unknown>
    }
    if (parsed.env && typeof parsed.env === 'object') env = parsed.env
  } catch {
    return { modelId: '', providerName: 'unknown' }
  }

  const str = (v: unknown): string => (typeof v === 'string' ? v : '')

  for (const tier of MODEL_TIERS) {
    const id = str(env[`ANTHROPIC_DEFAULT_${tier}_MODEL`])
    if (id) {
      const name = str(env[`ANTHROPIC_DEFAULT_${tier}_MODEL_NAME`])
      return { modelId: id, providerName: name || id }
    }
  }

  const anyKey = Object.keys(env).find((k) => /^ANTHROPIC_DEFAULT_.+_MODEL$/.test(k))
  if (anyKey) {
    const tier = anyKey.replace(/^ANTHROPIC_DEFAULT_/, '').replace(/_MODEL$/, '')
    const id = str(env[anyKey])
    const name = str(env[`ANTHROPIC_DEFAULT_${tier}_MODEL_NAME`])
    return { modelId: id, providerName: name || id || 'unknown' }
  }

  return { modelId: '', providerName: 'unknown' }
}

// ─── 进程内存（§6.8.2c，field 24 = rss） ───

function readMemoryMB(pid: number): number {
  try {
    const raw = readFileSync(`/proc/${pid}/stat`, 'utf8')
    // comm（field 2）可能含空格/括号，必须以最后一个 ')' 为界切分
    const closeParen = raw.lastIndexOf(')')
    if (closeParen < 0) return 0
    // slice(closeParen+2) 跳过 ") "；fields[0]=state(field 3)，故 field N = fields[N-3]
    const fields = raw.slice(closeParen + 2).split(' ')
    const rssPages = parseInt(fields[24 - 3] ?? '', 10)
    if (!Number.isFinite(rssPages) || rssPages <= 0) return 0
    return Math.round((rssPages * pageSize()) / 1024 / 1024)
  } catch {
    return 0
  }
}

// ─── transcript 定位（§6.8.2e，glob projects/*/<id>.jsonl，不引入 glob 库） ───

function findTranscript(projectsDirs: string[], sessionId: string): string | null {
  for (const projectsDir of projectsDirs) {
    let entries: string[]
    try {
      entries = readdirSync(projectsDir)
    } catch {
      continue
    }
    for (const sub of entries) {
      const candidate = join(projectsDir, sub, `${sessionId}.jsonl`)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

// ─── session json 原始结构 ───

interface RawSessionFile {
  pid?: unknown
  sessionId?: unknown
  cwd?: unknown
  startedAt?: unknown
  status?: unknown
  [k: string]: unknown
}

export class ClaudeCodeSessionScanner {
  private readonly sessionsDirs: string[]
  private readonly projectsDirs: string[]
  private readonly settingsPath: string
  private readonly approvalQueue: ApprovalQueue
  /** 调度器每轮写入，供 server getSessions 同步读取 */
  private latestSessions: SessionInfo[] = []

  constructor(config: AppConfig, approvalQueue: ApprovalQueue) {
    const cc = config.harnesses['claude-code']
    const dirs = (cc.config_dirs && cc.config_dirs.length > 0 ? cc.config_dirs : ['~/.claude']).map(
      expandHome
    )
    this.sessionsDirs = dirs.map((d) => join(d, 'sessions'))
    this.projectsDirs = dirs.map((d) => join(d, 'projects'))
    this.settingsPath = expandHome(cc.settings_path || '~/.claude/settings.json')
    this.approvalQueue = approvalQueue
  }

  /** 同步读取上一轮扫描缓存（createServer 的 getSessions 注入口用） */
  getSessions(): SessionInfo[] {
    return this.latestSessions
  }

  /** 扫描全部 config_dirs，返回按 startedAt 降序的 session 列表；同时刷新内部缓存。 */
  async discoverSessions(): Promise<SessionInfo[]> {
    const model = resolveModel(this.settingsPath)
    const window = contextWindowForModel(model.modelId)
    const now = Date.now()
    const pending = this.approvalQueue.getAll()

    const seen = new Set<string>() // 按 sessionId 去重（abtop BTreeSet 语义）
    const results: SessionInfo[] = []

    for (const dir of this.sessionsDirs) {
      let files: string[]
      try {
        files = readdirSync(dir).filter((f) => f.endsWith('.json'))
      } catch (err) {
        console.warn(`[claude-sessions] readdir 失败 ${dir}: ${(err as Error).message}`)
        continue
      }

      for (const file of files) {
        const info = this.parseSessionFile(join(dir, file), model, window, now, pending)
        if (!info) continue
        if (seen.has(info.sessionId)) continue
        seen.add(info.sessionId)
        results.push(info)
      }
    }

    results.sort((a, b) => b.startedAt - a.startedAt)
    this.latestSessions = results
    return results
  }

  private parseSessionFile(
    filePath: string,
    model: ModelInfo,
    window: number,
    now: number,
    pending: { session: string }[]
  ): SessionInfo | null {
    let raw: RawSessionFile
    try {
      raw = JSON.parse(readFileSync(filePath, 'utf8')) as RawSessionFile
    } catch (err) {
      console.warn(`[claude-sessions] 解析失败 ${filePath}: ${(err as Error).message}`)
      return null
    }

    const pid = typeof raw.pid === 'number' ? raw.pid : 0
    // 字段清理（§6.8.2b）：pid=0 跳过；排除自身 electron 进程
    if (pid === 0) return null
    if (pid === process.pid) return null
    // abtop 语义（§6.8.2 step 3）：已结束的 session 不展示
    if (raw.status === 'done') return null

    const sessionId =
      typeof raw.sessionId === 'string' ? raw.sessionId.slice(0, 256) : ''
    const cwd = typeof raw.cwd === 'string' ? raw.cwd.slice(0, 4096) : ''
    const startedAt =
      typeof raw.startedAt === 'number' && Number.isFinite(raw.startedAt) && raw.startedAt > 0
        ? raw.startedAt
        : 0
    const name = cwd ? basename(cwd) : 'unknown'

    // 状态判定（v3.2 简化）：进程存活 → busy，否则 idle + memory=0
    const alive = existsSync(`/proc/${pid}`)
    const status: SessionStatus = alive ? 'busy' : 'idle'
    const memoryMB = alive ? readMemoryMB(pid) : 0

    // ctxPct：与 statusline.py 同源
    let ctxPct = 0
    if (sessionId) {
      const transcript = findTranscript(this.projectsDirs, sessionId)
      if (transcript) {
        const used = usedTokens(transcript)
        ctxPct = window > 0 ? Math.min(100, Math.round((used / window) * 100)) : 0
      }
    }

    // uptimeSec：startedAt 异常 → 0
    let uptimeSec = 0
    if (startedAt > 0) {
      const sec = (now - startedAt) / 1000
      uptimeSec = sec >= 0 ? sec : 0
    }

    // 合并审批状态：session 字段匹配 name（项目名）或 sessionId
    const hasPendingApproval = pending.some(
      (a) => a.session === name || (sessionId !== '' && a.session === sessionId)
    )

    return {
      sessionId,
      pid,
      name,
      status,
      tool: 'Bash', // v1 固定（审批匹配用）
      apiProvider: model.providerName,
      uptimeSec,
      memoryMB,
      ctxPct,
      cwd,
      startedAt,
      hasPendingApproval
    }
  }
}
