import { closeSync, openSync, readSync, statSync } from 'node:fs'

import { extractContentText, toActivity } from './claude-sessions'

import type {
  SessionDetail,
  SessionInfo,
  SessionMessage,
  SessionTask,
  SubAgentRef
} from '../shared/types'

/**
 * M16 B1 — 会话细节增量扫描器（展开详情区：任务清单 / 子 Agent / 消息尾流 + currentAction 推导）
 *
 * 每会话维护一份增量缓存，`ClaudeCodeSessionScanner.discoverSessions` 每轮（3s）对每个活跃
 * 会话调一次 `scan()`：
 *   - 首次扫描：从头解析整个 transcript（每行一个 JSON）
 *   - 后续扫描：stat 文件大小，仅用 openSync/readSync 从 knownSize 偏移读**新增 delta**，
 *     按换行对齐（末尾不完整行留到下一轮），逐行增量应用
 *   - **compact 重写**（/compact 压缩后文件变小）或文件被替换（inode 变化）→ size 回退/
 *     inode 不符 → 清空缓存全量重建。追加写与整体重写两种演化都正确处理。
 *
 * transcript 行内结构（本机 Claude Code 2.1.207 实测）：
 *   顶层 type ∈ {user, assistant, ...}，message.content 为 block 数组（或 string）：
 *     {type:'tool_use', id, name, input} / {type:'tool_result', tool_use_id, content} /
 *     {type:'text', text}
 *
 * ─── 任务清单重建（F2）───
 *   TaskCreate tool_use（input.subject）→ 其 tool_result 文本 "Task #N created successfully: ..."
 *   给出**真实任务编号 N** → tasks[N] = {taskId:N, content:subject, status:'pending'}。
 *   TaskUpdate tool_use（input.taskId + input.status）按编号更新 status。
 *
 *   ⚠ 与 C1 蓝图描述的偏差（实测驱动）：蓝图写「TaskCreate 的 tool_use id 即任务 id」，
 *   实测 TaskUpdate.input.taskId 是顺序编号 "1"/"2"/"3"（与 toolu_* 格式的 tool_use id
 *   永不匹配，tool_result "Task #N created successfully" 才是编号真源）。若按蓝图实现，
 *   TaskUpdate 永远命不中任务 → 全部 status 卡在 pending。本实现以 tool_result 编号为准；
 *   tool_result 缺失/格式变化时降级用 tool_use id 作 taskId（任务仍可见，仅 TaskUpdate 失配）。
 *
 * ─── 子 Agent（F3）───
 *   Agent tool_use（input.subagent_type / input.description）→ agents[id] = status:'running'；
 *   tool_result 的 tool_use_id 命中该 id → status:'done'。
 *
 * ─── 消息尾流（F4）───
 *   user / assistant 记录经 extractContentText + toActivity 清洗（剥 system-reminder /
 *   local-command-caveat / 斜杠命令标签、折叠空白、截断 120）后非空 → 追加到最近 N=50 的
 *   环形缓冲（oldest→newest）。纯 tool_result 回传记录（无 text 块）不入缓冲。
 *   **用户新文本消息（不含 tool_result 块）= 新一轮人工输入 → 清空 pending 工具**
 *   （用户打断/Esc 后未回 tool_result 的陈旧 pending 不应再驱动 currentAction）。
 *
 * ─── currentAction（SessionInfo.currentAction 真源）───
 *   只从增量缓存状态推导，绝不重读 transcript：
 *   ① 存在未收到 tool_result 的 tool_use → {kind:'tool', label:工具摘要}
 *      （label：Bash → "Bash: <命令文本>"；Read → "Read: <路径>"；其他 → 工具名；
 *        多个 pending 取最近插入者——types.ts 契约「已无 pending 工具」才可判 waiting）
 *   ② 否则最近一条可读消息为 assistant 文本 → {kind:'waiting', label:'等待用户输入'}
 *   ③ 否则 null（transcript 缺失/空/无法确定）
 *
 * 缓存容量：最多保留 512 个会话缓存（超出按插入序淘汰最旧；活跃会话由 scanner 每轮 touch）。
 * 全部 IO/解析错误静默降级（NFR-3：细节扫描失败绝不影响会话列表主链路）。
 */

/** 消息环形缓冲容量（最近 N 条，oldest→newest，契约 F4） */
const MESSAGE_RING_SIZE = 50

/** 会话缓存上限（超出按插入序淘汰最旧） */
const SESSION_CACHE_MAX = 512

/** currentAction 工具摘要 label 的最大长度（超出截断 + "…"） */
const TOOL_LABEL_MAX = 160

/** 单个会话的增量缓存 */
interface SessionCache {
  /** 任务清单：真实任务编号（tool_result "Task #N"）→ 任务 */
  tasks: Map<string, SessionTask>
  /** 子 Agent：Agent tool_use id → 引用 */
  agents: Map<string, SubAgentRef>
  /** 消息尾流：最近 N 条（oldest→newest） */
  messages: SessionMessage[]
  /** 未收到 tool_result 的 tool_use：id → 工具摘要 label（Map 插入序 = 调用序） */
  pendingTools: Map<string, string>
  /** 已发未回的 TaskCreate：tool_use id → subject（真实编号要等 tool_result 才知） */
  pendingTaskCreates: Map<string, string>
  /** 已解析到的文件偏移（换行对齐后的下一字节） */
  knownSize: number
  /** 上次扫描的文件 inode（0 = 尚未扫描；检测整体重写/替换） */
  knownIno: number
}

/** 从 tool_result 的 content 提取文本（string 或 text-block 数组均兼容） */
function extractResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    let out = ''
    for (const b of content) {
      if (typeof b !== 'object' || b === null) continue
      const block = b as Record<string, unknown>
      if (block['type'] === 'text' && typeof block['text'] === 'string') {
        out += block['text']
      }
    }
    return out
  }
  return ''
}

/**
 * 工具摘要 label（currentAction kind='tool' 用）：
 *   Bash → "Bash: <命令文本（toActivity 清洗/折叠/截断）>"；Read → "Read: <file_path>"；其他 → 工具名。
 */
function toolLabel(name: string, input: Record<string, unknown>): string {
  let label = name
  if (name === 'Bash') {
    const cmd = typeof input['command'] === 'string' ? toActivity(input['command']) : null
    if (cmd !== null) label = `Bash: ${cmd}`
  } else if (name === 'Read') {
    const p = typeof input['file_path'] === 'string' ? input['file_path'] : null
    if (p !== null) label = `Read: ${p}`
  }
  return label.length > TOOL_LABEL_MAX ? `${label.slice(0, TOOL_LABEL_MAX)}…` : label
}

export class SessionDetailScanner {
  private readonly caches = new Map<string, SessionCache>()

  /**
   * 增量扫描一个会话的 transcript（每轮 discoverSessions 对每个活跃会话调一次）。
   *   - 文件不可 stat（缺失/被删）→ 保留既有缓存不动，直接返回
   *   - size 回退（compact 压缩重写）或 inode 变化（文件替换）→ 清空缓存全量重建
   *   - 否则从 knownSize 读 delta；size 无变化 → 零 IO 直接返回
   * 解析位置只推进到最后一个完整换行（末尾半行下一轮补读），任何 IO/解析失败静默降级。
   */
  scan(transcriptPath: string, sessionId: string): void {
    let size: number
    let ino: number
    try {
      const st = statSync(transcriptPath)
      size = st.size
      ino = st.ino
    } catch {
      return // 文件暂不可达 → 保留既有缓存
    }

    let c = this.caches.get(sessionId)
    if (c === undefined) {
      // 容量保护：超限按插入序淘汰最旧（活跃会话每轮被 scan touch，不会被误淘汰）
      if (this.caches.size >= SESSION_CACHE_MAX) {
        const oldest = this.caches.keys().next()
        if (!oldest.done) this.caches.delete(oldest.value)
      }
      c = {
        tasks: new Map(),
        agents: new Map(),
        messages: [],
        pendingTools: new Map(),
        pendingTaskCreates: new Map(),
        knownSize: 0,
        knownIno: 0
      }
      this.caches.set(sessionId, c)
    }

    // compact 重写 / 文件替换 → 全量重建（knownIno===0 的首次扫描不走此分支，start=0 天然全量）
    const rewritten = size < c.knownSize || (c.knownIno !== 0 && ino !== c.knownIno)
    if (rewritten) {
      c.tasks.clear()
      c.agents.clear()
      c.messages.length = 0
      c.pendingTools.clear()
      c.pendingTaskCreates.clear()
      c.knownSize = 0
      c.knownIno = 0
    }

    if (!rewritten && size === c.knownSize) return // 无新增（inode 变化已被 rewritten 覆盖）

    const start = c.knownSize
    const consumed = this.parseRange(transcriptPath, start, size, c)
    c.knownSize = start + consumed
    c.knownIno = ino
  }

  /** 会话细节（tasks/agents 全量，messages 最近 N 条 oldest→newest）；未知会话 → 空载荷 */
  getDetail(sessionId: string): SessionDetail {
    const c = this.caches.get(sessionId)
    if (c === undefined) return { tasks: [], agents: [], messages: [] }
    return {
      tasks: [...c.tasks.values()],
      agents: [...c.agents.values()],
      messages: [...c.messages]
    }
  }

  /**
   * 当前动作（SessionInfo.currentAction 真源）——只读增量缓存状态，不重读 transcript。
   * ① 有 pending tool_use（未收到 tool_result）→ 最近一条 {kind:'tool', label}；
   * ② 否则最近可读消息为 assistant 文本 → {kind:'waiting', label:'等待用户输入'}；
   * ③ 否则 null。transcriptPath 参数为接口对称保留（契约签名），本方法不使用。
   */
  getCurrentAction(_transcriptPath: string, sessionId: string): SessionInfo['currentAction'] {
    const c = this.caches.get(sessionId)
    if (c === undefined) return null
    // Map 插入序 = 调用序；迭代到最后一个 = 最近的未回应 tool_use
    let pendingLabel: string | null = null
    for (const label of c.pendingTools.values()) pendingLabel = label
    if (pendingLabel !== null) return { kind: 'tool', label: pendingLabel }
    const last = c.messages.length > 0 ? c.messages[c.messages.length - 1] : undefined
    if (last !== undefined && last.role === 'assistant') {
      return { kind: 'waiting', label: '等待用户输入' }
    }
    return null
  }

  /**
   * 读 [start, size) 区间并按完整行解析；返回实际消费的字节数（对齐到最后一个 '\n'）。
   * 末尾不完整行（Claude Code 正在写入）不解析、不计入消费，下轮自然补读。
   */
  private parseRange(
    transcriptPath: string,
    start: number,
    size: number,
    c: SessionCache
  ): number {
    if (size <= start) return 0
    try {
      const fd = openSync(transcriptPath, 'r')
      try {
        const buf = Buffer.allocUnsafe(size - start)
        const n = readSync(fd, buf, 0, buf.length, start)
        if (n <= 0) return 0
        const lastNl = buf.lastIndexOf(0x0a, n - 1)
        if (lastNl < 0) return 0 // 区间内无完整行
        const content = buf.toString('utf8', 0, lastNl + 1)
        for (const line of content.split('\n')) this.applyLine(line, c)
        return lastNl + 1
      } finally {
        closeSync(fd)
      }
    } catch {
      return 0
    }
  }

  /** 解析并增量应用一行 transcript 记录（非法 JSON / 非对话记录静默跳过） */
  private applyLine(line: string, c: SessionCache): void {
    const trimmed = line.trim()
    if (!trimmed) return
    let obj: unknown
    try {
      obj = JSON.parse(trimmed)
    } catch {
      return
    }
    if (typeof obj !== 'object' || obj === null) return
    const record = obj as Record<string, unknown>

    const type = record['type']
    if (type !== 'user' && type !== 'assistant') return // mode/system/attachment 等记录无对话语义
    const msg = record['message']
    if (typeof msg !== 'object' || msg === null) return
    const content = (msg as Record<string, unknown>)['content']

    // block 级增量应用（tool_use / tool_result）
    let sawToolResult = false
    if (Array.isArray(content)) {
      for (const b of content) {
        if (typeof b !== 'object' || b === null) continue
        const block = b as Record<string, unknown>
        if (block['type'] === 'tool_use') {
          this.applyToolUse(block, c)
        } else if (block['type'] === 'tool_result') {
          sawToolResult = true
          this.applyToolResult(block, c)
        }
      }
    }

    // 可读文本 → messages 环形缓冲（复用 claude-sessions 的清洗链：剥 system-reminder /
    // local-command-caveat / 斜杠命令标签、折叠空白、截断 120；清洗后为空不入缓冲）。
    // 用户新文本（不含 tool_result 块）= 新一轮人工输入 → 清除陈旧 pending（打断/Esc 语义）。
    const rawText = extractContentText(content)
    const text = rawText !== null ? toActivity(rawText) : null
    if (text !== null) {
      if (type === 'user' && !sawToolResult) c.pendingTools.clear()
      c.messages.push({ role: type, text })
      if (c.messages.length > MESSAGE_RING_SIZE) {
        c.messages.splice(0, c.messages.length - MESSAGE_RING_SIZE)
      }
    }
  }

  /** tool_use block 增量应用（TaskCreate / TaskUpdate / Agent 特化 + 通用 pending 登记） */
  private applyToolUse(block: Record<string, unknown>, c: SessionCache): void {
    const id = typeof block['id'] === 'string' ? block['id'] : ''
    const name = typeof block['name'] === 'string' ? block['name'] : ''
    if (id === '' || name === '') return
    const rawInput = block['input']
    const input: Record<string, unknown> =
      typeof rawInput === 'object' && rawInput !== null
        ? (rawInput as Record<string, unknown>)
        : {}

    if (name === 'TaskCreate') {
      // 真实任务编号此时未知（在 tool_result 里），先记 subject 等 result 配对
      c.pendingTaskCreates.set(id, typeof input['subject'] === 'string' ? input['subject'] : '')
    } else if (name === 'TaskUpdate') {
      const rawId = input['taskId']
      const taskId =
        typeof rawId === 'string' ? rawId : typeof rawId === 'number' ? String(rawId) : null
      const status = input['status']
      if (
        taskId !== null &&
        (status === 'pending' || status === 'in_progress' || status === 'completed')
      ) {
        const t = c.tasks.get(taskId)
        if (t !== undefined) t.status = status // tasks 里没有该 id → 忽略（契约）
      }
    } else if (name === 'Agent') {
      c.agents.set(id, {
        id,
        type: typeof input['subagent_type'] === 'string' ? input['subagent_type'] : '',
        description: typeof input['description'] === 'string' ? input['description'] : '',
        status: 'running'
      })
    }

    // 通用：任何 tool_use 都算 pending（currentAction 推导用），tool_result 到达即移除
    c.pendingTools.set(id, toolLabel(name, input))
  }

  /** tool_result block 增量应用（清 pending / Agent 完成 / TaskCreate 编号配对） */
  private applyToolResult(block: Record<string, unknown>, c: SessionCache): void {
    const tuid = typeof block['tool_use_id'] === 'string' ? block['tool_use_id'] : ''
    if (tuid === '') return

    c.pendingTools.delete(tuid)

    const agent = c.agents.get(tuid)
    if (agent !== undefined) agent.status = 'done'

    const subject = c.pendingTaskCreates.get(tuid)
    if (subject !== undefined) {
      c.pendingTaskCreates.delete(tuid)
      // 真实任务编号来自 result 文本 "Task #N created successfully: ..."
      // （TaskUpdate.input.taskId 引用的即该编号）；解析失败降级用 tool_use id
      const m = /Task #(\d+) created/.exec(extractResultText(block['content']))
      const taskId = m !== null && m[1] !== undefined ? m[1] : tuid
      c.tasks.set(taskId, { taskId, content: subject, status: 'pending' })
    }
  }
}
