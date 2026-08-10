import TrafficLights from './TrafficLights'

/**
 * M7 — 顶部拖拽区（基准原型 .widget-header / DESIGN §4）
 *
 * 44px 高，整体 -webkit-app-region: drag（electron-drag-region），
 * 内部可点元素（红绿灯 / Pin）显式 no-drag。
 *   左：TrafficLights 红绿灯（macOS 用原生红绿灯，隐藏自绘）
 *   中：应用图标 + "SessionBuddy"（13px semibold，§2.3）
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
      {/* macOS：原生红绿灯由 titleBarStyle:hidden 提供，跳过自绘（避免双套窗口控件） */}
      {window.electronAPI.platform !== 'darwin' && <TrafficLights />}

      <div className="widget-title">
        {/* 应用名（无图标） */}
        SessionBuddy
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
