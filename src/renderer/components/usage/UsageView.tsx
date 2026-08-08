import UsageCardCard from './UsageCardCard'
import { useUsageData } from '../../hooks/useUsageData'

/**
 * M13.6 — API 用量视图（多卡泛化，TASKS M13.6 / DESIGN §4）
 *
 * 取代 M8 单 provider 余额卡：渲染 useUsageData 产出的全部 UsageCard，
 * 每卡 = 一个 API（余量卡 ok / 槽位卡 missing-config·missing-credential / error）。
 *
 * 状态分支：
 *   error 且无卡 → 错误提示 ｜ loading 且无卡 → 加载提示 ｜
 *   cards 为空 → EmptyState（尚未检测到调用过的 API）｜
 *   正常 → 逐卡渲染 <UsageCardCard key={sourceId}>
 *
 * M17：用量源管理已移出设置页，槽位卡不再提供"配置"跳转（onOpenSettings 移除）。
 */
function UsageView(): React.JSX.Element {
  const { cards, defaultThreshold, loading, error } = useUsageData()

  if (error && cards.length === 0) {
    return <p className="empty-state">数据加载失败：{error}</p>
  }

  if (loading && cards.length === 0) {
    return <p className="empty-state">正在获取用量数据…</p>
  }

  if (cards.length === 0) {
    return (
      <p className="empty-state">
        尚未检测到调用过的 API。
        <br />
        成功调用 API 后，余量与上下文信息将自动显示。
      </p>
    )
  }

  return (
    <>
      {cards.map((card) => (
        <UsageCardCard
          key={card.sourceId}
          card={card}
          defaultThreshold={defaultThreshold}
        />
      ))}
    </>
  )
}

export default UsageView
