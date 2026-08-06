/**
 * M9 — 审批紧急块（紧凑标题行，DESIGN §5.3 / TASKS §10）
 *
 * 折叠为单行：工具徽章 + "Wait Approval (Ns)" 标题 + Reject/Approve 按钮同行。
 * 具体审批内容（描述 + 完整命令）不占版面，光标 hover 标题时经 title tooltip 完整展示。
 *
 * NN 为剩余倒计时秒数。审批超时由 server 侧 auto-deny
 * （config.notifications.approve_timeout_sec，默认 60）。PendingApproval 带
 * createdAt/timeoutSec → 倒计时；缺省（异常）时回退显示「已等待时长」。
 *
 * 淡出（FR-3.6，0.5s）由 useSessionsData 的 fading 状态驱动：fading 时整块淡出
 * 并显示 ✓/✗ 结果标记。
 */

import { useEffect, useState } from 'react'

import type { ApprovalViewItem } from '../../hooks/useSessionsData'

/** 每秒 tick 的当前时间（fading 时停表，避免无谓重渲染） */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

interface ApprovalBlockProps {
  item: ApprovalViewItem
}

function ApprovalBlock({ item }: ApprovalBlockProps): React.JSX.Element {
  const { data, fading, allowed } = item
  const now = useNow(!fading)
  const [responding, setResponding] = useState(false)

  // 倒计时：有 createdAt+timeoutSec → 剩余秒；否则回退「已等待时长」
  const elapsedSec =
    data.createdAt > 0 ? Math.max(0, Math.floor((now - data.createdAt) / 1000)) : 0
  const hasTimeout = data.createdAt > 0 && data.timeoutSec > 0
  const seconds = hasTimeout ? Math.max(0, data.timeoutSec - elapsedSec) : elapsedSec

  // hover 标题时展示的完整审批内容：描述 + 完整命令（title tooltip 支持 \n 换行）
  const description =
    data.description !== '' ? data.description : `Claude Code 请求执行 ${data.tool} 操作`
  const fullContent = `${description}\n\n${data.command}`

  const respond = (isAllowed: boolean): void => {
    if (responding || fading) return
    setResponding(true)
    window.electronAPI
      .respondApproval(data.id, isAllowed)
      .then((ok) => {
        // ok=false：审批已被他路解析（超时 / 其他端）；resolved push 会驱动淡出
        if (!ok && !fading) setResponding(false)
      })
      .catch(() => {
        if (!fading) setResponding(false)
      })
  }

  return (
    <div className={`approval-block${fading ? ' approval-fade' : ''}`}>
      {fading ? (
        <div className={`approval-resolved${allowed === true ? ' ok' : ''}`}>
          <span className="approval-mark">{allowed === true ? '✓' : '✗'}</span>
          {allowed === true ? 'Approved' : 'Rejected'}
        </div>
      ) : (
        <div className="approval-row">
          {/* hover 显示完整审批内容（title tooltip：描述 + 完整命令） */}
          <span className="approval-title" title={fullContent}>
            <span
              className={`approval-tool-badge${data.tool === 'Bash' ? '' : ' tool-prominent'}`}
            >
              {data.tool}
            </span>
            Wait Approval ({seconds}s)
          </span>
          <div className="approval-actions">
            <button
              type="button"
              className="btn btn-flex electron-no-drag"
              disabled={responding}
              onClick={() => respond(false)}
            >
              Reject
            </button>
            <button
              type="button"
              className="btn btn-primary btn-flex electron-no-drag"
              disabled={responding}
              onClick={() => respond(true)}
            >
              Approve
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ApprovalBlock