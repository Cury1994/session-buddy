/**
 * M9 — Session 卡片（DESIGN §4 / 基准原型「Session Card」/ TASKS §10）
 * M16 — 会话迭代 B2（基准原型 prototype-sessions-v1.html，窗口 420px）：
 *   F1 状态行：currentAction tool → 蓝色 spinner "正在运行 <label>"（monospace 截断）；
 *     waiting → 黄色 "⏸ 等待用户输入"；null 不渲染。位于徽章行下、lastActivity 上方。
 *   F5 上下文告警块：ctxPct ≥ 80 → 红色警示块（标题 + 建议文案，无按钮）。
 *   展开详情区："查看更多详情 ▾ / 收起详情 ▴"；展开时经 sessions:detail IPC 拉
 *     SessionDetail（loading/失败/空 sessionId 空态），TaskList(F2) / AgentPanel(F3) /
 *     MessageTail(F4) 三子组件渲染；结果驻留 state，收起再展开不重复请求。
 *
 * 结构：
 *   Header：StatusDot + name(13px) … hover 浮层关闭终端按钮(F3) + [Terminal](FR-2.7)
 *   徽章行：provider 徽章（API 实际模型）+ tool 徽章（harness 身份，固定 Claude Code）
 *   F1 状态行（currentAction 非 null 时）+ F5 告警块（ctxPct ≥ 80 时）
 *   Meta：Ctx: NN% + ContextGauge … Mem: NNM
 *   微文字：Uptime；cwd 单行截断（title 全路径 tooltip）
 *   展开开关 + 详情区（默认收起）
 *   条件渲染 ApprovalBlock（该 session 命中 pending 审批时，红边紧急卡片）
 *
 * 关闭终端（F3，取代旧 FR-2.8 直杀 claude 进程）：两步内联确认（首点 arm "Sure?"，
 * 再点执行 terminateSession(pid) → 主进程 SIGTERM tty 根 shell → 模拟器关闭该窗口/标签
 * → claude 随 pty hangup 退出）。hover 才显现，不占常驻版面。
 * 返回 false（后台会话无终端窗口等）→ 行内提示"无终端窗口"（与跳转失败提示共用机制）。
 */

import { useEffect, useRef, useState } from 'react'

import type { SessionDetail, SessionInfo } from '../../../shared/types'
import type { ApprovalViewItem } from '../../hooks/useSessionsData'
import AgentPanel from './AgentPanel'
import ApprovalBlock from './ApprovalBlock'
import ContextGauge from './ContextGauge'
import MessageTail from './MessageTail'
import StatusDot from './StatusDot'
import TaskList from './TaskList'

interface SessionCardProps {
  session: SessionInfo
  approval?: ApprovalViewItem
}

/** 跳转终端失败提示的驻留时长（ms） */
const JUMP_HINT_MS = 2500

/** F5 上下文告警阈值（%）：ctxPct ≥ 80 渲染红色警示块（原型基准，无按钮） */
const CTX_WARN_PCT = 80

/** uptimeSec → "12m" / "1h 05m" */
function formatUptime(sec: number): string {
  const total = Math.max(0, Math.floor(sec))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

/** 展开详情区加载状态机：idle（未发起）→ loading → ok/error */
type DetailState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ok'; detail: SessionDetail }

function SessionCard({ session, approval }: SessionCardProps): React.JSX.Element {
  const [confirmTerm, setConfirmTerm] = useState(false)
  const [jumpHint, setJumpHint] = useState<string | null>(null)
  const jumpTimerRef = useRef<number | null>(null)
  const hasApproval = approval !== undefined

  // M16 展开详情区：默认收起；详情拉取结果驻留 state（收起再展开不重复请求）
  const [expanded, setExpanded] = useState(false)
  const [detailState, setDetailState] = useState<DetailState>({ phase: 'idle' })
  const disposedRef = useRef(false)

  // 卸载时清理跳转提示定时器 + 标记 disposed（详情请求回调不再 setState）
  useEffect(
    () => () => {
      if (jumpTimerRef.current !== null) window.clearTimeout(jumpTimerRef.current)
      disposedRef.current = true
    },
    []
  )

  /** 展开时按需拉详情（仅 idle 发起一次；sessionId 为空不发请求，渲染层直接空态） */
  const loadDetail = (): void => {
    if (session.sessionId === '') return
    setDetailState({ phase: 'loading' })
    window.electronAPI
      .getSessionDetail(session.sessionId)
      .then((detail) => {
        if (disposedRef.current) return
        setDetailState({ phase: 'ok', detail })
      })
      .catch(() => {
        if (disposedRef.current) return
        setDetailState({ phase: 'error' })
      })
  }

  const toggleExpand = (): void => {
    const next = !expanded
    setExpanded(next)
    if (next && detailState.phase === 'idle') loadDetail()
  }

  /** 展开详情区内容（loading / 失败 / 空 sessionId 空态 / 三子组件） */
  const renderDetail = (): React.JSX.Element => {
    if (session.sessionId === '') {
      return <div className="detail-empty">无详情数据</div>
    }
    switch (detailState.phase) {
      case 'idle': // toggle 同批渲染尚未切 loading，按加载态展示
      case 'loading':
        return <div className="detail-empty">加载中…</div>
      case 'error':
        return <div className="detail-empty detail-error">加载失败</div>
      case 'ok':
        return (
          <>
            <TaskList tasks={detailState.detail.tasks} />
            <AgentPanel agents={detailState.detail.agents} />
            <MessageTail messages={detailState.detail.messages} />
          </>
        )
    }
  }

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

        {/* M16 F1 当前动作行：tool=蓝色 spinner 加载态 / waiting=黄色暂停态 / null 不渲染 */}
        {session.currentAction !== null && session.currentAction.kind === 'tool' && (
          <div className="action-row">
            <span className="action-spinner" aria-hidden="true" />
            <span className="action-label">正在运行</span>
            <span className="action-cmd" title={session.currentAction.label}>
              {session.currentAction.label}
            </span>
          </div>
        )}
        {session.currentAction !== null && session.currentAction.kind === 'waiting' && (
          <div className="action-row paused">
            <span className="action-pause-ico" aria-hidden="true">
              ⏸
            </span>
            <span className="action-label">{session.currentAction.label}</span>
          </div>
        )}

        {/* M16 F5 上下文告警块：ctxPct ≥ 80 红色警示（无按钮；未达阈值不渲染） */}
        {session.ctxPct >= CTX_WARN_PCT && (
          <div className="ctx-warn">
            <div className="ctx-warn-title">
              <span aria-hidden="true">⚠</span> 上下文即将耗尽 ({session.ctxPct}%)
            </div>
            <div className="ctx-warn-desc">
              当前会话历史过长，可能影响推理。建议 /compact 或开新会话。
            </div>
          </div>
        )}

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
          <span className="session-id" title={session.sessionId}>
            ID {session.sessionId}
          </span>
          {jumpHint !== null && <span className="jump-hint">{jumpHint}</span>}
        </div>

        <div className="session-cwd" title={session.cwd}>
          {session.cwd}
        </div>

        {/* M16 展开开关 + 详情区（F2/F3/F4，sessions:detail 按需拉取） */}
        <div className="expand-row">
          <button type="button" className="expand-btn electron-no-drag" onClick={toggleExpand}>
            {expanded ? '收起详情 ▴' : '查看更多详情 ▾'}
          </button>
        </div>

        {expanded && <div className="session-detail">{renderDetail()}</div>}
      </div>

      {approval && <ApprovalBlock item={approval} />}
    </div>
  )
}

export default SessionCard
