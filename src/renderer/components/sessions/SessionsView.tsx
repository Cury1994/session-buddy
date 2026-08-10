/**
 * M9 — Sessions 视图（DESIGN §4 / TASKS §10，替换 M7 占位）
 * M17.1 — Sessions 迭代 v2（基准原型 prototype-sessions-v2.html）：
 *   - 全局 AutoApproveBar 移除，自动审批下沉为每张卡片头部的 ⚡ 开关（SessionCard）
 *   - 「查看更多详情」下沉二级页：selectedSessionId 非空时以 SessionDetailPage
 *     替换整个列表（卡片/orphan/ApprovalHistory），SegmentedControl 在 App.tsx 常驻
 *
 * 组装（列表态）：
 *   - 每个 session 一张 SessionCard（命中 pending 审批时卡片内含红边 ApprovalBlock）
 *   - orphan 审批卡：未匹配到任何当前 session 的审批（如 curl 用 session="test"、
 *     或对应 session 已结束）独立成卡，确保审批永不丢失（scanner 按 name/sessionId
 *     匹配，test 不命中任何真实项目名，故必须由本视图兜底渲染）
 *   - 底部 ApprovalHistory（默认折叠）
 *   - EmptyState：无活跃 session 且无待审批时友好提示
 */

import { useMemo, useState } from 'react'

import {
  approvalForSession,
  useSessionsData
} from '../../hooks/useSessionsData'
import type { ApprovalViewItem } from '../../hooks/useSessionsData'
import ApprovalBlock from './ApprovalBlock'
import ApprovalHistory from './ApprovalHistory'
import SessionCard from './SessionCard'
import SessionDetailPage from './SessionDetailPage'

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

function SessionsView(): React.JSX.Element {
  const { sessions, approvals, loading, error } = useSessionsData()

  // M17.1 二级详情页导航：卡片「查看更多详情 ▸」→ 以 SessionDetailPage 替换列表
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  // orphan：未被任何 session 命中的审批
  const orphans = useMemo(() => {
    const matchedIds = new Set<string>()
    for (const s of sessions) {
      const a = approvalForSession(s, approvals)
      if (a !== undefined) matchedIds.add(a.data.id)
    }
    return approvals.filter((a) => !matchedIds.has(a.data.id))
  }, [sessions, approvals])

  // 详情态：整页替换（列表/orphan/ApprovalHistory 均不渲染；SegmentedControl 在 App.tsx 常驻）
  if (selectedSessionId !== null) {
    const selectedName = sessions.find((s) => s.sessionId === selectedSessionId)?.name ?? ''
    return (
      <SessionDetailPage
        sessionId={selectedSessionId}
        sessionName={selectedName}
        onBack={() => setSelectedSessionId(null)}
      />
    )
  }

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
          onOpenDetail={setSelectedSessionId}
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
