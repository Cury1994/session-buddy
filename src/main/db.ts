import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import Database from 'better-sqlite3'

import type { ApprovalRecord, BalanceDailySnapshot, BillingMode, UsageRecord } from '../shared/types'

/**
 * M3 — 数据库封装（DESIGN §6.2）
 *
 * 错误处理取舍（TASKS §18.4 + M3 review 指引）：
 * - DAO 读写方法：try/catch + console.warn，读失败返回安全空值（[] / 映射空集），
 *   写失败仅告警不抛——上层（M5/M8）不应因单次 DB 抖动崩溃。
 * - constructor / initDB：属致命错误（路径不可写、Schema 损坏等），**不捕获，直接抛**，
 *   由调用方在启动阶段感知并处理。
 */

// ─── Schema（DESIGN §6.2 逐字，列/索引定义完全一致；加 IF NOT EXISTS 以支持重复启动幂等建表） ───
// M13.4：api_usage 增 billing/unit 两列（计费形式 + 显示单位，多卡用量视图）。
// 已有库走 migrateApiUsageColumns 的 PRAGMA table_info + ALTER TABLE 幂等迁移（见下）。

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS api_usage (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    provider         TEXT    NOT NULL DEFAULT 'deepseek',
    model            TEXT    NOT NULL DEFAULT 'all',
    balance          REAL    NOT NULL DEFAULT 0,
    balance_currency TEXT    NOT NULL DEFAULT 'CNY',
    timestamp        TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    billing          TEXT    NOT NULL DEFAULT '',
    unit             TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_usage_provider_time ON api_usage(provider, model, timestamp);

CREATE TABLE IF NOT EXISTS approval_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    harness      TEXT    NOT NULL,
    session_name TEXT,
    command      TEXT    NOT NULL,
    cwd          TEXT,
    tool         TEXT    DEFAULT 'Bash',
    allowed      INTEGER NOT NULL DEFAULT 0,
    timestamp    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_approval_time ON approval_history(timestamp DESC);
`

// M13.4：INSERT 含 billing/unit 列；recordUsage 可选参缺省写 ''（兼容旧 4 参调用方）。
const INSERT_USAGE =
  'INSERT INTO api_usage (provider, model, balance, balance_currency, billing, unit) VALUES (?, ?, ?, ?, ?, ?)'

// 每个 (provider, model) 取最新一行：用 WHERE id IN (SELECT MAX(id) ... GROUP BY)，
// 规避 SQLite `SELECT *, MAX(id) ... GROUP BY` 的裸列语义不可靠问题。
const SELECT_LATEST_USAGE =
  'SELECT * FROM api_usage WHERE id IN (SELECT MAX(id) FROM api_usage GROUP BY provider, model) ORDER BY provider, model'

// M13.4：单 provider 最新一条（多卡视图"单卡查询"用，避免每卡全量扫 getLatestUsage）。
const SELECT_LATEST_USAGE_BY_PROVIDER =
  'SELECT * FROM api_usage WHERE provider = ? ORDER BY id DESC LIMIT 1'

// 近 30 天每日余额快照：每天取 MAX(id)（当日最后一次快照）那行的 balance，按 day 升序。
// 沿用 getLatestUsage 的 MAX(id) 分组风格（WHERE id IN 子查询），规避裸列聚合语义问题。
// 时间戳为本地时间（datetime('now','localtime')），窗口比较同样用 localtime 基准，避免时区错位。
const SELECT_30DAY_BALANCE =
  "SELECT DATE(timestamp) AS day, balance FROM api_usage WHERE id IN (SELECT MAX(id) FROM api_usage WHERE provider = ? AND model = ? AND timestamp >= date('now','localtime','-30 days') GROUP BY DATE(timestamp)) ORDER BY day"

// M12 审批镜像轮起全工具审批：tool 列写真值（B2 E2E 整改——原省略该列由
// DEFAULT 'Bash' 填充，导致非 Bash 审批历史工具列恒错）。
const INSERT_APPROVAL =
  'INSERT INTO approval_history (harness, session_name, command, cwd, tool, allowed) VALUES (?, ?, ?, ?, ?, ?)'

const SELECT_RECENT_APPROVALS =
  'SELECT * FROM approval_history ORDER BY timestamp DESC, id DESC LIMIT ?'

/** 全部审批历史（无 LIMIT，供历史列表滚动展示全部） */
const SELECT_ALL_APPROVALS =
  'SELECT * FROM approval_history ORDER BY timestamp DESC, id DESC'

// ─── 行原始结构（snake_case，对应表列） ───

interface RawUsageRow {
  id: number
  provider: string
  model: string
  balance: number
  balance_currency: string
  timestamp: string
  billing: string // M13.4：'' = 迁移前的旧行或旧 4 参调用方写入
  unit: string // M13.4：同上
}

interface RawApprovalRow {
  id: number
  harness: string
  session_name: string | null
  command: string
  cwd: string | null
  tool: string
  allowed: number
  timestamp: string
}

interface RawDayRow {
  day: string
  balance: number
}

function toUsageRecord(row: RawUsageRow): UsageRecord {
  return {
    provider: row.provider,
    model: row.model,
    balance: row.balance,
    balanceCurrency: row.balance_currency,
    timestamp: row.timestamp,
    billing: row.billing, // M13.4 透传（'' = 旧行/旧调用方）
    unit: row.unit
  }
}

function toApprovalRecord(row: RawApprovalRow): ApprovalRecord {
  return {
    id: row.id,
    harness: row.harness,
    sessionName: row.session_name,
    command: row.command,
    cwd: row.cwd,
    tool: row.tool,
    allowed: row.allowed === 1,
    timestamp: row.timestamp
  }
}

/**
 * 解析默认 DB 路径。
 *
 * 裸 node 下 `require('electron')` 返回的是 electron 二进制路径**字符串**而非 API 对象，
 * 此时 `app` 解构为 undefined；仅当真正运行于 Electron 主进程（`app.getPath` 为函数）
 * 时才用 `userData`，否则回退 `~/.config/harness-monitor/monitor.db`（与 §6.2 Linux 路径一致）。
 */
function resolveDefaultDbPath(): string {
  if (app && typeof app.getPath === 'function') {
    try {
      return join(app.getPath('userData'), 'monitor.db')
    } catch {
      /* 取 userData 失败则回退 */
    }
  }
  return join(homedir(), '.config', 'harness-monitor', 'monitor.db')
}

export class AppDatabase {
  private readonly db: Database.Database
  readonly path: string

  // 惰性缓存的 prepared statements：首次使用时 prepare 后复用，避免 M6/M8 秒级轮询重复编译 SQL。
  private sInsertUsage: Database.Statement<unknown[]> | null = null
  private sLatestUsage: Database.Statement<unknown[], RawUsageRow> | null = null
  private sLatestUsageByProvider: Database.Statement<unknown[], RawUsageRow> | null = null
  private s30DayBalance: Database.Statement<unknown[], RawDayRow> | null = null
  private sInsertApproval: Database.Statement<unknown[]> | null = null
  private sRecentApprovals: Database.Statement<unknown[], RawApprovalRow> | null = null
  private sAllApprovals: Database.Statement<unknown[], RawApprovalRow> | null = null

  /**
   * @param dbPath 显式路径（测试/验收用）；省略则用 resolveDefaultDbPath()。
   * 构造函数内的 mkdir / new Database 失败属致命错误，直接抛出。
   */
  constructor(dbPath?: string) {
    this.path = dbPath ?? resolveDefaultDbPath()
    // 确保父目录存在（默认 fallback 目录可能尚未创建；/tmp 等已存在时为 no-op）
    mkdirSync(dirname(this.path), { recursive: true })
    this.db = new Database(this.path)
  }

  /** 开 WAL + 建表/索引（幂等）+ api_usage 旧库迁移（幂等）。致命错误抛出。 */
  initDB(): void {
    this.db.pragma('journal_mode = WAL')
    this.db.exec(SCHEMA_SQL)
    this.migrateApiUsageColumns()
  }

  /**
   * M13.4 幂等迁移：CREATE TABLE IF NOT EXISTS 对已有 api_usage 表不生效（开发期用户库
   * 已存在但无 billing/unit 列），故建表后用 PRAGMA table_info 检查，缺列则 ALTER TABLE
   * ADD COLUMN（NOT NULL 需常量默认值，'' 合法）。重复启动不重复加列；已有行新列默认 ''。
   * 属 initDB 致命错误范畴：不捕获，直接抛。
   */
  private migrateApiUsageColumns(): void {
    const cols = this.db.prepare('PRAGMA table_info(api_usage)').all() as Array<{ name: string }>
    const names = new Set(cols.map((c) => c.name))
    if (!names.has('billing')) {
      this.db.exec("ALTER TABLE api_usage ADD COLUMN billing TEXT NOT NULL DEFAULT ''")
    }
    if (!names.has('unit')) {
      this.db.exec("ALTER TABLE api_usage ADD COLUMN unit TEXT NOT NULL DEFAULT ''")
    }
  }

  /**
   * 用量快照落库。M13.4：billing/unit 为可选参，缺省写 ''——现有调用方（services.ts）
   * 仍传 4 参不受影响；M13.5 调度泛化后传 6 参记录计费形式与显示单位。
   */
  recordUsage(
    provider: string,
    model: string,
    balance: number,
    currency: string,
    billing?: BillingMode,
    unit?: string
  ): void {
    try {
      const stmt = (this.sInsertUsage ??= this.db.prepare<unknown[]>(INSERT_USAGE))
      stmt.run(provider, model, balance, currency, billing ?? '', unit ?? '')
    } catch (err) {
      console.warn(`[db] recordUsage 失败: ${(err as Error).message}`)
    }
  }

  getLatestUsage(): UsageRecord[] {
    try {
      const stmt = (this.sLatestUsage ??= this.db.prepare<unknown[], RawUsageRow>(
        SELECT_LATEST_USAGE
      ))
      return stmt.all().map(toUsageRecord)
    } catch (err) {
      console.warn(`[db] getLatestUsage 失败: ${(err as Error).message}`)
      return []
    }
  }

  /**
   * M13.4：单 provider 最新一条（多卡视图"单卡查询"用，避免每卡全量扫 getLatestUsage）。
   * 无该 provider 记录返回 null。
   */
  getLatestUsageByProvider(provider: string): UsageRecord | null {
    try {
      const stmt = (this.sLatestUsageByProvider ??= this.db.prepare<unknown[], RawUsageRow>(
        SELECT_LATEST_USAGE_BY_PROVIDER
      ))
      const row = stmt.get(provider)
      return row ? toUsageRecord(row) : null
    } catch (err) {
      console.warn(`[db] getLatestUsageByProvider 失败: ${(err as Error).message}`)
      return null
    }
  }

  get30DayBalance(provider: string, model: string): BalanceDailySnapshot[] {
    try {
      const stmt = (this.s30DayBalance ??= this.db.prepare<unknown[], RawDayRow>(
        SELECT_30DAY_BALANCE
      ))
      return stmt.all(provider, model).map((row) => ({ day: row.day, balance: row.balance }))
    } catch (err) {
      console.warn(`[db] get30DayBalance 失败: ${(err as Error).message}`)
      return []
    }
  }

  /** 审批历史落库（唯一落库点在 server.ts POST /approve，§5.3）。tool 为实际工具名（M12 审批镜像轮，B2 整改）。 */
  recordApproval(
    harness: string,
    sessionName: string | null,
    command: string,
    cwd: string | null,
    tool: string,
    allowed: boolean
  ): void {
    try {
      const stmt = (this.sInsertApproval ??= this.db.prepare<unknown[]>(INSERT_APPROVAL))
      stmt.run(harness, sessionName, command, cwd, tool, allowed ? 1 : 0)
    } catch (err) {
      console.warn(`[db] recordApproval 失败: ${(err as Error).message}`)
    }
  }

  /** limit 缺省/≤0 → 返回全部审批历史（滚动展示全部）；否则返回最近 limit 条 */
  getRecentApprovals(limit?: number): ApprovalRecord[] {
    try {
      if (typeof limit === 'number' && limit > 0) {
        const stmt = (this.sRecentApprovals ??= this.db.prepare<unknown[], RawApprovalRow>(
          SELECT_RECENT_APPROVALS
        ))
        return stmt.all(limit).map(toApprovalRecord)
      }
      const all = (this.sAllApprovals ??= this.db.prepare<unknown[], RawApprovalRow>(
        SELECT_ALL_APPROVALS
      ))
      return all.all().map(toApprovalRecord)
    } catch (err) {
      console.warn(`[db] getRecentApprovals 失败: ${(err as Error).message}`)
      return []
    }
  }

  close(): void {
    try {
      this.db.close()
    } catch (err) {
      console.warn(`[db] close 失败: ${(err as Error).message}`)
    }
  }
}
