import { useEffect, useState } from 'react'

import type { AppConfig, UsageCard } from '../../shared/types'

/**
 * M13.6 — 用量视图数据 hook（多卡泛化，TASKS M13.6 / DESIGN §4 数据流）
 *
 * 数据链路（取代 M8 单 provider 余额 hook）：
 *   - 初始加载：usage:get（调度器缓存的最新 UsageCard[]，M13.5 每轮 tick 刷新）+
 *     config:get（派生 defaultThreshold —— 无 per-card warnThreshold 的卡的兜底告警线，
 *     语义同 server.ts computeGlobalWarnThreshold：非 bss 源最低告警线，缺省 10）
 *   - push 更新：onUsageUpdated（services.ts 每轮多卡查询后 push UsageCard[]）
 *     → 整组替换（主进程每轮全量构建，无增量语义）
 *   - 30 天趋势：**不在本 hook 预拉**（避免多卡串行请求）——由 UsageCardCard 挂载时
 *     按 sourceId 按需 getBalanceHistory(sourceId)，缓存 / 卸载清理（见该组件）
 *
 * 容错：
 *   - 初始加载失败 → error（视图展示错误态）
 *   - push 后的卡片状态即为最新（失败卡 status=error，NFR-3 保留上次展示由主进程保证）
 *   - config 读取理论上不失败（loadConfig 内部已降级 DEFAULT_CONFIG，M2），仍兜底阈值 10
 */

/** 默认告警线兜底（与 config.ts DEFAULT_CONFIG 的 warn_threshold 一致） */
const FALLBACK_THRESHOLD = 10

/** config.usage_sources → 非 bss 源最低告警线（语义同 server.ts computeGlobalWarnThreshold） */
function deriveDefaultThreshold(config: AppConfig): number {
  let min = Infinity
  for (const source of config.usage_sources ?? []) {
    if (source.kind === 'bss') continue
    const t = source.warn_threshold
    if (typeof t === 'number' && Number.isFinite(t) && t < min) min = t
  }
  return Number.isFinite(min) ? min : FALLBACK_THRESHOLD
}

export interface UsageDataState {
  /** 最新用量卡（余量卡 + 槽位卡，调度器每轮全量构建；空数组 → EmptyState） */
  cards: UsageCard[]
  /** 全局最低告警线兜底（无 per-card warnThreshold 的 ok 卡使用，见 UsageCardCard） */
  defaultThreshold: number
  /** 初始加载中（无任何卡时展示加载提示） */
  loading: boolean
  /** 初始加载错误信息（成功为 null） */
  error: string | null
}

export function useUsageData(): UsageDataState {
  const [cards, setCards] = useState<UsageCard[]>([])
  const [defaultThreshold, setDefaultThreshold] = useState(FALLBACK_THRESHOLD)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const [cardList, config] = await Promise.all([
          window.electronAPI.getUsageData(),
          window.electronAPI.getConfig()
        ])
        if (cancelled) return
        setCards(cardList)
        setDefaultThreshold(deriveDefaultThreshold(config))
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    // 用量 push：整组替换（每轮 tick 全量构建，首轮前 getUsageData 返回 []）
    const unsubscribe = window.electronAPI.onUsageUpdated((cardList) => {
      if (cancelled) return
      setCards(cardList)
      setLoading(false)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return { cards, defaultThreshold, loading, error }
}
