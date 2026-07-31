/**
 * M9 — 审批紧急块（DESIGN §5.3 / 基准原型「审批区块」/ TASKS §10）
 *
 * 红色警告头 "Wait Approval (NNs)"：NN 为剩余倒计时秒数。审批超时由 server 侧
 * auto-deny（config.notifications.approve_timeout_sec，默认 60）。PendingApproval
 * 带 createdAt/timeoutSec → 倒计时；缺省（异常）时回退显示「已等待时长」。
 *
 * 命令：等宽、黑底(#1e1e1e)白字(#e0e0e0)、横向滚动；危险关键字高亮 #ff6b6b。
 * [Reject] / [Approve] → respondApproval(id, allowed)。淡出（FR-3.6，2s）由
 * useSessionsData 的 fading 状态驱动：fading 时整块淡出并显示 ✓/✗ 结果标记。
 */

import { useEffect, useState } from 'react'

import type { ApprovalViewItem } from '../../hooks/useSessionsData'

/**
 * 危险关键字高亮（FR：sudo / rm / rm -rf / mkfs / dd / kill -9 / chmod 777 /
 * fork bomb `:(){` / 重定向到系统路径）。`rm -rf` 置于 `rm` 之前以优先匹配长短语。
 * 模块级 /g 正则，matchAll 内部独立推进 lastIndex，共享安全。
 */
const DANGER_REGEX =
  /(?:\brm\s+-rf\b|\bsudo\b|\brm\b|\bmkfs(?:\.\w+)?\b|\bdd\b|kill\s+-9\b|chmod\s+777\b|:\(\)\s*\{|>\s*\/(?:etc|usr|bin|sbin|boot|sys|proc)\b)/g

/** 将命令拆分为普通文本 + 危险关键字红 span 序列 */
function highlightDanger(command: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of command.matchAll(DANGER_REGEX)) {
    const text = m[0]
    if (text === undefined) continue
    const idx = m.index ?? 0
    if (idx > last) nodes.push(command.slice(last, idx))
    nodes.push(
      <span key={key} className="cmd-danger">
        {text}
      </span>
    )
    key += 1
    last = idx + text.length
  }
  if (last < command.length) nodes.push(command.slice(last))
  return nodes
}

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
        <div className={`approval-header ${allowed === true ? 'resolved-ok' : 'resolved-deny'}`}>
          <span className="approval-mark">{allowed === true ? '✓' : '✗'}</span>
          {allowed === true ? 'Approved' : 'Rejected'}
        </div>
      ) : (
        <div className="approval-header">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Wait Approval ({seconds}s)
        </div>
      )}

      <div className="approval-desc">
        {data.description !== ''
          ? data.description
          : `Claude Code 请求执行 ${data.tool} 命令`}
      </div>

      <div className="cmd-box">{highlightDanger(data.command)}</div>

      {!fading && (
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
      )}
    </div>
  )
}

export default ApprovalBlock
