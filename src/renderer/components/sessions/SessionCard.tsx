/**
 * M9 — Session 卡片（DESIGN §4 / 基准原型「Session Card」/ TASKS §10）
 *
 * 结构：
 *   Header：StatusDot + name(13px) … hover 浮层终止按钮(FR-2.8) + [Terminal](FR-2.7)
 *   徽章行：provider 徽章 + tool 徽章（§6.8 SessionInfo 无 model 字段，见完成报告偏差说明）
 *   Meta：Ctx: NN% + ContextGauge … Mem: NNM
 *   微文字：Uptime；cwd 单行截断（title 全路径 tooltip）
 *   条件渲染 ApprovalBlock（该 session 命中 pending 审批时，红边紧急卡片）
 *
 * 终止会话（FR-2.8）：两步内联确认（首点 arm "Sure?"，再点执行 terminateSession(pid)），
 * hover 才显现，不占常驻版面。
 */

import { useState } from 'react'

import type { SessionInfo } from '../../../shared/types'
import type { ApprovalViewItem } from '../../hooks/useSessionsData'
import ApprovalBlock from './ApprovalBlock'
import ContextGauge from './ContextGauge'
import StatusDot from './StatusDot'

interface SessionCardProps {
  session: SessionInfo
  approval?: ApprovalViewItem
}

/** uptimeSec → "12m" / "1h 05m" */
function formatUptime(sec: number): string {
  const total = Math.max(0, Math.floor(sec))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

function SessionCard({ session, approval }: SessionCardProps): React.JSX.Element {
  const [confirmTerm, setConfirmTerm] = useState(false)
  const hasApproval = approval !== undefined

  const jump = (): void => {
    void window.electronAPI.jumpToTerminal(session.cwd)
  }

  const terminate = (): void => {
    if (!confirmTerm) {
      setConfirmTerm(true)
      return
    }
    setConfirmTerm(false)
    void window.electronAPI.terminateSession(session.pid)
  }

  return (
    <div className={`card session-card${hasApproval ? ' has-approval' : ''}`}>
      <div className="session-card-body">
        <div className="session-header">
          <div className="session-idline">
            <StatusDot status={session.status} memoryMB={session.memoryMB} />
            <span className="session-name" title={session.name}>
              {session.name}
            </span>
          </div>
          <div className="header-actions">
            {session.pid > 0 && (
              <button
                type="button"
                className={`mini-icon-btn danger electron-no-drag${confirmTerm ? ' confirm' : ''}`}
                title={confirmTerm ? 'Click again to terminate' : 'Terminate session'}
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

        <div className="meta-row">
          <ContextGauge pct={session.ctxPct} />
          <span className="mem-label">Mem: {Math.round(session.memoryMB)}M</span>
        </div>

        <div className="micro-row">
          <span className="micro-text">Up {formatUptime(session.uptimeSec)}</span>
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
