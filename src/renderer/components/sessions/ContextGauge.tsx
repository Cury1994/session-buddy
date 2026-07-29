/**
 * M9 — 上下文消耗细进度条（基准原型 Context 进度 / DESIGN §2）
 *
 * cyan #00bcd4 细条（3px），宽度 = ctxPct%；前置 "Ctx: NN%" 文字。
 * 以 fragment 返回（label + gauge），由父级 .meta-row flex 布局承载，
 * gauge flex:1 自适应、右侧 Mem 标签 margin-left:auto 靠右。
 */

interface ContextGaugeProps {
  pct: number
}

function ContextGauge({ pct }: ContextGaugeProps): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)))

  return (
    <>
      <span className="ctx-label">Ctx: {clamped}%</span>
      <div
        className="ctx-gauge"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Context usage"
      >
        <div className="ctx-gauge-fill" style={{ width: `${clamped}%` }} />
      </div>
    </>
  )
}

export default ContextGauge
