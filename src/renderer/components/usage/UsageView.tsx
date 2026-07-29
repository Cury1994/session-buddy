import TrendSparkline from './TrendSparkline'
import { useUsageData } from '../../hooks/useUsageData'

/**
 * M8 — API 用量视图（TASKS §9 / DESIGN §4，替换 M7 占位）
 *
 * 结构（基准原型 harness_monitor.html view-usage 段）：
 *   ├── 余额卡：标题 "Current API Balance" + Live 绿色徽章（#00bfa5 圆点）
 *   │     ├── 余额大数字 ¥xx.xx（28px，¥ 符号 16px 顶对齐）
 *   │     ├── 低余额警示：balance < 阈值 → 红色小字 "低于告警线 ¥N"
 *   │     │   （不画进度条——API 无总预算分母，v2.3 裁剪决策）
 *   │     └── 元信息行：币种 + 最近快照时间（UsageRecord.timestamp 字面展示）
 *   └── 趋势卡："余额趋势 · 近 30 天" + TrendSparkline（原生 SVG）
 *
 * 状态分支（数据经 useUsageData hook，§4 数据流）：
 *   loading（无缓存）→ 加载提示 ｜ error 且无数据 → 错误提示 ｜
 *   latest 为 null → EmptyState（未配置 DEEPSEEK_API_KEY / 查询失败）｜ 正常渲染
 */
function UsageView(): React.JSX.Element {
  const { latest, daily, warnThreshold, loading, error } = useUsageData()

  const lowBalance = latest !== null && latest.balance < warnThreshold
  /** 告警线展示：整数省略小数位（config 默认 10 → "¥10"） */
  const thresholdText = Number.isInteger(warnThreshold)
    ? String(warnThreshold)
    : warnThreshold.toFixed(2)
  /** timestamp "YYYY-MM-DD HH:MM:SS" → 仅时刻部分（日期部分对"实时余额"是噪音） */
  const timeText = latest ? (latest.timestamp.split(' ')[1] ?? latest.timestamp) : ''

  return (
    <>
      {/* ── 余额卡 ── */}
      <div className="card">
        <div className="usage-card-header">
          <span className="usage-card-title">Current API Balance</span>
          {latest && (
            <span className="live-badge">
              <span className="live-dot" />
              Live
            </span>
          )}
        </div>

        {error && !latest ? (
          <p className="empty-state">数据加载失败：{error}</p>
        ) : loading && !latest ? (
          <p className="empty-state">正在获取余额数据…</p>
        ) : !latest ? (
          /* EmptyState：无记录（未配置 API Key / 余额查询持续失败，NFR-3） */
          <p className="empty-state">
            尚未获取到余额数据。
            <br />
            请确认已配置 DEEPSEEK_API_KEY，余额查询成功后将自动显示。
          </p>
        ) : (
          <>
            <div className="balance-display">
              <span className="balance-symbol">¥</span>
              {latest.balance.toFixed(2)}
            </div>
            {lowBalance && (
              <div className="balance-warning">低于告警线 ¥{thresholdText}</div>
            )}
            <div className="balance-meta">
              {latest.balanceCurrency}
              {timeText && ` · 更新于 ${timeText}`}
            </div>
          </>
        )}
      </div>

      {/* ── 30 天余额趋势卡 ── */}
      <div className="card">
        <div className="usage-card-title usage-trend-title">余额趋势 · 近 30 天</div>
        {daily.length > 0 ? (
          <TrendSparkline data={daily} height={60} />
        ) : (
          <p className="empty-state empty-state-compact">暂无历史余额快照</p>
        )}
      </div>
    </>
  )
}

export default UsageView
