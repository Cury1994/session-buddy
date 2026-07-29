import { useId, useRef, useState } from 'react'

import type { BalanceDailySnapshot } from '../../../shared/types'

/**
 * M8 — 30 天余额迷你趋势图（原生 SVG，TASKS §9 / DESIGN §4）
 *
 * 不引入任何图表库（recharts 已于本模块移除）。结构对标基准原型
 * harness_monitor.html 的 sparkline 段：viewBox 100×40 + preserveAspectRatio="none"
 * 铺满容器，面积渐变 + 折线两路 path。
 *
 * 视觉规格（M8 任务书锁定）：
 *   - 高度 60px，无坐标轴 / 图例 / 刻度
 *   - 折线 #00bfa5，stroke-width 1.5（vector-effect: non-scaling-stroke 保证
 *     非等比缩放下线宽不被拉伸变形）
 *   - 面积填充线性渐变 rgba(0,191,165,0.15) → 透明
 *
 * 交互：hover 显示最近数据点的日期 + 余额 Tooltip（CSS absolute 跟随鼠标，
 * 左右钳位不出容器），并在该点渲染高亮圆点。
 *
 * 边界：data 为空 → 不渲染（返回 null，graceful）；单点 → 水平直线居中。
 */

interface TrendSparklineProps {
  /** 30 天每日余额快照（day 升序） */
  data: BalanceDailySnapshot[]
  /** 容器高度 px，默认 60 */
  height?: number
}

/** viewBox 坐标系（与原型一致：100×40，preserveAspectRatio="none" 拉伸铺满） */
const VB_W = 100
const VB_H = 40
/** 上下留白（viewBox 单位），避免折线贴边 */
const PAD_Y = 4

/** hover 状态（容器 px 坐标，mousemove 时一次算好直接渲染） */
interface HoverState {
  idx: number // 最近数据点下标
  dotX: number // 高亮点 px 横坐标
  dotY: number // 高亮点 px 纵坐标
  tipX: number // Tooltip px 横坐标（已钳位，translate(-50%) 基准）
  tipY: number // Tooltip px 纵坐标
}

function TrendSparkline({ data, height = 60 }: TrendSparklineProps): React.JSX.Element | null {
  // useId 生成的 id 含冒号，url(#...) 引用需剔除（CSS url 解析不兼容）
  const gradientId = `spark-fill-${useId().replace(/:/g, '')}`
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<HoverState | null>(null)

  if (data.length === 0) return null // 空数据 graceful：不渲染

  const n = data.length
  const balances = data.map((d) => d.balance)
  const lastBalance = balances[n - 1] ?? 0 // n ≥ 1 已由空数据提前返回保证
  const min = Math.min(...balances)
  const max = Math.max(...balances)
  const flat = max === min // 全等余额（如首日单快照）→ 居中水平线，避免除零

  /** 余额 → 归一化 [0,1]（0=最小值） */
  const norm = (v: number): number => (flat ? 0.5 : (v - min) / (max - min))
  /** 余额 → viewBox y（上小下大，带 PAD_Y 留白） */
  const yVB = (v: number): number => PAD_Y + (1 - norm(v)) * (VB_H - 2 * PAD_Y)
  /** 下标 → viewBox x（单点居中） */
  const xVB = (i: number): number => (n === 1 ? VB_W / 2 : (i / (n - 1)) * VB_W)

  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xVB(i).toFixed(2)},${yVB(d.balance).toFixed(2)}`)
    .join(' ')
  // 面积 path：折线 + 闭合到底边
  const areaPath = `${linePath} L${xVB(n - 1).toFixed(2)},${VB_H} L${xVB(0).toFixed(2)},${VB_H} Z`

  /** viewBox 坐标 → 容器 px（preserveAspectRatio="none" 下两轴线性映射） */
  const toPxX = (vx: number, width: number): number => (vx / VB_W) * width
  const toPxY = (vy: number): number => (vy / VB_H) * height

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>): void {
    const el = wrapRef.current
    if (!el || n === 0) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return
    // 鼠标横坐标 → 最近数据点（t 钳位 [0,1]）
    const t = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const idx = Math.round(t * (n - 1))
    const point = data[idx]
    if (!point) return
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    setHover({
      idx,
      dotX: toPxX(xVB(idx), rect.width),
      dotY: toPxY(yVB(point.balance)),
      // Tooltip 跟随鼠标：上方 34px，越顶则压回；左右钳位防出容器
      // （半宽按 ~52px 估，10px 字号下 "2026-07-29 / ¥10.77" 两行约 100px 宽）
      tipX: Math.min(rect.width - 52, Math.max(52, mouseX)),
      tipY: Math.max(0, mouseY - 34)
    })
  }

  const hoverPoint = hover ? data[hover.idx] : null

  return (
    <div
      ref={wrapRef}
      className="sparkline-wrap"
      style={{ height }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        className="sparkline-svg"
        role="img"
        aria-label={`近 30 天余额趋势，最新 ¥${lastBalance.toFixed(2)}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0, 191, 165, 0.15)" />
            <stop offset="100%" stopColor="rgba(0, 191, 165, 0)" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke="#00bfa5"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {hover && hoverPoint && (
        <>
          <span
            className="sparkline-dot"
            style={{ left: hover.dotX, top: hover.dotY }}
          />
          <span className="sparkline-tooltip" style={{ left: hover.tipX, top: hover.tipY }}>
            <span className="sparkline-tooltip-day">{hoverPoint.day}</span>
            <span className="sparkline-tooltip-val">¥{hoverPoint.balance.toFixed(2)}</span>
          </span>
        </>
      )}
    </div>
  )
}

export default TrendSparkline
