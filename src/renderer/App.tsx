/**
 * M1 — 最小根组件
 *
 * 仅渲染 "Hello harness-monitor" 验证 React + Tailwind + 毛玻璃背景链路。
 * 真正的挂件布局（WidgetHeader / SegmentedControl / 三视图）在 M10~M13 实现。
 */
function App(): React.JSX.Element {
  return (
    <div className="widget-shell flex h-screen w-full items-center justify-center p-4">
      <div className="rounded-card bg-card-bg border border-card-border px-6 py-8 text-center shadow-card">
        <h1 className="text-[13px] font-semibold text-text-main">
          Hello harness-monitor
        </h1>
        <p className="mt-2 text-xs text-text-muted">M1 项目骨骼 · 浅色毛玻璃主题</p>
      </div>
    </div>
  )
}

export default App
