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
// M15：仅成功调用（status_code 2xx）计入（用户要求：调用失败的 API 不出余量卡）。
const STATUS_OK = 'status_code >= 200 AND status_code < 300'
const SELECT_PROXY_LOGS =
  `SELECT provider_id, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, total_cost_usd, created_at FROM proxy_request_logs WHERE data_source = 'proxy' AND ${STATUS_OK} AND created_at >= ?`

const SELECT_PROVIDERS = 'SELECT id, name FROM providers'

// M15：providers 表含 settings_config（JSON 字符串），其中 env.ANTHROPIC_BASE_URL
// 是真实厂商 URL（host 即归并键）。读取失败/非法 → 该 provider 无 host，跳过。
const SELECT_PROVIDER_CONFIGS = 'SELECT id, name, settings_config FROM providers'

// M13.2 检测器：只统计 data_source='proxy'（理由同 SELECT_PROXY_LOGS），
// 按 provider_id 分组全时段 COUNT（calls = 该 provider 累计请求数）。
// M15：加成功过滤（仅成功调用出卡）；host 归并在 aggregate 侧做（见 detectCalled）。
const SELECT_CALLED =
  `SELECT provider_id, COUNT(*) AS calls FROM proxy_request_logs WHERE data_source = 'proxy' AND ${STATUS_OK} AND provider_id IS NOT NULL AND provider_id <> '' GROUP BY provider_id`

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

interface ProviderConfigRow {
  id: string | null
  name: string | null
  settings_config: string | null
}

// ─── 工具 ───

/** URL → hostname（归并键，不含端口）。`https://api.deepseek.com/anthropic` → `api.deepseek.com`；
 *  `http://127.0.0.1:15721` → `127.0.0.1`（本地代理端口对厂商识别无意义）。解析失败回退原串 */
export function urlHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

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
   * M15 检测器：产出"调用过的 API"证据集合，**按厂商 URL host 归并**（用户要求：
   * 一个真实调用 URL = 一张余量卡，走同一 URL 的 model 不拆卡）。
   * 读 proxy_request_logs（data_source='proxy'，仅成功 status_code 2xx）按 provider_id
   * 分组 COUNT，再经 getProviderHostMap 把 provider_id 翻译成 host；**同 host 的 calls
   * 累加**（两个百炼 provider 共享 host → 合并成一张卡）。name 取首个匹配 provider 名
   * （最终展示名由 manual 项覆盖为友好名）。按 calls 降序。
   * 任何打开/查询失败 / provider 无 host → warn + 跳过（NFR-3，调用方跳过该检测器）。
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
      const hostMap = this.readProviderHostMap(db)

      const acc = new Map<string, CalledApi>()
      for (const r of rows) {
        if (typeof r.provider_id !== 'string' || r.provider_id === '') continue
        const entry = hostMap.get(r.provider_id)
        if (!entry) continue // 无 host 的 provider（settings_config 缺失/非法）跳过
        const host = entry.host
        const existing = acc.get(host)
        if (existing) {
          existing.calls = (existing.calls ?? 0) + (Number(r.calls) || 0)
        } else {
          acc.set(host, {
            id: host,
            name: entry.name,
            evidence: 'cc-switch',
            calls: Number(r.calls) || 0
          })
        }
      }

      return [...acc.values()].sort((a, b) => (b.calls ?? 0) - (a.calls ?? 0))
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

  /**
   * M15：provider_id → {host, name} 映射。读 providers 表，解析 settings_config
   * （JSON 字符串）取 env.ANTHROPIC_BASE_URL → urlHost()（真实厂商 URL 的 host）。
   * name 取 provider.name（如"阿里云百炼-coding模型"，最终展示名由 manual 覆盖）。
   * settings_config 缺失/JSON 非法/无 BASE_URL → 该 provider 跳过（warn）。失败 → 空 Map。
   */
  getProviderHostMap(): Map<string, { host: string; name: string }> {
    let db: Database.Database
    try {
      db = new Database(this.dbPath, { readonly: true })
    } catch (err) {
      console.warn(`[cc-switch-usage] 打开库失败 ${this.dbPath}: ${(err as Error).message}`)
      return new Map()
    }
    try {
      return this.readProviderHostMap(db)
    } catch (err) {
      console.warn(`[cc-switch-usage] host 映射查询失败 ${this.dbPath}: ${(err as Error).message}`)
      return new Map()
    } finally {
      try {
        db.close()
      } catch {
        /* 关闭失败不影响已得出的降级结果 */
      }
    }
  }

  /** 读 providers 表构建 provider_id → {host, name} 映射（调用方持有 db 连接） */
  private readProviderHostMap(db: Database.Database): Map<string, { host: string; name: string }> {
    const result = new Map<string, { host: string; name: string }>()
    for (const p of db.prepare(SELECT_PROVIDER_CONFIGS).all() as ProviderConfigRow[]) {
      if (typeof p.id !== 'string' || p.id === '' || !p.settings_config) continue
      let config: unknown
      try {
        config = JSON.parse(p.settings_config)
      } catch {
        console.warn(`[cc-switch-usage] provider ${p.id} settings_config 非法，跳过 host 归并`)
        continue
      }
      const env = (config as { env?: Record<string, unknown> } | null)?.env
      const baseUrl = typeof env?.['ANTHROPIC_BASE_URL'] === 'string' ? env['ANTHROPIC_BASE_URL'] : undefined
      if (!baseUrl) continue // 无 BASE_URL（如 claude-desktop-official 等纯本地型）无厂商 host
      const host = urlHost(baseUrl)
      if (!host) continue
      result.set(p.id, { host, name: p.name ?? p.id })
    }
    return result
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
