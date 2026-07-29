/**
 * M7 — 分段导航（基准原型 .segmented-control / DESIGN §4）
 *
 * 替代侧边栏的三段切换：
 *   Sessions（label + pending badge：红色 9px 胶囊，0 时隐藏，§2.3）
 *   API Usage（label）
 *   Settings（齿轮 SVG，原型同款）
 * 激活段白底 + 0 1px 3px rgba(0,0,0,0.1) 阴影（§2.5）。
 */

export type ViewId = 'sessions' | 'usage' | 'settings'

interface SegmentedControlProps {
  active: ViewId
  pendingCount: number
  onChange: (view: ViewId) => void
}

/** 齿轮图标（原型 Settings 段，stroke 风格） */
function GearIcon(): React.JSX.Element {
  return (
    <svg
      style={{ verticalAlign: '-2px' }}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function SegmentedControl({
  active,
  pendingCount,
  onChange
}: SegmentedControlProps): React.JSX.Element {
  return (
    <nav className="segmented-control electron-no-drag">
      <button
        type="button"
        className={`segment${active === 'sessions' ? ' active' : ''}`}
        onClick={() => onChange('sessions')}
      >
        Sessions
        {pendingCount > 0 && (
          <span className="segment-badge">{pendingCount > 99 ? '99+' : pendingCount}</span>
        )}
      </button>
      <button
        type="button"
        className={`segment${active === 'usage' ? ' active' : ''}`}
        onClick={() => onChange('usage')}
      >
        API Usage
      </button>
      <button
        type="button"
        className={`segment${active === 'settings' ? ' active' : ''}`}
        title="Settings"
        onClick={() => onChange('settings')}
      >
        <GearIcon />
      </button>
    </nav>
  )
}

export default SegmentedControl
