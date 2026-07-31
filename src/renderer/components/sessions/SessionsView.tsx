/**
 * M9 — Sessions 视图（DESIGN §4 / TASKS §10，替换 M7 占位）
 *
 * 组装：
 *   - 每个 session 一张 SessionCard（命中 pending 审批时卡片内含红边 ApprovalBlock）
 *   - orphan 审批卡：未匹配到任何当前 session 的审批（如 curl 用 session="test"、
 *     或对应 session 已结束）独立成卡，确保审批永不丢失（scanner 按 name/sessionId
 *     匹配，test 不命中任何真实项目名，故必须由本视图兜底渲染）
 *   - 底部 ApprovalHistory（默认折叠）
 *   - EmptyState：无活跃 session 且无待审批时友好提示
 *
 * App.tsx 已 import 本占位组件，仅替换文件内容、不改 App.tsx。
 */

import { useEffect, useMemo, useState } from 'react'

import {
  approvalForSession,
  useSessionsData
} from '../../hooks/useSessionsData'
import type { ApprovalViewItem } from '../../hooks/useSessionsData'
import ApprovalBlock from './ApprovalBlock'
import ApprovalHistory from './ApprovalHistory'
import SessionCard from './SessionCard'

/** 未匹配到 session 的审批：红边紧急卡（header 显示 session/harness/cwd） */
function OrphanApprovalCard({ item }: { item: ApprovalViewItem }): React.JSX.Element {
  const { data } = item
  return (
    <div className="card session-card has-approval">
      <div className="session-card-body">
        <div className="session-header">
          <div className="session-idline">
            <span className="status-dot idle" aria-hidden="true" />
            <span className="session-name" title={data.session}>
              {data.session}
            </span>
          </div>
          <span className="mini-badge provider-badge">{data.harness}</span>
        </div>
        {data.cwd !== '' && (
          <div className="session-cwd" title={data.cwd}>
            {data.cwd}
          </div>
        )}
      </div>
      <ApprovalBlock item={item} />
    </div>
  )
}

/**
 * 自动审批开关区（F3，会话级 / 重启复位 / 两步确认）。
 *
 * 状态纯前端持有（useState），不持久化 —— 主进程模块级 flag 与前端 state 重启后各自复位，
 * 是用户选定的安全默认。挂载时经 getAutoApprove() 播种真源：App.tsx key={activeView}
 * 切走重挂载会复位前端 state，但主进程 flag 不随之复位，播种避免"开关显示 OFF 但主进程
 * 仍 auto"的失配。
 *
 * 两步确认启用（复用 SessionCard 关闭终端 confirmTerm 模式，并额外支持点别处 disarm）：
 *   OFF→ON 首次点击进入 armed 态显示 "Sure?"，再次点击才 setAutoApprove(true)；
 *   armed 态点击别处（document click）→ disarm。ON→OFF 无需确认，直接 setAutoApprove(false)。
 */
function AutoApproveBar(): React.JSX.Element {
  const [autoApprove, setAutoApproveState] = useState(false)
  const [armed, setArmed] = useState(false)

  // 挂载播种：拉取主进程真源对齐（见组件头注）
  useEffect(() => {
    let disposed = false
    void window.electronAPI
      .getAutoApprove()
      .then((v) => {
        if (!disposed) setAutoApproveState(v)
      })
      .catch(() => {
        // 播种失败不阻塞 UI，保持默认 false
      })
    return () => {
      disposed = true
    }
  }, [])

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

  const toggle = (): void => {
    if (autoApprove) {
      // ON → OFF：无需确认，直接关闭
      setArmed(false)
      setAutoApproveState(false)
      void window.electronAPI.setAutoApprove(false)
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
    void window.electronAPI.setAutoApprove(true)
  }

  return (
    <div className="auto-approve-bar">
      <div className="auto-approve-row">
        <span className="auto-approve-label">⚡ 自动审批</span>
        <button
          type="button"
          className={`auto-approve-toggle electron-no-drag${autoApprove ? ' on' : ''}${
            armed ? ' armed' : ''
          }`}
          title={autoApprove ? '点击关闭自动审批' : '点击开启（需二次确认）'}
          onClick={toggle}
        >
          {armed ? 'Sure?' : autoApprove ? 'ON' : 'OFF'}
        </button>
        <span className="auto-approve-hint">打开后所有审批立即放行</span>
      </div>
      {autoApprove && (
        <div className="auto-approve-banner">⚠ 自动审批中：所有命令将不经询问直接放行</div>
      )}
    </div>
  )
}

function SessionsView(): React.JSX.Element {
  const { sessions, approvals, loading, error } = useSessionsData()

  // orphan：未被任何 session 命中的审批
  const orphans = useMemo(() => {
    const matchedIds = new Set<string>()
    for (const s of sessions) {
      const a = approvalForSession(s, approvals)
      if (a !== undefined) matchedIds.add(a.data.id)
    }
    return approvals.filter((a) => !matchedIds.has(a.data.id))
  }, [sessions, approvals])

  if (loading) {
    return (
      <div className="card">
        <p className="placeholder-text">正在加载 Sessions…</p>
      </div>
    )
  }

  const hasContent = sessions.length > 0 || approvals.length > 0

  return (
    <>
      <AutoApproveBar />

      {error !== null && (
        <div className="card">
          <p className="placeholder-text">加载失败：{error}</p>
        </div>
      )}

      {!hasContent && (
        <div className="card sessions-empty">
          <div className="sessions-empty-icon" aria-hidden="true">
            💤
          </div>
          <div className="sessions-empty-title">暂无活跃 Session</div>
          <div className="sessions-empty-desc">启动 Claude Code 后，活跃会话会出现在这里。</div>
        </div>
      )}

      {sessions.map((s) => (
        <SessionCard
          key={s.pid > 0 ? `pid-${s.pid}` : `sid-${s.sessionId}`}
          session={s}
          approval={approvalForSession(s, approvals)}
        />
      ))}

      {orphans.map((a) => (
        <OrphanApprovalCard key={`orphan-${a.data.id}`} item={a} />
      ))}

      <ApprovalHistory />
    </>
  )
}

export default SessionsView
