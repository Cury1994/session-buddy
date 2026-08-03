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

/**
 * 应用配置顶层结构（DESIGN §6.1，字段名严格对齐 config.yaml schema §8.1）。
 */
export interface AppConfig {
  server: ServerConfig
  providers: ProvidersConfig
  harnesses: HarnessesConfig
  notifications: NotificationsConfig
  window: WindowConfig
}

// ─── API 余额（DESIGN §6.7 / §6.12） ───

/** deepseek.ts 解析后的内部余额模型（§5.1 / §6.7） */
export interface BalanceInfo {
  provider: string // "deepseek"
  balance: number // total_balance parseFloat
  currency: string // "CNY"
}

// ─── API 用量 / 审批历史（DESIGN §6.12，db INTEGER/REAL → TS 映射） ───

/** api_usage 表行（§6.2）→ UsageView 渲染 */
export interface UsageRecord {
  provider: string
  model: string
  balance: number
  balanceCurrency: string
  timestamp: string // 本地时间 "YYYY-MM-DD HH:MM:SS"（db datetime('now','localtime')），渲染端按字面展示
}

/** get30DayBalance 聚合行（§6.2）→ TrendSparkline */
export interface BalanceDailySnapshot {
  day: string // "YYYY-MM-DD"（本地日期）
  balance: number // 当日最后一次快照余额
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
  lastActivity: string // 最近一条可读对话/任务内容（transcript 尾读，截断 120；无则空串）
}
