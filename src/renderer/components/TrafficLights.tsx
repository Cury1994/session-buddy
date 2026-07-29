/**
 * M7 — 红绿灯窗口控制（基准原型 .window-controls / DESIGN §2.10）
 *
 * 红/黄/绿 10px 圆点（配色取 §2.2 语义色变量，与原型一致）。
 * Linux 无原生红绿灯语义（§2.10），完全自绘：
 *   Close(red)    → windowHide()（hide 不 quit，§6.4）
 *   Minimize(yellow) → windowMinimize()
 *   Maximize(green)  → windowToggleMaximize()
 * 容器带 electron-no-drag：父级是拖拽区，按钮必须显式退出拖拽。
 */
function TrafficLights(): React.JSX.Element {
  return (
    <div className="window-controls electron-no-drag">
      <button
        type="button"
        className="light"
        style={{ backgroundColor: 'var(--danger-red)' }}
        title="Close"
        onClick={() => void window.electronAPI.windowHide()}
      />
      <button
        type="button"
        className="light"
        style={{ backgroundColor: 'var(--warning-yellow)' }}
        title="Minimize"
        onClick={() => void window.electronAPI.windowMinimize()}
      />
      <button
        type="button"
        className="light"
        style={{ backgroundColor: 'var(--success-green)' }}
        title="Maximize"
        onClick={() => void window.electronAPI.windowToggleMaximize()}
      />
    </div>
  )
}

export default TrafficLights
