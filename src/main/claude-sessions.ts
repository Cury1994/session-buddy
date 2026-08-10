import { execSync, spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readlinkSync,
  readSync,
  readdirSync,
  statSync
} from 'node:fs'
import { homedir, hostname, userInfo } from 'node:os'
import { basename, join } from 'node:path'

import { contextForModel } from './vendor-registry'

import type { ApprovalQueue } from './approval-queue'
import type { SessionDetailScanner } from './session-detail'
import type { AppConfig, SessionInfo, SessionStatus } from '../shared/types'

/**
 * M6 — Claude Code Session 扫描器（v2.3 简化版，DESIGN §6.8）
 *
 * 仅扫 `config.harnesses['claude-code'].config_dirs` 列表（默认 ["~/.claude"]），
 * 不做多 profile 自动发现（§6.8.1）。每个 config_dir 下：
 *   - sessions 目录的 .json 文件 → session 元数据（pid / sessionId / cwd / startedAt）
 *   - projects/<proj>/<sessionId>.jsonl → transcript（ctxPct 估算真源，§6.8.2e；亦为显示名来源 ①）
 *
 * 显示名（name）＝ 终端窗口标题推导值（与 ~/.bashrc 的 `\e]0;\u@\h: \w\a` 规则逐字同源）：
 *   `user@host: cwd`（如 `cury@cury-ThinkBook-14-G4-ARA: /home/cury/harness-monitor`）。
 *   Wayland 下应用无法直读真实终端窗口标题（GNOME Shell Introspect 拒绝 / xdotool 只对
 *   X11 可见，见 2026-08-08 调研），故按终端同一标题规则用会话真实 cwd 推导。
 *   cwd 取 transcript 尾读 lastCwd → session json cwd 降级；无 cwd → 仅 `user@host: `。
 *   （旧命名链：transcript 首条用户消息 → json name → basename(cwd)，2026-08-08 应需求移除）
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
 *
 * ─── 用户反馈四修（fix(M6-M9)）追加说明 ───
 *
 * kind 过滤（F1）：
 *   session json 的 `kind` 字段存在且 !== 'interactive'（如 "bg"——/clear 等后台任务会话，
 *   常带 jobId 且长期驻留 sessions 目录）→ 整条跳过，不展示。旧版 Claude Code 可能无
 *   kind 字段 → 按 interactive 放行（兼容策略：宁可多显示，不误杀旧版会话）。
 *
 * 尾窗一次读取、同时提取三事（F2，tailFacts）：
 *   单次 256KB 尾部窗口读同时逆扫提取（不增加 IO）：
 *     ① usedTokens —— 末条 usage 三项和（ctxPct 计算源，语义与原 usedTokens 逐字一致）
 *     ② lastCwd —— 最后一条含 cwd 记录的 cwd（Claude Code 随实际工作目录动态更新，
 *        是"当前真实项目路径"真源；session json 的 cwd 恒为启动目录，仅作降级）
 *     ③ lastModel —— 最后一条 message.model（API 实际返回的模型 id 真源；本机经代理
 *        cc-switch 转发后 settings 的 *_MODEL_NAME 是陈旧别名，故 transcript 优先）
 *   接线：显示 cwd = lastCwd → json cwd 降级；apiProvider = lastModel → settings 解析降级。
 *   ctxPct 分母 = **实际后端模型的上限**：优先用 transcript 末条 message.model（代理改写
 *     后的真实模型名），经 contextWindowForModel 分层解析（config.context_lengths 前缀匹配 →
 *     vendor-registry 内置模板 → [1m] 启发式，与 statusline 同源兜底）。切换 API 后随 lastModel 更新。
 *
 * 关闭终端语义（F3，closeTerminalOfPid）：
 *   不再直接 SIGTERM claude 进程（旧 FR-2.8，终端窗口仍残留）。新链路：
 *     /proc/<pid>/fd/0（stdin）readlink → /dev/pts/N（控制终端）→ 取其设备号（rdev）→
 *     枚举 /proc/[0-9]+/stat 收集 tty_nr（field 7）相同的全部进程 → 取其中 ppid 不在
 *     集合内的根进程（pts 上的根 shell）→ SIGTERM 根 shell → 终端模拟器关闭该窗口/标签
 *     → claude 随 pty hangup（SIGHUP）退出 ＝ "真的关掉那一个终端窗口"。
 *   无控制终端的后台会话（fd/0 不指向 /dev/pts/）→ false（UI 提示"无终端窗口"）。
 *
 * 跳转终端聚焦（#5，findTerminalAncestor / focusExistingTerminal）：
 *   「打开会话终端」优先**跳到会话所在的那个终端窗口**而不是开新窗口。
 *   X11 精确聚焦链路：claude pid 沿 ppid 上行找终端模拟器祖先进程（comm ∈ TERMINAL_COMMS）→
 *   xdotool search --pid <祖先 pid> 取窗口 id → 多窗口时按标题含 basename(cwd) 筛选 →
 *   xdotool windowactivate 聚焦。原生 Wayland 窗口对 xdotool（X11 工具）不可见 →
 *   search 空 → false → 调用方（ipc-handlers session:jump-terminal）自动降级既有 spawn 链
 *   开新窗口，cwd 落会话真实项目路径（F2 transcript 尾读真值）——Wayland 下这是主路径。
 *   xdotool 为**可选依赖**：不随项目安装，运行时 `command -v` 检测，缺失即降级，不报错。
 */

// ─── 终端标题推导（显示名，2026-08-08） ───
// 与 ~/.bashrc 的 `\e]0;\u@\h: \w\a` 规则逐字同源：`user@host: cwd`。
// 宿主标识进程内不变，取一次缓存（userInfo 失败回退 process.env.USER，hostname 失败回退 'host'）。
const TERMINAL_TITLE_USER: string = (() => {
  try {
    const u = userInfo().username
    if (u) return u
  } catch {
    /* 回退 */
  }
  return process.env.USER || 'user'
})()
const TERMINAL_TITLE_HOST: string = (() => {
  try {
    const h = hostname()
    if (h) return h
  } catch {
    /* 回退 */
  }
  return 'host'
})()

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

/**
 * 上下文窗口（ctxPct 分母），M17.1 分层解析（替换旧 MODEL_CONTEXT_WINDOWS 硬编码表）：
 *   ① config.context_lengths 前缀匹配（长键优先）→ entry.len 即分母
 *      （manual/registry/heuristic 三种来源的条目值一律作分母——来源只决定可否被
 *        自动回填覆盖，不影响分母语义；条目非法/len 非正数 → 视作未命中继续下一层）
 *   ② vendor-registry contextForModel（内置厂商模板 modelContext，前缀匹配）→ len
 *   ③ 启发式兜底（与 statusline 同源）：模型 id 含 [1m]/1m → 1M，否则 200K
 * 后端模型名可能带日期后缀（如 deepseek-v4-flash-0731），故各层均按前缀匹配。
 * 导出供裸 node 验收测试直接驱动。
 */
export function contextWindowForModel(modelId: string, config: AppConfig): number {
  const mid = (modelId || '').toLowerCase().trim()
  if (mid === '') return 200_000

  // ① 用户配置表（前缀匹配，长键优先——防止短键误命中更长前缀的模型）
  const entries = config.context_lengths ?? {}
  const keys = Object.keys(entries).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (key === '' || !mid.startsWith(key.toLowerCase())) continue
    const entry = entries[key]
    if (
      entry !== undefined &&
      typeof entry.len === 'number' &&
      Number.isFinite(entry.len) &&
      entry.len > 0
    ) {
      return entry.len
    }
  }

  // ② 内置厂商 registry（deepseek-v4-pro/flash → 1M 等实测值）
  const reg = contextForModel(mid)
  if (reg !== null) return reg.len

  // ③ 启发式兜底（与 statusline 同源）
  if (mid.includes('[1m]') || mid.includes('1m')) return 1_000_000
  return 200_000
}

/** 尾部读取窗口：256KB。末条 usage / cwd / model 记录总在此范围内 */
const TAIL_BYTES = 262144

/**
 * 「执行中」判定窗口：进程存活且 transcript 最近写入（mtime）在此毫秒数内 → recentlyActive。
 * transcript 随 Claude Code 每轮活动更新，空闲会话停在提示符时停止写入，故 mtime 是
 * "正在执行任务"的廉价真源（无需额外解析）。仅对存活会话有意义。
 *
 * 15s = 5× 轮询间隔(3s)：兼顾及时性（停止写入 ≤15s 内翻「空闲」）与对短暂停顿的容忍
 * （长工具执行中 transcript 可能几秒不写，窗口过小会误判空闲）。先前 60s 导致
 * 「执行中→空闲」变更过慢（用户 2026-08-06 反馈）。
 */
const ACTIVE_WINDOW_MS = 15_000

/**
 * 单次尾窗读同时提取的四件事（F2，见文件头说明）：
 *   usedTokens  —— ctxPct 计算源（末条 usage 三项和）
 *   lastCwd     —— 实际工作目录（最后一条含 cwd 的记录；Claude Code 随 cd 动态更新）
 *   lastModel   —— API 实际返回的模型 id（最后一条 message.model）
 *   lastActivity—— 最近一条可读对话/任务内容（message.content 清洗后截断 120；尽力而为，
 *                  不参与早退门槛，扫不到为 null —— 见 scanTailFacts 注释）
 */
export interface TailFacts {
  usedTokens: number
  lastCwd: string | null
  lastModel: string | null
  lastActivity: string | null
}

const ZERO_TAIL: TailFacts = {
  usedTokens: 0,
  lastCwd: null,
  lastModel: null,
  lastActivity: null
}

/**
 * 尾读 transcript 一次，逆扫同时提取三件事（不增加 IO）。
 *
 * 审查 P2-2（原 usedTokens 同款手法继承）：transcript 可达数十 MB，整份 readFileSync
 * 会同步阻塞主进程事件循环（discoverSessions 3s 一轮）。三项事实所需的**最后**一条
 * 记录均在文件末尾附近，故只读最后 256KB：
 *   size ≤ 256KB → 全读；
 *   size  > 256KB → openSync + readSync 读尾部 256KB → 丢弃可能被截断的首段 →
 *                   从尾向前扫描，四个量各自独立累积。
 * 文件不可读/不存在 → 零值对象（调用方按降级链处理）。
 */
function tailFacts(transcriptPath: string): TailFacts {
  if (!transcriptPath || !existsSync(transcriptPath)) return ZERO_TAIL

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
      return scanTailFacts(lines)
    }
    lines = content.split('\n')
  } catch {
    return ZERO_TAIL
  }
  return scanTailFacts(lines)
}

/**
 * 从尾向前扫描，四件事各自独立累积：某项已找到即不再覆盖（逆序首命中＝正序"最末"）。
 *   ① usedTokens：首条含 usage 记录（兼容 message.usage 与顶层 usage 两位置）的
 *      input + cache_read + cache_creation 之和（与 statusline.py used_tokens() 逐字同源）
 *   ② lastCwd：首条（逆序）cwd 为 string 的记录之 cwd
 *   ③ lastModel：首条（逆序）message.model 为 string 的记录之模型 id
 *   ④ lastActivity：首条（逆序）message.content 清洗非空的记录之可读文本（截断 120）
 *
 * 早退门槛仅含前三事（usedTokens && lastCwd && lastModel）：lastActivity 尽力而为，
 * 不参与门槛 —— 某些会话尾部全是 tool_result / usage 记录时可读文本难得，若将其纳入
 * 门槛会迫使扫满整个 256KB 窗口甚至（理论上）死等，违背"窗口扫完即止"约束。
 * 前三事齐备即提前退出；lastActivity 在同一轮扫描中顺势提取，扫不到随窗口扫尽为 null。
 */
function scanTailFacts(lines: string[]): TailFacts {
  const facts: TailFacts = { usedTokens: 0, lastCwd: null, lastModel: null, lastActivity: null }
  let tokensFound = false

  for (let i = lines.length - 1; i >= 0; i--) {
    if (tokensFound && facts.lastCwd !== null && facts.lastModel !== null) break // 前三事齐备（lastActivity 不参与门槛）
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

    // ① usage（兼容 message.usage 与顶层 usage 两种位置，与原全读实现一致）
    if (!tokensFound) {
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
        facts.usedTokens =
          num('input_tokens') + num('cache_read_input_tokens') + num('cache_creation_input_tokens')
        tokensFound = true
      }
    }

    // ② cwd（每条记录自带 cwd 字段，Claude Code 随实际工作目录更新）
    if (facts.lastCwd === null && typeof record['cwd'] === 'string') {
      facts.lastCwd = record['cwd'] as string
    }

    // ③ message.model（assistant 记录的 API 实际返回模型）
    if (facts.lastModel === null) {
      const msg = record['message']
      if (typeof msg === 'object' && msg !== null) {
        const m = (msg as Record<string, unknown>)['model']
        if (typeof m === 'string' && m !== '') facts.lastModel = m
      }
    }

    // ④ lastActivity（尽力而为）：首条（逆序）message.content 清洗非空者。
    //    content 为 string 或 text-block 数组；tool_result 无 text 块 → extractContentText 返 null 跳过
    if (facts.lastActivity === null) {
      const msg = record['message']
      if (typeof msg === 'object' && msg !== null) {
        const rawText = extractContentText((msg as Record<string, unknown>)['content'])
        if (rawText !== null) {
          const activity = toActivity(rawText)
          if (activity !== null) facts.lastActivity = activity
        }
      }
    }
  }
  return facts
}

// ─── lastActivity / content 提取（F2，session-detail.ts 复用） ───

/** lastActivity 截断长度（F2，保留更长上下文供卡片单行预览） */
const ACTIVITY_MAX = 120

/**
 * lastActivity 清洗 + 截断（F2，与 toTitle 同源思路，刻意另写以保留更长文本）。
 *   ① 整段剥除 `<system-reminder>` / `<local-command-caveat>`（同 toTitle）
 *   ② 剥除斜杠命令 4 标签保留内部文本（同 toTitle）
 *   ③ 折叠全部空白（含换行）为单空格 → 单行摘要（卡片单行 ellipsis 展示）
 *   ④ 超 ACTIVITY_MAX 字符 → 截断 + "…"
 * 清洗后为空返回 null（调用方据此跳过该记录继续逆扫）。
 * 导出供 session-detail.ts 复用（M16 B1：消息尾流清洗同源，避免两处规则漂移）。
 */
export function toActivity(text: unknown): string | null {
  if (typeof text !== 'string') return null
  let t = text.replace(
    /<(?:system-reminder|local-command-caveat)>[\s\S]*?<\/(?:system-reminder|local-command-caveat)>/g,
    ''
  )
  t = t.replace(/<\/?(?:command-name|command-message|command-args|local-command-stdout)>/g, '')
  const collapsed = t.replace(/\s+/g, ' ').trim()
  if (!collapsed) return null
  return collapsed.length > ACTIVITY_MAX ? `${collapsed.slice(0, ACTIVITY_MAX)}…` : collapsed
}

/**
 * 从 message.content 提取可读文本（F2 lastActivity 取块逻辑）：
 *   content 为 string → 直接返回；为 block 数组 → 取第一个 type==="text" 块的 text；
 *   tool_result 等无 text 块的记录 → null（调用方跳过该记录）。
 * 导出供 session-detail.ts 复用（M16 B1）。
 */
export function extractContentText(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    for (const b of content) {
      if (typeof b !== 'object' || b === null) continue
      const block = b as Record<string, unknown>
      if (block['type'] === 'text' && typeof block['text'] === 'string') {
        return block['text']
      }
    }
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

// ─── 关闭终端（F3，session:terminate 新语义） ───

/**
 * "关闭该会话所在的那一个终端窗口"（取代旧 FR-2.8 直杀 claude 进程）。
 *
 * 进程树实测：claude(pid, pts/N) ← bash(pts/N) ← gnome-terminal-server。
 * 链路：/proc/<pid>/fd/0（stdin）readlink → /dev/pts/N → 取 tty 设备号（statSync.rdev，
 * pts 设备号 = major<<8|minor，与 /proc/[0-9]+/stat field 7 tty_nr 编码一致，可直接比较）→
 * 枚举共享该 tty 的全部进程 → 取其中 ppid 不在集合内的根进程（pts 上的根 shell）→
 * SIGTERM 根 shell → 终端模拟器关闭该窗口/标签 → claude 随 pty hangup（SIGHUP）退出。
 *
 * 纯函数（无 electron 依赖），导出供裸 node 验收与 ipc-handlers 复用。
 * 任何一步失败（含无控制终端的后台会话：fd/0 不以 /dev/pts/ 开头）→ false。
 */
export function closeTerminalOfPid(pid: number): boolean {
  // 安全守卫：非法 pid / 自身进程 / init 一律拒绝
  if (pid <= 0 || pid === process.pid || pid === 1) return false

  // 1. stdin 软链 → 控制终端路径（必须以 /dev/pts/ 开头；后台会话无 pty → false）
  let ttyPath: string
  try {
    ttyPath = readlinkSync(`/proc/${pid}/fd/0`)
  } catch {
    return false
  }
  if (!ttyPath.startsWith('/dev/pts/')) return false

  // 2. tty 设备号（pts：(major<<8)|minor，与 stat field 7 tty_nr 同编码）
  let ttyDev: number
  try {
    ttyDev = statSync(ttyPath).rdev
  } catch {
    return false
  }

  // 3. 枚举共享同一 tty 的进程集合（pid → ppid）。
  //    /proc/[0-9]+/stat 解析沿用 readMemoryMB：lastIndexOf(')') 后切分，field N = arr[N-3]
  //    → arr[1]=ppid(field 4)、arr[4]=tty_nr(field 7)
  const members = new Map<number, number>()
  let procEntries: string[]
  try {
    procEntries = readdirSync('/proc')
  } catch {
    return false
  }
  for (const entry of procEntries) {
    if (!/^\d+$/.test(entry)) continue
    let raw: string
    try {
      raw = readFileSync(`/proc/${entry}/stat`, 'utf8')
    } catch {
      continue // 进程恰在枚举间隙退出 → 跳过
    }
    const closeParen = raw.lastIndexOf(')')
    if (closeParen < 0) continue
    const arr = raw.slice(closeParen + 2).split(' ')
    const ttyNr = parseInt(arr[4] ?? '', 10)
    if (!Number.isFinite(ttyNr) || ttyNr !== ttyDev) continue
    const p = parseInt(entry, 10)
    const ppid = parseInt(arr[1] ?? '', 10)
    if (Number.isFinite(p)) members.set(p, Number.isFinite(ppid) ? ppid : 0)
  }

  // 4. 根进程 = 集合中 ppid 不在集合内者（取第一个）；无根 → false
  let root = 0
  for (const [p, ppid] of members) {
    if (!members.has(ppid)) {
      root = p
      break
    }
  }
  if (root === 0) return false

  // 5. SIGTERM 根 shell → 模拟器关闭该窗口/标签 → claude 随 pty hangup（SIGHUP）退出
  try {
    process.kill(root, 'SIGTERM')
    return true
  } catch {
    return false
  }
}

// ─── 跳转终端聚焦（#5，X11 xdotool 按 pid 定位；Wayland 降级开窗） ───

/**
 * 终端模拟器进程 comm 白名单（/proc/<pid>/stat field 2）。
 *
 * ⚠ Linux comm 受 TASK_COMM_LEN 限制仅 15 字符（不含 NUL）：实测本机
 *   gnome-terminal-server（21 字符）在 stat 中截断为 "gnome-terminal-"，
 *   故清单同时收录全名与截断形（蓝图原清单仅全名，实测勘误补入截断形）。
 */
export const TERMINAL_COMMS = new Set<string>([
  'gnome-terminal-server',
  'gnome-terminal-', // "gnome-terminal-server" 的 15 字符截断形（本机实测值）
  'gnome-terminal',
  'kgx',
  'gnome-console',
  'xterm',
  'konsole',
  'xfce4-terminal',
  'tilix',
  'terminator',
  'wezterm',
  'wezterm-gui',
  'alacritty',
  'kitty',
  'foot',
  'st'
])

/**
 * 从 pid 沿 ppid 上行（最多 10 跳防环），找 comm ∈ TERMINAL_COMMS 的终端祖先。
 *
 * 进程树实测：claude(pid, pts/N) ← bash(pts/N) ← gnome-terminal-server。
 * /proc/<p>/stat 解析沿用项目既有风格：comm = 首个 '(' 与末个 ')' 之间
 * （可含空格/括号）；ppid = lastIndexOf(')') 后切分的 arr[1]（field 4）。
 * pid<=0 / pid===1 / stat 不可读 / 10 跳内未命中 → null。
 * 纯函数（无 electron 依赖），导出供裸 node 验收与 ipc-handlers 复用。
 */
export function findTerminalAncestor(pid: number): { pid: number; comm: string } | null {
  if (!Number.isFinite(pid) || pid <= 0 || pid === 1) return null
  let p = Math.trunc(pid)
  for (let hop = 0; hop < 10; hop++) {
    if (p <= 1) return null
    let raw: string
    try {
      raw = readFileSync(`/proc/${p}/stat`, 'utf8')
    } catch {
      return null // 进程恰在间隙退出 / 无权限 → 链断
    }
    const open = raw.indexOf('(')
    const close = raw.lastIndexOf(')')
    if (open < 0 || close <= open) return null
    const comm = raw.slice(open + 1, close)
    if (TERMINAL_COMMS.has(comm)) return { pid: p, comm }
    // ppid = field 4 = ')' 后 arr[1]（同 closeTerminalOfPid / readMemoryMB 切分法）
    const arr = raw.slice(close + 2).split(' ')
    const ppid = parseInt(arr[1] ?? '', 10)
    if (!Number.isFinite(ppid) || ppid <= 0) return null
    p = ppid
  }
  return null // 10 跳防环上限
}

/**
 * 尝试聚焦会话进程所在的既有终端窗口（#5 主函数）。成功 true → 调用方不再开窗。
 *
 * 链路：
 *   1. xdotool 可用性检测（`command -v`，可选依赖、运行时检测、缺失即 false 降级）
 *   2. findTerminalAncestor(pid) 定位终端模拟器祖先（如 gnome-terminal-server）
 *   3. xdotool search --pid <祖先 pid> → 窗口 id 列表。**原生 Wayland 窗口对
 *      xdotool 不可见（XWayland 仅见 X11 客户端）→ 输出为空 → false → 调用方降级
 *      spawn 开新窗口（Wayland 主路径）**。注意 search 无结果时 exit code 非 0，
 *      故判据用 stdout 是否含窗口号，不用 exit code。
 *   4. 多窗口选择：优先标题含 basename(cwd) 者（大小写不敏感；gnome-terminal-server
 *      是共享进程、一个 pid 跨多窗口，标题通常含 cwd/shell 信息）；全不匹配 → 第一个
 *   5. windowactivate --sync（best-effort 追加 windowfocus，后者失败忽略）→ true
 *
 * 所有 execSync/spawnSync 带 timeout；任何抛错/超时/生成失败 → false。
 */
export function focusExistingTerminal(pid: number, cwd: string): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false

  // 1. xdotool 可用性（可选依赖：不随项目安装，缺失 → false → 降级 spawn 链）
  try {
    execSync('command -v xdotool', { timeout: 2000, stdio: 'ignore' })
  } catch {
    return false
  }

  // 2. 终端祖先（无 → 后台会话/非终端拉起的进程 → false）
  const anc = findTerminalAncestor(Math.trunc(pid))
  if (anc === null) return false

  // 3. 按祖先 pid 搜窗口（Wayland 原生窗口不可见 → 空 → false）
  let wids: string[] = []
  try {
    const res = spawnSync('xdotool', ['search', '--pid', String(anc.pid)], {
      encoding: 'utf8',
      timeout: 3000
    })
    if (!res.error) {
      wids = (res.stdout ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^\d+$/.test(l))
    }
  } catch {
    return false
  }
  if (wids.length === 0) return false

  // 4. 多窗口按标题筛（单窗口直取）
  let best = wids[0]
  if (best === undefined) return false // 理论不可达（wids 非空已保证）；noUncheckedIndexedAccess 守卫
  if (wids.length > 1) {
    const needle = basename(cwd || '').toLowerCase()
    if (needle !== '') {
      for (const wid of wids) {
        let title = ''
        try {
          const res = spawnSync('xdotool', ['getwindowname', wid], {
            encoding: 'utf8',
            timeout: 3000
          })
          if (!res.error) title = (res.stdout ?? '').trim()
        } catch {
          // 取名失败 → 视为不匹配，继续下一个
        }
        if (title.toLowerCase().includes(needle)) {
          best = wid
          break
        }
      }
    }
  }

  // 5. 聚焦（windowactivate 主：提升窗口并切 WM 焦点；windowfocus 辅：best-effort 忽略失败）
  try {
    const act = spawnSync('xdotool', ['windowactivate', '--sync', best], {
      encoding: 'utf8',
      timeout: 3000
    })
    if (act.error) return false // spawn 失败/超时 → 交给降级链
    spawnSync('xdotool', ['windowfocus', best], { encoding: 'utf8', timeout: 3000 })
  } catch {
    return false
  }
  return true
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
  /** M16 B1：会话细节增量扫描器（tasks/agents/currentAction 真源，index.ts 注入） */
  private readonly detailScanner: SessionDetailScanner
  /** M17.1：应用配置（contextWindowForModel 分层解析的 context_lengths 真源） */
  private config: AppConfig
  /** 调度器每轮写入，供 server getSessions 同步读取 */
  private latestSessions: SessionInfo[] = []

  constructor(
    config: AppConfig,
    approvalQueue: ApprovalQueue,
    detailScanner: SessionDetailScanner
  ) {
    const cc = config.harnesses['claude-code']
    const dirs = (cc.config_dirs && cc.config_dirs.length > 0 ? cc.config_dirs : ['~/.claude']).map(
      expandHome
    )
    this.sessionsDirs = dirs.map((d) => join(d, 'sessions'))
    this.projectsDirs = dirs.map((d) => join(d, 'projects'))
    this.settingsPath = expandHome(cc.settings_path || '~/.claude/settings.json')
    this.approvalQueue = approvalQueue
    this.detailScanner = detailScanner
    this.config = config
  }

  /** M17.1：config:save 重调度后刷新配置引用（context_lengths 手动编辑即时生效） */
  setConfig(config: AppConfig): void {
    this.config = config
  }

  /** 同步读取上一轮扫描缓存（createServer 的 getSessions 注入口用） */
  getSessions(): SessionInfo[] {
    return this.latestSessions
  }

  /** 扫描全部 config_dirs，返回按 startedAt 降序的 session 列表；同时刷新内部缓存。 */
  async discoverSessions(): Promise<SessionInfo[]> {
    const model = resolveModel(this.settingsPath)
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
        const info = this.parseSessionFile(join(dir, file), model, now, pending)
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
    // kind 过滤（F1）：排除后台任务会话（kind 存在且非 interactive，如 "bg"——/clear 等
    // 后台会话带 jobId 长期驻留 sessions 目录，用户明确不想看到）。旧版 Claude Code 可能
    // 无 kind 字段 → 按 interactive 放行（兼容策略，宁多显示不误杀旧版会话）。
    if (typeof raw.kind === 'string' && raw.kind !== 'interactive') return null

    const sessionId =
      typeof raw.sessionId === 'string' ? raw.sessionId.slice(0, 256) : ''
    // json cwd（启动目录）：4096 截断（§6.8.2b）；仅作为 transcript 尾读 cwd 的降级
    const jsonCwd = typeof raw.cwd === 'string' ? raw.cwd.slice(0, 4096) : ''
    const startedAt =
      typeof raw.startedAt === 'number' && Number.isFinite(raw.startedAt) && raw.startedAt > 0
        ? raw.startedAt
        : 0
    // transcript 只定位一次：尾读三事（tailFacts）真源（显示名所需 cwd 亦出自尾读 lastCwd）
    const transcript = sessionId ? findTranscript(this.projectsDirs, sessionId) : null
    // F2：尾窗一次读提取三事（usedTokens / lastCwd / lastModel，见文件头与 tailFacts 注释）
    const tail = transcript ? tailFacts(transcript) : ZERO_TAIL

    // M16 B1：增量细节扫描 + currentAction 推导（真源 = SessionDetailScanner 增量缓存）。
    // scan() 每轮只读新增 delta（compact 重写自动全量重建），getCurrentAction 只读缓存状态，
    // 均不重复 tailFacts 的尾窗逻辑（ctxPct 不变量 B 不受影响）。任何异常降级 null，
    // 绝不影响会话列表主链路（NFR-3）。
    let currentAction: SessionInfo['currentAction'] = null
    if (transcript !== null && sessionId !== '') {
      try {
        this.detailScanner.scan(transcript, sessionId)
        currentAction = this.detailScanner.getCurrentAction(transcript, sessionId)
      } catch {
        currentAction = null
      }
    }

    // 显示 cwd（F2）：transcript 尾读的最后一条 cwd（Claude Code 随实际工作目录动态更新，
    // 是"当前真实项目路径"真源）→ jsonCwd（启动目录）降级；两者统一 4096 截断
    const cwd = (tail.lastCwd !== null ? tail.lastCwd : jsonCwd).slice(0, 4096)
    // 审批匹配仍兼容 basename(cwd) 旧语义（approve.sh 主路径发 sessionId，name 不再参与）
    const cwdName = cwd ? basename(cwd) : null

    // 显示名（name）= 终端窗口标题推导值（2026-08-08 应需求，见文件头 doc）：
    //   与 ~/.bashrc 的 `\e]0;\u@\h: \w\a` 规则逐字同源 —— `user@host: cwd`。
    //   cwd 为空（后台会话无真实目录）→ 仅 `user@host: ` 兜底。
    //   宿主标识取一次（进程内不变），避免每轮扫描重复 syscall。
    const name = `${TERMINAL_TITLE_USER}@${TERMINAL_TITLE_HOST}: ${cwd}`

    // 状态判定（v3.2 简化）：进程存活 → busy，否则 idle + memory=0
    const alive = existsSync(`/proc/${pid}`)
    const status: SessionStatus = alive ? 'busy' : 'idle'
    const memoryMB = alive ? readMemoryMB(pid) : 0

    // 执行中判定：进程存活且 transcript 最近写入（mtime 距现在 ≤ ACTIVE_WINDOW_MS）。
    // transcript 为空（找不到）/ statSync 失败 → 非执行中（降级为 busy 绿色态）
    let recentlyActive = false
    if (alive && transcript !== null) {
      try {
        recentlyActive = Date.now() - statSync(transcript).mtimeMs <= ACTIVE_WINDOW_MS
      } catch {
        recentlyActive = false
      }
    }

    // ctxPct：与 statusline.py 同源（usedTokens 取自尾读三事之一）。
    // 分母即实际后端模型的上下文上限：优先用 transcript 末条 message.model
    // （代理改写后的真实模型名），经 contextWindowForModel 分层解析
    // （config.context_lengths 前缀匹配 → vendor-registry → [1m] 启发式）。
    // 页面切换 API 后，会话下一条消息的 lastModel 即新模型 → ctxPct 随新 API 的
    // 实际最大上下文自动更新（旧版始终用 settings modelId，不识真实后端上限）。
    let ctxPct = 0
    if (transcript) {
      const window = contextWindowForModel(tail.lastModel ?? model.modelId, this.config)
      ctxPct = window > 0 ? Math.min(100, Math.round((tail.usedTokens / window) * 100)) : 0
    }

    // uptimeSec：startedAt 异常 → 0
    let uptimeSec = 0
    if (startedAt > 0) {
      const sec = (now - startedAt) / 1000
      uptimeSec = sec >= 0 ? sec : 0
    }

    // 合并审批状态：匹配 name（现为终端标题 user@host: cwd，实为兜底冗余）/
    // cwdName（旧版项目名语义的兼容保险）/ sessionId 三者任一。
    // approve.sh 主路径发 session_id → sessionId 命中即判定；name/cwdName 仅兼容
    // 老脚本按项目名/session 名发请求的路径。
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
      tool: 'Claude Code', // harness 身份固定值（非逐会话当前工具；审批匹配不依赖此字段）
      apiProvider: tail.lastModel ?? model.providerName, // F2：API 实际返回模型 → settings 解析降级
      uptimeSec,
      memoryMB,
      ctxPct,
      cwd,
      startedAt,
      hasPendingApproval,
      recentlyActive,
      lastActivity: tail.lastActivity ?? '', // F2：最近可读任务内容（扫不到为空串，卡片据此条件渲染）
      currentAction, // M16 B1：增量细节扫描器推导（末条 tool_use 无 tool_result → tool / 否则 waiting / 无法确定 null）
      // M17：最近一次 API 调用的实际后端模型名（transcript 尾读 message.model 真源）。
      // 与 apiProvider 同一降级链风格但**不回退 settings 别名**——settings 的 *_MODEL_NAME
      // 经代理改写可能是陈旧别名；此处必须是真实后端模型名（auto-population 触发用），
      // 无 usage/model 记录为 null（types.ts 契约）
      lastModel: tail.lastModel
    }
  }
}
