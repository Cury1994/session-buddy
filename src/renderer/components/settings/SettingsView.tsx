/**
 * M7 — 设置视图占位
 * （M10 实现 General / Limits & Alerts / Quit，DESIGN §4 / TASKS §11）
 */
function SettingsView(): React.JSX.Element {
  return (
    <div className="card">
      <div className="card-title">Settings</div>
      <p className="placeholder-text">
        置顶 / 通知 / 告警阈值 / 查询间隔设置将在 M10 实现。
      </p>
    </div>
  )
}

export default SettingsView
