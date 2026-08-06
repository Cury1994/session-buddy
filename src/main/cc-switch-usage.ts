import { homedir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'

import type { CalledApi, ConsumptionBucket, ConsumptionSummary } from '../shared/types'

/**
 * M13b — cc-switch 数据源（消耗聚合 + M13.2 检测器）
 *
 * 只读访问 cc-switch 本地库：
 *   - getConsumption()：聚合 proxy_request_logs 产出 5h/24h/7d 消耗（消耗卡，未来可能用）
 *   - detectCalled()：按 provider_id 分组 COUNT 产出"调用过的 API"证据（M13.2 检测器注册表用）
 * 该库由 cc-switch 持续写入（可能处于 WAL 模式）：readonly 打开、每次查询新开
 * 短驻连接用完即关，避免与其写锁冲突。任何打开/查询失败 → warn + 返回 []
 * （NFR-3 失败不崩，UI 做空态）。纯 node 模块，不 import electron。
 */

// ─── 时间窗口（秒） ───

const WINDOW_SEC = {
  h5: 5 * 3600,
  h24: 24 * 3600,
  d7: 7 * 24 * 3600
} as const

// 只统计 data_source='proxy'：session_log / codex_session 是无 provider 归属的
// 通用会话汇总行（provider_id='_session' 等），计入会污染各 provider 消耗。
const SELECT_PROXY_LOGS =
  "SELECT provider_id, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, total_cost_usd, created_at FROM proxy_request_logs WHERE data_source = 'proxy' AND created_at >= ?"

const SELECT_PROVIDERS = 'SELECT id, name FROM providers'

// M13.2 检测器：只统计 data_source='proxy'（理由同 SELECT_PROXY_LOGS），
// 按 provider_id 分组全时段 COUNT（calls = 该 provider 累计请求数）。
const SELECT_CALLED =
  "SELECT provider_id, COUNT(*) AS calls FROM proxy_request_logs WHERE data_source = 'proxy' AND provider_id IS NOT NULL AND provider_id <> '' GROUP BY provider_id"

// ─── 行原始结构（better-sqlite3 列值可空，统一按可空声明，读取侧 Number 兜底） ───

interface ProxyLogRow {
  provider_id: string | null
  input_tokens: number | null
  output_tokens: number | null
  cache_read_tokens: number | null
  cache_creation_tokens: number | null
  total_cost_usd: number | null
  created_at: number | null
}

interface ProviderRow {
  id: string | null
  name: string | null
}

interface CalledRow {
  provider_id: string | null
  calls: number | null
}

// ─── 工具 ───

/** `~` / `~/…` 展开为 home（同 permission-mirror / claude-sessions 的 expandHome 约定） */
function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return p
}

function emptyBucket(): ConsumptionBucket {
  return { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheTokens: 0, requests: 0 }
}

function addToBucket(bucket: ConsumptionBucket, row: ProxyLogRow): void {
  bucket.costUsd += Number(row.total_cost_usd) || 0
  bucket.inputTokens += Number(row.input_tokens) || 0
  bucket.outputTokens += Number(row.output_tokens) || 0
  bucket.cacheTokens += (Number(row.cache_read_tokens) || 0) + (Number(row.cache_creation_tokens) || 0)
  bucket.requests += 1
}

/** Unix 秒 → 本地 "YYYY-MM-DD HH:MM:SS"（与全链路本地时间约定一致，渲染端按字面展示） */
function formatLocalTime(sec: number): string {
  const d = new Date(sec * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ─── 读取器 ───

export class CcSwitchUsageReader {
  private readonly dbPath: string

  /** dbPath 支持 `~` 前缀，构造时展开为绝对路径 */
  constructor(dbPath: string) {
    this.dbPath = expandHome(dbPath)
  }

  /**
   * 聚合 7d 窗口内所有 proxy 请求日志，按 provider_id 分组产出 5h/24h/7d 消耗。
   * 7d 一次取回、内存分窗（单一 now 基准，保证 h5 ⊆ h24 ⊆ d7 单调）；
   * 窗口内无日志的 provider 不出卡（惰性出卡）。按 providerId 排序。
   */
  getConsumption(): ConsumptionSummary[] {
    let db: Database.Database
    try {
      db = new Database(this.dbPath, { readonly: true })
    } catch (err) {
      console.warn(`[cc-switch-usage] 打开库失败 ${this.dbPath}: ${(err as Error).message}`)
      return []
    }

    try {
      const nowSec = Math.floor(Date.now() / 1000)
      const rows = db.prepare(SELECT_PROXY_LOGS).all(nowSec - WINDOW_SEC.d7) as ProxyLogRow[]

      const names = new Map<string, string>()
      for (const p of db.prepare(SELECT_PROVIDERS).all() as ProviderRow[]) {
        if (p.id && p.name) names.set(p.id, p.name)
      }

      return this.aggregate(rows, names, nowSec)
    } catch (err) {
      console.warn(`[cc-switch-usage] 查询失败 ${this.dbPath}: ${(err as Error).message}`)
      return []
    } finally {
      try {
        db.close()
      } catch {
        /* 关闭失败不影响已得出的降级结果 */
      }
    }
  }

  /**
   * M13.2 检测器：产出"调用过的 API"证据集合。
   * 读 proxy_request_logs（data_source='proxy'）按 provider_id 分组 COUNT，
   * join providers 表取展示名，产出 `{ id: provider_id, name, evidence:'cc-switch', calls }`。
   * 按 calls 降序。任何打开/查询失败 → warn + 返回 []（NFR-3，调用方跳过该检测器）。
   */
  detectCalled(): CalledApi[] {
    let db: Database.Database
    try {
      db = new Database(this.dbPath, { readonly: true })
    } catch (err) {
      console.warn(`[cc-switch-usage] 打开库失败 ${this.dbPath}: ${(err as Error).message}`)
      return []
    }

    try {
      const rows = db.prepare(SELECT_CALLED).all() as CalledRow[]

      const names = new Map<string, string>()
      for (const p of db.prepare(SELECT_PROVIDERS).all() as ProviderRow[]) {
        if (p.id && p.name) names.set(p.id, p.name)
      }

      return rows
        .filter((r): r is CalledRow & { provider_id: string } => typeof r.provider_id === 'string' && r.provider_id !== '')
        .map((r) => ({
          id: r.provider_id,
          name: names.get(r.provider_id) ?? r.provider_id,
          evidence: 'cc-switch' as const,
          calls: Number(r.calls) || 0
        }))
        .sort((a, b) => (b.calls ?? 0) - (a.calls ?? 0))
    } catch (err) {
      console.warn(`[cc-switch-usage] 检测查询失败 ${this.dbPath}: ${(err as Error).message}`)
      return []
    } finally {
      try {
        db.close()
      } catch {
        /* 关闭失败不影响已得出的降级结果 */
      }
    }
  }

  private aggregate(
    rows: ProxyLogRow[],
    names: Map<string, string>,
    nowSec: number
  ): ConsumptionSummary[] {
    const cutoffH5 = nowSec - WINDOW_SEC.h5
    const cutoffH24 = nowSec - WINDOW_SEC.h24

    const acc = new Map<string, ConsumptionSummary>()
    const lastSeen = new Map<string, number>()

    for (const row of rows) {
      if (!row.provider_id) continue // 无归属行不计入任何 provider
      const at = Number(row.created_at) || 0

      let entry = acc.get(row.provider_id)
      if (!entry) {
        entry = {
          providerId: row.provider_id,
          providerName: names.get(row.provider_id) ?? row.provider_id,
          h5: emptyBucket(),
          h24: emptyBucket(),
          d7: emptyBucket(),
          lastRequestAt: null
        }
        acc.set(row.provider_id, entry)
      }

      addToBucket(entry.d7, row) // SQL 已保证 created_at 在 d7 窗口内
      if (at >= cutoffH24) addToBucket(entry.h24, row)
      if (at >= cutoffH5) addToBucket(entry.h5, row)
      lastSeen.set(row.provider_id, Math.max(lastSeen.get(row.provider_id) ?? 0, at))
    }

    const result = [...acc.values()]
    for (const s of result) {
      const at = lastSeen.get(s.providerId) ?? 0
      s.lastRequestAt = at > 0 ? formatLocalTime(at) : null
    }
    return result.sort((a, b) => a.providerId.localeCompare(b.providerId))
  }
}
