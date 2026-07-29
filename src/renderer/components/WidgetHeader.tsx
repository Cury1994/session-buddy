import TrafficLights from './TrafficLights'

/**
 * M7 — 顶部拖拽区（基准原型 .widget-header / DESIGN §4）
 *
 * 44px 高，整体 -webkit-app-region: drag（electron-drag-region），
 * 内部可点元素（红绿灯 / Pin）显式 no-drag。
 *   左：TrafficLights 红绿灯
 *   中：应用图标 + "Harness Monitor"（13px semibold，§2.3）
 *   右：PinIcon — 切换 alwaysOnTop（app:toggle-pin），激活态 accent-blue
 */

interface WidgetHeaderProps {
  pinned: boolean
  onPinChange: (pinned: boolean) => void
}

function WidgetHeader({ pinned, onPinChange }: WidgetHeaderProps): React.JSX.Element {
  const handlePinClick = (): void => {
    const next = !pinned
    onPinChange(next)
    void window.electronAPI.togglePin(next)
  }

  return (
    <header className="widget-header electron-drag-region">
      <TrafficLights />

      <div className="widget-title">
        {/* 应用图标（原型同款 terminal 字符图形） */}
        <svg width="14" height="14" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
        </svg>
        Harness Monitor
      </div>

      <button
        type="button"
        className={`pin-icon electron-no-drag${pinned ? ' active' : ''}`}
        title="Keep on top"
        onClick={handlePinClick}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16 11V5.5C16 4.67157 15.3284 4 14.5 4H9.5C8.67157 4 8 4.67157 8 5.5V11L6 14V16H11V21H13V16H18V14L16 11Z" />
        </svg>
      </button>
    </header>
  )
}

export default WidgetHeader
