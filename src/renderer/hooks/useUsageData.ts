import { useEffect, useState } from 'react'

import type { BalanceDailySnapshot, UsageRecord } from '../../shared/types'

/**
 * M8 — 用量视图数据 hook（TASKS §9 / DESIGN §4 数据流）
 *
 * 数据链路：
 *   - 初始加载：usage:get（最新余额快照）+ usage:history（30 天余额走势）+
 *     config:get（balance_warn_threshold，低余额警示判定）
 *   - push 更新：onUsageUpdated（services.ts 每轮余额查询后 push UsageRecord[]）
 *     → 更新 latest 并重取趋势（当日快照随新记录变化，30 行查询成本低）
 *
 * 容错：
 *   - 初始加载失败 → error（视图展示错误态）
 *   - push 后的 history 重取失败 → 静默保留上次趋势（NFR-3 失败保留数据原则）
 *   - config 读取理论上不失败（loadConfig 内部已降级 DEFAULT_CONFIG，M2），
 *     仍兜底阈值 10（与 config.ts DEFAULT_CONFIG 一致）
 */

export interface UsageDataState {
  /** 最新余额记录（单 provider 下取首条；无任何记录为 null → EmptyState） */
  latest: UsageRecord | null
  /** 30 天每日余额快照（day 升序，db.get30DayBalance） */
  daily: BalanceDailySnapshot[]
  /** 低余额告警线（¥ 绝对金额，config providers.deepseek.balance_warn_threshold） */
  warnThreshold: number
  /** 初始加载中 */
  loading: boolean
  /** 初始加载错误信息（成功为 null） */
  error: string | null
}

export function useUsageData(): UsageDataState {
  const [latest, setLatest] = useState<UsageRecord | null>(null)
  const [daily, setDaily] = useState<BalanceDailySnapshot[]>([])
  const [warnThreshold, setWarnThreshold] = useState(10)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const [records, history, config] = await Promise.all([
          window.electronAPI.getUsageData(),
          window.electronAPI.getBalanceHistory(),
          window.electronAPI.getConfig()
        ])
        if (cancelled) return
        setLatest(records[0] ?? null)
        setDaily(history)
        setWarnThreshold(config.providers.deepseek.balance_warn_threshold)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    // 余额 push：更新 latest + 重取趋势（当日快照可能新增/上移）
    const unsubscribe = window.electronAPI.onUsageUpdated((records) => {
      if (cancelled) return
      setLatest(records[0] ?? null)
      setLoading(false)
      window.electronAPI
        .getBalanceHistory()
        .then((history) => {
          if (!cancelled) setDaily(history)
        })
        .catch(() => {
          /* 趋势重取失败：保留上次数据（NFR-3） */
        })
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return { latest, daily, warnThreshold, loading, error }
}
