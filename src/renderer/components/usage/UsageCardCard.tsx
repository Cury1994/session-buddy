import { useEffect, useState } from 'react'

import TrendSparkline from './TrendSparkline'

import type { BalanceDailySnapshot, BillingMode, UsageCard } from '../../../shared/types'

/**
 * M13.6 — 单张用量卡（余量卡 / 槽位卡统一渲染，TASKS M13.6）
 *
 * 按 card.status 分形态：
 *   - ok：余量卡 —— 标题行（name + 计费徽章）+ Live 徽章；余量大数字（symbol/unit）；
 *     低余量红字警示（remaining < warnThreshold，无 per-card 线则用全局兜底线
 *     defaultThreshold）；元信息（币种/单位 + updatedAt 时刻部分）；30 天趋势
 *     （挂载按需 getBalanceHistory(sourceId)，复用 M8 TrendSparkline）
 *   - missing-config：槽位卡 —— "未配置"徽章 + 调用次数（有则显）+ 引导文案
 *     （missingHint 或默认）+ [配置此 API →] 按钮 → onOpenSettings(sourceId)
 *   - missing-credential：槽位卡 —— "待凭证"徽章 + missingHint + [配置凭证 →] 按钮
 *   - error：查询失败徽章 + 弱化提示（NFR-3 自动重试，保留上次展示由主进程缓存保证）
 *
 * 趋势数据（按需拉取）：模块级缓存（sourceId → snapshots），挂载命中缓存即用、
 * 未命中拉取后写入；卸载清理缓存 —— 视图重挂载后重新按需拉取（与"卡片内按需"
 * 设计一致；同一挂载周期内多轮 push 更新卡片不触发重拉）。
 */

/** 币种 → 符号（渲染端展示用；未知币种回退空，余量数字带单位文本） */
const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥'
}

/** 槽位卡状态 → 徽章文案（error 态提示固定，不随卡片变化） */
const STATUS_BADGE: Record<UsageCard['status'], { text: string; className: string } | null> = {
  ok: null,
  'missing-config': { text: '未配置', className: 'usage-badge-missing-config' },
  'missing-credential': { text: '待凭证', className: 'usage-badge-missing-credential' },
  error: { text: '查询失败', className: 'usage-badge-error' }
}

/**
 * 计费形式 → 徽章类名。必须**字面引用**而非 `usage-badge-${billing}` 模板：
 * Tailwind 3.4 会对 @layer components 内的自定义 CSS 做内容扫描（类名字符串未在
 * 源码字面出现即被丢弃，M13.6 排查实证：usage-badge-payg/subscription 因此被
 * 构建剥离），模板拼接产生的类名样式不会保留。SettingsView 复用同一映射。
 */
export const BILLING_BADGE_CLASS: Record<BillingMode, string> = {
  payg: 'usage-badge-payg',
  subscription: 'usage-badge-subscription'
}

/** 30 天趋势按需缓存（sourceId → snapshots；卸载时由组件清理对应项） */
const trendCache = new Map<string, BalanceDailySnapshot[]>()

interface UsageCardCardProps {
  card: UsageCard
  /** 全局最低告警线兜底（无 per-card warnThreshold 的 ok 卡使用，useUsageData 派生） */
  defaultThreshold: number
  /** 跳设置页并聚焦该用量源（槽位卡"配置"按钮；focus=sourceId，App 转 SettingsView） */
  onOpenSettings?: (focus?: string) => void
}

function UsageCardCard({ card, defaultThreshold, onOpenSettings }: UsageCardCardProps): React.JSX.Element {
  // 趋势：挂载按需拉取（缓存命中即用；卸载清理缓存）
  const [history, setHistory] = useState<BalanceDailySnapshot[]>(() => trendCache.get(card.sourceId) ?? [])
  const [trendLoading, setTrendLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const cached = trendCache.get(card.sourceId)
    if (cached) {
      setHistory(cached)
      return
    }
    setTrendLoading(true)
    window.electronAPI
      .getBalanceHistory(card.sourceId)
      .then((snapshots) => {
        if (cancelled) return
        trendCache.set(card.sourceId, snapshots)
        setHistory(snapshots)
      })
      .catch(() => {
        /* 趋势拉取失败：保留空趋势（NFR-3 失败保留数据原则） */
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false)
      })
    return () => {
      cancelled = true
      trendCache.delete(card.sourceId)
    }
  }, [card.sourceId])

  // —— 余量卡派生量（status=ok 时 remaining/unit/updatedAt 有值，M13.5 契约） ——
  const amount = card.remaining
  const threshold = card.warnThreshold ?? defaultThreshold
  const isLow = amount !== undefined && amount < threshold
  // 金额符号：优先币种映射，其次单位映射（如 unit=CNY）；无映射（token/次）则数字后带单位文本
  const symbol =
    (card.currency !== undefined ? CURRENCY_SYMBOLS[card.currency] : undefined) ??
    (card.unit !== undefined ? CURRENCY_SYMBOLS[card.unit] : undefined) ??
    ''
  /** 千分位 + 两位小数（10.44 → "10.44"；token 类大整数 → "3,190,000.00"） */
  const amountText = amount?.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  /** "YYYY-MM-DD HH:MM:SS" → 仅时刻部分（日期对实时余量是噪音，M8 同款） */
  const timeText = card.updatedAt ? (card.updatedAt.split(' ')[1] ?? card.updatedAt) : ''
  const metaText = [card.currency ?? card.unit, timeText ? `更新于 ${timeText}` : null]
    .filter((part): part is string => part !== null && part !== undefined && part !== '')
    .join(' · ')
  const thresholdText = Number.isInteger(threshold)
    ? String(threshold)
    : threshold.toFixed(2)

  const statusBadge = STATUS_BADGE[card.status]

  return (
    <div className="card">
      {/* ── 标题行：name + 计费徽章 + 状态徽章 + Live ── */}
      <div className="usage-card-header">
        <span className="usage-card-title">{card.name}</span>
        <span className="usage-card-status">
          <span className={`usage-badge ${BILLING_BADGE_CLASS[card.billing]}`}>
            {card.billing === 'payg' ? '按量' : '订阅'}
          </span>
          {statusBadge && <span className={`usage-badge ${statusBadge.className}`}>{statusBadge.text}</span>}
          {card.status === 'ok' && (
            <span className="live-badge">
              <span className="live-dot" />
              Live
            </span>
          )}
        </span>
      </div>

      {card.status === 'ok' && amount !== undefined && amountText !== undefined ? (
        <>
          {/* ── 余量大数字 ── */}
          <div className="usage-remaining">
            {symbol && <span className="usage-remaining-symbol">{symbol}</span>}
            {amountText}
            {!symbol && card.unit && <span className="usage-remaining-unit"> {card.unit}</span>}
          </div>
          {isLow && (
            <div className="usage-warning">
              低于告警线 {symbol}
              {thresholdText}
            </div>
          )}
          <div className="usage-meta">{metaText}</div>

          {/* ── 30 天趋势（挂载按需拉取，复用 M8 TrendSparkline） ── */}
          <div className="usage-trend">
            <div className="usage-trend-label">近 30 天趋势</div>
            {trendLoading && history.length === 0 ? (
              <p className="empty-state empty-state-compact">趋势加载中…</p>
            ) : history.length > 0 ? (
              <TrendSparkline data={history} height={60} />
            ) : (
              <p className="empty-state empty-state-compact">暂无历史余量快照</p>
            )}
          </div>
        </>
      ) : card.status === 'missing-config' ? (
        <>
          {card.calls !== undefined && <div className="slot-calls">调用过 · {card.calls} 次</div>}
          <p className="slot-hint">
            {card.missingHint || '已调用过此 API，但未配置余量查询'}
          </p>
          <div className="slot-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onOpenSettings?.(card.sourceId)}
            >
              配置此 API →
            </button>
          </div>
        </>
      ) : card.status === 'missing-credential' ? (
        <>
          <p className="slot-hint">{card.missingHint || '缺少凭证，无法查询余量'}</p>
          <div className="slot-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onOpenSettings?.(card.sourceId)}
            >
              配置凭证 →
            </button>
          </div>
        </>
      ) : (
        <p className="slot-hint">余量查询失败，将自动重试</p>
      )}
    </div>
  )
}

export default UsageCardCard
