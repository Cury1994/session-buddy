/**
 * M9 — Session 卡片（DESIGN §4 / 基准原型「Session Card」/ TASKS §10）
 * M16 — F1 状态行（currentAction tool/waiting）+ F5 上下文告警块（ctxPct ≥ 80）。
 * M17.1 — Sessions 迭代 v2（基准原型 prototype-sessions-v2.html）：
 *   ① 详情下沉二级页：内联展开机制（DetailState/loadDetail/toggleExpand/renderDetail/
 *      MessageTail）整体移除，「查看更多详情 ▸」改为调 onOpenDetail(sessionId)，
 *      由 SessionsView 切换到 SessionDetailPage。
 *   ② 单卡 ⚡ 自动审批开关（取代 SessionsView 顶部全局 AutoApproveBar）：header-actions
 *      内 pill 按钮（⚡ + "自动"，ON=绿），前端 state 持有，挂载时经
 *      getAutoApprove(sessionId) 播种主进程真源；OFF→ON 两步确认（首点 arm
 *      显示 "Sure?"，点别处 disarm），ON→OFF 直接关闭。样式走内联 style，不新增
 *      globals.css 类（globals.css 由 B2 Settings 并行 agent 持有，避开文件域冲突）。
 *
 * 结构：
 *   Header：StatusDot + name(13px) … [⚡ 自动 pill]
 *   徽章行：provider 徽章（API 实际模型）+ tool 徽章（harness 身份，固定 Claude Code）
 *   F1 状态行（currentAction 非 null 时）+ F5 告警块（ctxPct ≥ 80 时）
 *   Meta：Ctx: NN% + ContextGauge … Mem: NNM
 *   微文字：Uptime；cwd 单行截断（title 全路径 tooltip）
 *   「查看更多详情 ▸」→ onOpenDetail（二级详情页）
 *   条件渲染 ApprovalBlock（该 session 命中 pending 审批时，红边紧急卡片）
 */

import { useEffect, useState } from 'react'

import type { SessionInfo } from '../../../shared/types'
import type { ApprovalViewItem } from '../../hooks/useSessionsData'
import ApprovalBlock from './ApprovalBlock'
import ContextGauge from './ContextGauge'
import StatusDot from './StatusDot'

interface SessionCardProps {
  session: SessionInfo
  approval?: ApprovalViewItem
  /** M17.1：点击「查看更多详情 ▸」→ 父级切换到二级详情页（SessionsView 持有 selectedSessionId） */
  onOpenDetail?: (sessionId: string) => void
}

/** F5 上下文告警阈值（%）：ctxPct ≥ 80 渲染红色警示块（原型基准，无按钮） */
const CTX_WARN_PCT = 80

/** uptimeSec → "12m" / "1h 05m" */
function formatUptime(sec: number): string {
  const total = Math.max(0, Math.floor(sec))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

/**
 * M17.1 单卡 ⚡ 自动审批 pill 内联样式（原型 .aa-card 对齐）。
 * 不新增 globals.css 类 —— globals.css 由并行 agent 持有（文件域划分）。
 */
const AA_PILL_BASE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid rgba(0, 0, 0, 0.15)',
  backgroundColor: 'rgba(0, 0, 0, 0.04)',
  color: 'var(--text-muted)',
  fontFamily: 'inherit',
  fontSize: '10.5px',
  fontWeight: 600,
  lineHeight: 1.4,
  cursor: 'default',
  flexShrink: 0,
  transition: 'background 0.15s, color 0.15s'
}
/** ON=绿（原型 .aa-card.on 配色） */
const AA_PILL_ON: React.CSSProperties = {
  backgroundColor: '#eefaf0',
  borderColor: '#b7e6c0',
  color: '#2e7d32'
}
/** armed=黄底待二次确认（对齐旧 AutoApproveBar .armed 语义） */
const AA_PILL_ARMED: React.CSSProperties = {
  backgroundColor: 'var(--warning-yellow)',
  borderColor: 'var(--warning-yellow)',
  color: 'rgba(0, 0, 0, 0.85)'
}

function SessionCard({ session, approval, onOpenDetail }: SessionCardProps): React.JSX.Element {
  const hasApproval = approval !== undefined

  // M17.1 单卡 ⚡ 自动审批：前端 state 持有 + 挂载播种主进程真源（按会话键）
  const [autoApprove, setAutoApproveState] = useState(false)
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    let disposed = false
    void window.electronAPI
      .getAutoApprove(session.sessionId)
      .then((v) => {
        if (!disposed) setAutoApproveState(v)
      })
      .catch(() => {
        // 播种失败不阻塞 UI，保持默认 false
      })
    return () => {
      disposed = true
    }
  }, [session.sessionId, session.name])

  // armed 态下点击别处 → disarm。延迟一帧挂载监听，避免触发本次 arm 的那次 click 冒泡立即 disarm
  useEffect(() => {
    if (!armed) return
    const onDocClick = (): void => setArmed(false)
    const timer = window.setTimeout(() => document.addEventListener('click', onDocClick), 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('click', onDocClick)
    }
  }, [armed])

  const toggleAutoApprove = (): void => {
    if (autoApprove) {
      // ON → OFF：无需确认，直接关闭
      setArmed(false)
      setAutoApproveState(false)
      void window.electronAPI.setAutoApprove(session.sessionId, false)
      return
    }
    // OFF → ON：两步确认
    if (!armed) {
      setArmed(true)
      return
    }
    // 二次点击：真正启用
    setArmed(false)
    setAutoApproveState(true)
    void window.electronAPI.setAutoApprove(session.sessionId, true)
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
            {/* M17.1 单卡 ⚡ 自动审批 pill（ON=绿；OFF→ON 两步确认 "Sure?"） */}
            <button
              type="button"
              className="electron-no-drag"
              style={{ ...AA_PILL_BASE, ...(armed ? AA_PILL_ARMED : autoApprove ? AA_PILL_ON : {}) }}
              title={
                armed
                  ? '再次点击启用本会话自动审批'
                  : autoApprove
                    ? '本会话自动审批：开（点击关闭）'
                    : '本会话自动审批：关（点击开启，需二次确认）'
              }
              onClick={toggleAutoApprove}
            >
              <span aria-hidden="true">⚡</span>
              {armed ? 'Sure?' : '自动'}
            </button>
          </div>
        </div>

        <div className="badge-row">
          <span className="mini-badge provider-badge">{session.apiProvider}</span>
          <span className="mini-badge model-badge">Tool: {session.tool}</span>
        </div>

        {/* M16 F1 当前动作行：tool=蓝 spinner 加载态 / agent=紫 spinner（M19）/ waiting=黄暂停态 / null 不渲染 */}
        {session.currentAction !== null && session.currentAction.kind === 'tool' && (
          <div className="action-row">
            <span className="action-spinner" aria-hidden="true" />
            <span className="action-label">正在运行</span>
            <span className="action-cmd" title={session.currentAction.label}>
              {session.currentAction.label}
            </span>
          </div>
        )}
        {session.currentAction !== null && session.currentAction.kind === 'agent' && (
          <div className="action-row agent">
            <span className="action-spinner" aria-hidden="true" />
            <span className="action-agent-badge">Agent</span>
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
        </div>

        <div className="session-cwd" title={session.cwd}>
          {session.cwd}
        </div>

        {/* M17.1 详情下沉：不再内联展开，点击通知父级切换二级详情页；空 sessionId 无详情入口 */}
        {session.sessionId !== '' && (
          <div className="expand-row">
            <button
              type="button"
              className="expand-btn electron-no-drag"
              onClick={() => onOpenDetail?.(session.sessionId)}
            >
              查看更多详情 ▸
            </button>
          </div>
        )}
      </div>

      {approval && <ApprovalBlock item={approval} />}
    </div>
  )
}

export default SessionCard
