/**
 * M9 — Session 卡片（DESIGN §4 / 基准原型「Session Card」/ TASKS §10）
 *
 * 结构：
 *   Header：StatusDot + name(13px) … hover 浮层关闭终端按钮(F3) + [Terminal](FR-2.7)
 *   徽章行：provider 徽章（API 实际模型）+ tool 徽章（harness 身份，固定 Claude Code）
 *   Meta：Ctx: NN% + ContextGauge … Mem: NNM
 *   微文字：Uptime；cwd 单行截断（title 全路径 tooltip）
 *   条件渲染 ApprovalBlock（该 session 命中 pending 审批时，红边紧急卡片）
 *
 * 关闭终端（F3，取代旧 FR-2.8 直杀 claude 进程）：两步内联确认（首点 arm "Sure?"，
 * 再点执行 terminateSession(pid) → 主进程 SIGTERM tty 根 shell → 模拟器关闭该窗口/标签
 * → claude 随 pty hangup 退出）。hover 才显现，不占常驻版面。
 * 返回 false（后台会话无终端窗口等）→ 行内提示"无终端窗口"（与跳转失败提示共用机制）。
 */

import { useEffect, useRef, useState } from 'react'

import type { SessionInfo } from '../../../shared/types'
import type { ApprovalViewItem } from '../../hooks/useSessionsData'
import ApprovalBlock from './ApprovalBlock'
import ContextGauge from './ContextGauge'
import StatusDot from './StatusDot'

interface SessionCardProps {
  session: SessionInfo
  approval?: ApprovalViewItem
}

/** 跳转终端失败提示的驻留时长（ms） */
const JUMP_HINT_MS = 2500

/** uptimeSec → "12m" / "1h 05m" */
function formatUptime(sec: number): string {
  const total = Math.max(0, Math.floor(sec))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

function SessionCard({ session, approval }: SessionCardProps): React.JSX.Element {
  const [confirmTerm, setConfirmTerm] = useState(false)
  const [jumpHint, setJumpHint] = useState<string | null>(null)
  const jumpTimerRef = useRef<number | null>(null)
  const hasApproval = approval !== undefined

  // 卸载时清理跳转提示定时器
  useEffect(
    () => () => {
      if (jumpTimerRef.current !== null) window.clearTimeout(jumpTimerRef.current)
    },
    []
  )

  const jump = (): void => {
    // #5：传 session.pid 供主进程优先聚焦会话所在终端窗口（X11）；
    // Wayland / 聚焦失败由主进程自动降级 spawn 开新窗口（cwd 落真实项目路径）
    void window.electronAPI.jumpToTerminal(session.cwd, session.pid).then((ok) => {
      // FR-2.7：链中全失败（无可用终端）→ 一次性行内提示，不再静默（P1-1 整改）
      if (ok) return
      showHint('无可用终端')
    })
  }

  /** 一次性行内提示（2.5s 淡出；跳转失败与关闭终端失败共用，重复触发刷新计时） */
  const showHint = (msg: string): void => {
    setJumpHint(msg)
    if (jumpTimerRef.current !== null) window.clearTimeout(jumpTimerRef.current)
    jumpTimerRef.current = window.setTimeout(() => setJumpHint(null), JUMP_HINT_MS)
  }

  const terminate = (): void => {
    if (!confirmTerm) {
      setConfirmTerm(true)
      return
    }
    setConfirmTerm(false)
    void window.electronAPI.terminateSession(session.pid).then((ok) => {
      // F3：false ＝ 无控制终端（后台会话）等失败路径 → 一次性行内提示
      if (ok) return
      showHint('无终端窗口')
    })
  }

  return (
    <div className={`card session-card${hasApproval ? ' has-approval' : ''}`}>
      <div className="session-card-body">
        <div className="session-header">
          <div className="session-idline">
            <StatusDot
              status={session.status}
              memoryMB={session.memoryMB}
              hasPendingApproval={session.hasPendingApproval}
              recentlyActive={session.recentlyActive}
            />
            <span className="session-name" title={session.name}>
              {session.name}
            </span>
          </div>
          <div className="header-actions">
            {session.pid > 0 && (
              <button
                type="button"
                className={`mini-icon-btn danger electron-no-drag${confirmTerm ? ' confirm' : ''}`}
                title={confirmTerm ? 'Click again to close terminal' : 'Close terminal'}
                onClick={terminate}
              >
                {confirmTerm ? (
                  'Sure?'
                ) : (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                )}
              </button>
            )}
            <button
              type="button"
              className="mini-icon-btn electron-no-drag"
              title="Open Terminal"
              onClick={jump}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
            </button>
          </div>
        </div>

        <div className="badge-row">
          <span className="mini-badge provider-badge">{session.apiProvider}</span>
          <span className="mini-badge model-badge">Tool: {session.tool}</span>
        </div>

        {session.lastActivity !== '' && (
          <div className="session-activity" title={session.lastActivity}>
            {session.lastActivity}
          </div>
        )}

        <div className="meta-row">
          <ContextGauge pct={session.ctxPct} />
          <span className="mem-label">Mem: {Math.round(session.memoryMB)}M</span>
        </div>

        <div className="micro-row">
          <span className="micro-text">Up {formatUptime(session.uptimeSec)}</span>
          {jumpHint !== null && <span className="jump-hint">{jumpHint}</span>}
        </div>

        <div className="session-cwd" title={session.cwd}>
          {session.cwd}
        </div>
      </div>

      {approval && <ApprovalBlock item={approval} />}
    </div>
  )
}

export default SessionCard
