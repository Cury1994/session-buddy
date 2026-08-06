/**
 * M9 — 审批历史（DESIGN §4 / TASKS §10）
 *
 * 折叠/展开 toggle（默认折叠）。展开时调 getApprovalHistory()（history:get，最近 20 条）。
 * 每行：✓/✗ + 命令（截断，hover title 显示完整内容含工具）+ session + 相对时间。
 * 展开期间订阅 onApprovalResolved，新审批落库后（400ms 延时，让 POST /approve 唯一落库点
 * 提交）自动刷新，保证刚审批的记录即时可见。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { ApprovalRecord } from '../../../shared/types'

/** ApprovalRecord.timestamp 为本地 "YYYY-MM-DD HH:MM:SS"，解析为相对时间 */
function relativeTime(timestamp: string): string {
  const parsed = new Date(timestamp.replace(' ', 'T')).getTime()
  if (Number.isNaN(parsed)) return timestamp
  const diff = Math.max(0, Math.floor((Date.now() - parsed) / 1000))
  if (diff < 5) return '刚刚'
  if (diff < 60) return `${diff} 秒前`
  const min = Math.floor(diff / 60)
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  return `${Math.floor(hr / 24)} 天前`
}

function ApprovalHistory(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [records, setRecords] = useState<ApprovalRecord[]>([])
  const [loading, setLoading] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback((): void => {
    setLoading(true)
    window.electronAPI
      .getApprovalHistory()
      .then((rows) => setRecords(rows))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [])

  // 展开时拉取
  useEffect(() => {
    if (open) load()
  }, [open, load])

  // 展开期间：新审批解析后刷新（延时让 server 落库）
  useEffect(() => {
    if (!open) return
    const off = window.electronAPI.onApprovalResolved(() => {
      if (refreshTimer.current !== null) clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(load, 400)
    })
    return () => {
      off()
      if (refreshTimer.current !== null) clearTimeout(refreshTimer.current)
    }
  }, [open, load])

  return (
    <div className="card history-card">
      <button
        type="button"
        className="history-toggle electron-no-drag"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`chevron${open ? ' open' : ''}`} aria-hidden="true">
          ▸
        </span>
        Approval History
        {records.length > 0 && <span className="history-count">{records.length}</span>}
      </button>

      {open && (
        <div className="history-body">
          {loading ? (
            <p className="placeholder-text">加载中…</p>
          ) : records.length === 0 ? (
            <p className="placeholder-text">暂无审批记录</p>
          ) : (
            <ul className="history-list">
              {records.map((r) => (
                <li key={r.id} className="history-row">
                  <span
                    className={`history-mark ${r.allowed ? 'ok' : 'deny'}`}
                    aria-label={r.allowed ? 'approved' : 'rejected'}
                  >
                    {r.allowed ? '✓' : '✗'}
                  </span>
                  <span className="history-cmd" title={`[${r.tool}] ${r.command}`}>
                    {r.command}
                  </span>
                  <span className="history-session">{r.sessionName ?? '—'}</span>
                  <span className="history-time">{relativeTime(r.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default ApprovalHistory
