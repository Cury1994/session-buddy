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
 * pinned 是置顶态的**单一真源**（P3-1 整改）：挂载时经 window:get-always-on-top
 * 读窗口真实态播种，WidgetHeader 📌 与 SettingsView 复选框共享同一 state 并经
 * togglePin 驱动窗口 —— 两控件永不再失同步。
 * pendingCount 由 approval:pending / approval:resolved push 事件维护（§5.3）：
 *   pending +1、resolved -1（下限 0）。落库与托盘色由 server.ts 单落库点 +
 *   颜色优先级协议负责，此处只做 UI 计数收敛。M9 视图内部会经 sessions push
 *   的 hasPendingApproval 再做精确同步。
 * settingsFocus（M13.6）：用量视图槽位卡"配置此 API"跳转设置页的聚焦标记。
 * UsageView onOpenSettings(sourceId) → setActiveView('settings') + 暂存 focus；
 * SettingsView 挂载时消费（打开对应用量源编辑/新增表单）后经 onFocusHandled
 * 回写清除 —— 避免下次手动切到设置页时重复触发旧聚焦。
 */
function App(): React.JSX.Element {
  const [activeView, setActiveView] = useState<ViewId>('sessions')
  const [pinned, setPinned] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [settingsFocus, setSettingsFocus] = useState<string | null>(null)

  /** M13.6：UsageView 槽位卡"配置" → 切设置视图并聚焦该用量源 */
  const openSettingsWithFocus = (focus?: string): void => {
    setSettingsFocus(focus ?? null)
    setActiveView('settings')
  }

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

  // 置顶态播种（P3-1 整改）：窗口真实 alwaysOnTop 是唯一权威（window.ts isPinned），
  // 挂载时读一次，使 header 📌 与设置复选框从同一真源起步。
  useEffect(() => {
    let alive = true
    void window.electronAPI.getAlwaysOnTop().then((v) => {
      if (alive) setPinned(v)
    })
    return () => {
      alive = false
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
          {activeView === 'usage' && <UsageView onOpenSettings={openSettingsWithFocus} />}
          {activeView === 'settings' && (
            <SettingsView
              pinned={pinned}
              onPinChange={setPinned}
              focusUsageSource={settingsFocus}
              onFocusHandled={() => setSettingsFocus(null)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default App
