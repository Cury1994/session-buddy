/**
 * 共享类型定义（DESIGN §6.12）
 *
 * IPC 两端（主进程 ↔ 渲染进程）与 HTTP 端共用的核心类型，统一放在此处，
 * 避免各端字段名漂移。各类型随对应模块落地逐步追加（§6.12 为整体规划）。
 *
 * M2 引入：AppConfig 及其嵌套子接口（DESIGN §6.1 / §8.1）。
 */

// ─── 配置（AppConfig，DESIGN §6.1） ───

export interface ServerConfig {
  host: string
  port: number
}

export interface DeepSeekProviderConfig {
  balance_url: string
  check_interval_min: number // 默认 1（分钟）
  balance_warn_threshold: number // 默认 0.15
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

export interface AutostartConfig {
  enabled: boolean
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
  autostart: AutostartConfig
}

// ─── API 用量 / 审批历史（DESIGN §6.12，db INTEGER/REAL → TS 映射） ───

/** api_usage 表行（§6.2）→ UsageView 渲染 */
export interface UsageRecord {
  provider: string
  model: string
  balance: number
  balanceCurrency: string
  todayTokens: number
  monthUsed: number
  totalBudget: number
  timestamp: string // ISO 8601（db datetime('now')）
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
  timestamp: string // ISO 8601
}
