import { useEffect, useState } from 'react'

import SegmentedControl from './components/SegmentedControl'
import WidgetHeader from './components/WidgetHeader'
import SessionsView from './components/sessions/SessionsView'
import SettingsView from './components/settings/SettingsView'
import UsageView from './components/usage/UsageView'

import type { ViewId } from './components/SegmentedControl'

/**
 * M7 — 挂件根组件（DESIGN §4 / 基准原型 harness_monitor.html）
 *
 * 结构：.widget-window（340px 毛玻璃挂件，尺寸由 config.window 承载，§2.9）
 *   ├── WidgetHeader   44px 拖拽区（红绿灯 + 标题 + Pin）
 *   ├── SegmentedControl  分段导航（Sessions badge / API Usage / Settings）
 *   └── .content-area  可滚动内容区（4px 隐藏滚动条，§2.8）
 *
 * 状态：activeView（三视图切换）/ pinned（置顶）/ pendingCount（Sessions badge）。
 * pendingCount 由 approval:pending / approval:resolved push 事件维护（§5.3）：
 *   pending +1、resolved -1（下限 0）。落库与托盘色由 server.ts 单落库点 +
 *   颜色优先级协议负责，此处只做 UI 计数收敛。M9 视图内部会经 sessions push
 *   的 hasPendingApproval 再做精确同步。
 */
function App(): React.JSX.Element {
  const [activeView, setActiveView] = useState<ViewId>('sessions')
  const [pinned, setPinned] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  // 审批 badge 联动：订阅两条 push，卸载时经 unsubscribe 清理（§7 on* 约定）
  useEffect(() => {
    const offPending = window.electronAPI.onApprovalPending(() => {
      setPendingCount((c) => c + 1)
    })
    const offResolved = window.electronAPI.onApprovalResolved(() => {
      setPendingCount((c) => Math.max(0, c - 1))
    })
    return () => {
      offPending()
      offResolved()
    }
  }, [])

  return (
    <div className="widget-window electron-no-select">
      <WidgetHeader pinned={pinned} onPinChange={setPinned} />
      <SegmentedControl
        active={activeView}
        pendingCount={pendingCount}
        onChange={setActiveView}
      />
      <div className="content-area">
        {/* key 随视图变化强制重挂载，重放 fadeIn 动画（§2.7 视图切换 0.2s ease-in-out） */}
        <div key={activeView} className="view-fade">
          {activeView === 'sessions' && <SessionsView />}
          {activeView === 'usage' && <UsageView />}
          {activeView === 'settings' && <SettingsView />}
        </div>
      </div>
    </div>
  )
}

export default App
