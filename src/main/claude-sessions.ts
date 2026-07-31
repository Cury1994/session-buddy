import { execSync } from 'node:child_process'
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
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
 *   - projects/<proj>/<sessionId>.jsonl → transcript（ctxPct 估算真源，§6.8.2e；亦为显示名来源 ①）
 *
 * 显示名（name）优先级链：
 *   ① transcript 首条可读用户消息文本（头部限读 64KB，绝不全文读；跳过 system-reminder 整段包裹 / 纯 tool_result 记录）
 *   ② session json 的 name 字段（Claude Code 自带）
 *   ③ basename(cwd)  ④ 'unknown'
 *   （旧版恒取 basename(cwd)，但所有会话 cwd 均为 /home/cury → 全部显示 "cury"，无区分度，故改）
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

/** 尾部读取窗口：256KB。末条 usage 记录总在此范围内 */
const TAIL_BYTES = 262144

/**
 * 与 statusline.py `used_tokens()` 一致：末条 usage 的三项之和。
 *
 * 审查 P2-2：transcript 可达数十 MB，整份 readFileSync 会同步阻塞主进程事件循环
 * （discoverSessions 3s 一轮）。改为尾部增量读——最后一条含 usage 的记录总在文件
 * 末尾附近，故只读最后 256KB：
 *   size ≤ 256KB → 全读；
 *   size  > 256KB → openSync + readSync 读尾部 256KB → 丢弃可能被截断的首段 →
 *                   从尾向前扫描第一条 parse 成功且含 usage 的记录。
 * 语义不变：尾读结果与全读一致（末条 usage 必在尾部窗口内）。文件不可读/不存在 → 0。
 */
function usedTokens(transcriptPath: string): number {
  if (!transcriptPath || !existsSync(transcriptPath)) return 0

  let lines: string[]
  try {
    const size = statSync(transcriptPath).size
    let content: string
    if (size <= TAIL_BYTES) {
      content = readFileSync(transcriptPath, 'utf8')
    } else {
      const fd = openSync(transcriptPath, 'r')
      try {
        const buf = Buffer.allocUnsafe(TAIL_BYTES)
        readSync(fd, buf, 0, TAIL_BYTES, size - TAIL_BYTES)
        content = buf.toString('utf8')
      } finally {
        closeSync(fd)
      }
      // 尾读首行可能被截断为非法 JSON，丢弃（全读路径无需丢弃，故仅此分支执行）
      lines = content.split('\n')
      lines.shift()
      return scanUsageFromTail(lines)
    }
    lines = content.split('\n')
  } catch {
    return 0
  }
  return scanUsageFromTail(lines)
}

/**
 * 从尾向前扫描第一条 parse 成功且含 usage 的记录（兼容 message.usage 与顶层 usage
 * 两种位置，与原全读实现一致），返回 input + cache_read + cache_creation 之和。
 */
function scanUsageFromTail(lines: string[]): number {
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
      const last = usage as Record<string, unknown>
      const num = (k: string): number => {
        const v = last[k]
        return typeof v === 'number' && Number.isFinite(v) ? v : 0
      }
      return num('input_tokens') + num('cache_read_input_tokens') + num('cache_creation_input_tokens')
    }
  }
  return 0
}

// ─── 会话显示名（transcript 首条用户消息 → json name → cwd basename） ───

/** 头部读取窗口：64KB。首条用户消息总在文件头部几 KB 内；窗口内找不到就放弃，绝不全文读 */
const HEAD_BYTES = 65536

/** 标题最大长度，超出截断 + "…"（卡片 CSS 已有 ellipsis，此截断为控 IPC 载荷与 tooltip 可读性） */
const TITLE_MAX = 60

/**
 * 标题化清洗 + 截断（命名链 ① 与 ② 共用）。清洗后为空返回 null（调用方继续下一候选）。
 *
 * ① 整段剥除 `<system-reminder>...</system-reminder>` 与 `<local-command-caveat>...</local-command-caveat>`
 *    （两者均为 harness 追加的样板噪音、非用户内容，可跨行；蓝图勘误：实测发现 caveat 标签
 *    不在原始 4 标签剥除清单内，整条记录被其占据 → 与 system-reminder 同列整段剥除）
 * ② 剥除斜杠命令标签 `<command-name>` / `<command-message>` / `<command-args>` /
 *    `<local-command-stdout>`（开闭标签均剥，保留内部文本，如 `<command-name>/loop</command-name>` → "/loop"）
 * ③ trim → 取第一个非空行 → 连续空白折叠为单空格
 * ④ 超 TITLE_MAX 字符 → 截断 + "…"
 */
function toTitle(text: unknown): string | null {
  if (typeof text !== 'string') return null
  let t = text.replace(
    /<(?:system-reminder|local-command-caveat)>[\s\S]*?<\/(?:system-reminder|local-command-caveat)>/g,
    ''
  )
  t = t.replace(/<\/?(?:command-name|command-message|command-args|local-command-stdout)>/g, '')
  for (const line of t.split('\n')) {
    const collapsed = line.replace(/\s+/g, ' ').trim()
    if (collapsed) return collapsed.length > TITLE_MAX ? `${collapsed.slice(0, TITLE_MAX)}…` : collapsed
  }
  return null
}

/**
 * 提取 transcript 头部第一条可读用户消息，返回标题化结果（命名链 ① 真源）。
 *
 * 只读头部 64KB（openSync+readSync 限窗，与 usedTokens 尾读同款手法；transcript 可达
 * 数十 MB，🚫 绝不可 readFileSync 全文读）。逐行 JSON.parse，找第一个 type==="user"
 * 且经 toTitle 清洗后非空的记录：
 *   - content 为 string → 直接用
 *   - content 为 block 数组 → 取第一个 type==="text" 块的 text
 *   - 纯 tool_result 回传（type 亦为 "user"，但 content 无 text 块）→ 跳过该记录继续扫
 *   - 清洗后为空（如整段 system-reminder 包装）→ 跳过该记录继续扫
 */
function firstUserText(transcriptPath: string): string | null {
  let content: string
  try {
    const fd = openSync(transcriptPath, 'r')
    try {
      const buf = Buffer.allocUnsafe(HEAD_BYTES)
      const n = readSync(fd, buf, 0, HEAD_BYTES, 0)
      content = buf.toString('utf8', 0, n)
    } finally {
      closeSync(fd)
    }
  } catch {
    return null
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let obj: unknown
    try {
      obj = JSON.parse(trimmed)
    } catch {
      continue // 窗口边界可能截断末行 → 非法 JSON，跳过
    }
    if (typeof obj !== 'object' || obj === null) continue
    const record = obj as Record<string, unknown>
    if (record['type'] !== 'user') continue

    const msg = record['message']
    if (typeof msg !== 'object' || msg === null) continue
    const c = (msg as Record<string, unknown>)['content']

    let text: string | null = null
    if (typeof c === 'string') {
      text = c
    } else if (Array.isArray(c)) {
      for (const b of c) {
        if (typeof b !== 'object' || b === null) continue
        const block = b as Record<string, unknown>
        if (block['type'] === 'text' && typeof block['text'] === 'string') {
          text = block['text']
          break
        }
      }
    }
    if (text === null) continue // tool_result 回传或无 text 块 → 跳过该记录

    const title = toTitle(text)
    if (title) return title // 清洗后为空（如整段 system-reminder / local-command-caveat 包装）→ 继续扫下一条
  }
  return null
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
    const cwdName = cwd ? basename(cwd) : null

    // transcript 只定位一次：显示名头读（firstUserText）与 usedTokens 尾读共用路径，避免重复目录扫描
    const transcript = sessionId ? findTranscript(this.projectsDirs, sessionId) : null

    // 显示名优先级链（见文件头 doc）：
    //   ① transcript 首条可读用户消息（头部限读 64KB——transcript 可达数十 MB，全文读会同步阻塞
    //      主进程事件循环；首条用户消息总在文件头部几 KB 内，窗口内找不到就放弃）
    //   ② session json 的 name 字段（非空 string 才用，走同一 toTitle 清洗/截断）
    //   ③ basename(cwd)  ④ 'unknown'
    const jsonName = typeof raw.name === 'string' ? toTitle(raw.name) : null
    const name =
      (transcript ? firstUserText(transcript) : null) || jsonName || cwdName || 'unknown'

    // 状态判定（v3.2 简化）：进程存活 → busy，否则 idle + memory=0
    const alive = existsSync(`/proc/${pid}`)
    const status: SessionStatus = alive ? 'busy' : 'idle'
    const memoryMB = alive ? readMemoryMB(pid) : 0

    // ctxPct：与 statusline.py 同源
    let ctxPct = 0
    if (transcript) {
      const used = usedTokens(transcript)
      ctxPct = window > 0 ? Math.min(100, Math.round((used / window) * 100)) : 0
    }

    // uptimeSec：startedAt 异常 → 0
    let uptimeSec = 0
    if (startedAt > 0) {
      const sec = (now - startedAt) / 1000
      uptimeSec = sec >= 0 ? sec : 0
    }

    // 合并审批状态：匹配 name（会话主题）/ cwdName（旧版项目名语义的兼容保险）/ sessionId 三者任一
    // （approve.sh 主路径发 session_id；name 改为会话主题后仍保留 basename 匹配，为旧语义超集）
    const hasPendingApproval = pending.some(
      (a) =>
        a.session === name ||
        (cwdName !== null && a.session === cwdName) ||
        (sessionId !== '' && a.session === sessionId)
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
