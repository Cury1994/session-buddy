/**
 * M9 — 审批历史（DESIGN §4 / TASKS §10）
 *
 * 折叠/展开 toggle（默认折叠）。展开时调 getApprovalHistory()（history:get，返回全部审批）。
 * 每行两行：✓/✗ + 命令（截断，hover 浮层显示完整内容含工具）+ 关联 session + 具体时间戳。
 * 展开期间订阅 onApprovalResolved，新审批落库后（400ms 延时，让 POST /approve 唯一落库点
 * 提交）自动刷新，保证刚审批的记录即时可见。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

import type { ApprovalRecord } from '../../../shared/types'

function ApprovalHistory(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [records, setRecords] = useState<ApprovalRecord[]>([])
  const [loading, setLoading] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 自定义 hover tooltip：原生 title 在部分环境不可靠，改用 fixed 定位浮层，
  // 鼠标进入行时定位在行下方，展示完整内容（工具 + 命令），不随滚动被裁剪。
  const [tip, setTip] = useState<{ content: string; x: number; y: number } | null>(null)

  const showTip = (e: ReactMouseEvent<HTMLLIElement>, r: ApprovalRecord): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    setTip({ content: `${r.tool}\n${r.command}`, x: rect.left, y: rect.bottom + 6 })
  }

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
            <>
              <ul className="history-list">
                {records.map((r) => (
                  <li
                    key={r.id}
                    className="history-row"
                    onMouseEnter={(e) => showTip(e, r)}
                    onMouseLeave={() => setTip(null)}
                  >
                    <span className="history-main">
                      <span
                        className={`history-mark ${r.allowed ? 'ok' : 'deny'}`}
                        aria-label={r.allowed ? 'approved' : 'rejected'}
                      >
                        {r.allowed ? '✓' : '✗'}
                      </span>
                      <span className="history-cmd">{r.command}</span>
                    </span>
                    <span className="history-meta">
                      <span className="history-session" title={r.sessionName ?? ''}>
                        {r.sessionName ?? '—'}
                      </span>
                      <span className="history-time">{r.timestamp}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {tip !== null && (
                <div className="history-tooltip" style={{ left: tip.x, top: tip.y }}>
                  <pre>{tip.content}</pre>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default ApprovalHistory
