/**
 * M9 — Sessions 视图数据 hook（DESIGN §4 / §5.3 / TASKS §10）
 *
 * 职责：
 *   1. 初始加载 sessions:get + 订阅 onSessionsUpdated（§7），维护 sessions 列表。
 *   2. 订阅 onApprovalPending / onApprovalResolved，维护审批视图项 approvals：
 *      - pending push 的运行时负载实为 PendingApproval（含 id/createdAt/timeoutSec，
 *        electron.d.ts 已注明类型按 §7 声明为 ApprovalPayload，此处按运行时形状取用）。
 *      - resolved push 不立即移除，而是将对应项标记为 fading 并保留 2s（FR-3.6 审批后
 *        2s 淡出），随后清除 —— 淡出生命周期集中在本 hook，视图侧只消费 fading 标记。
 *
 * 视图项（ApprovalViewItem）= PendingApproval + fading/allowed，供 SessionCard /
 * OrphanApprovalCard 渲染红边审批块。匹配到具体 session 的逻辑见 approvalForSession
 * （与 claude-sessions.ts scanner 的 `session === name || session === sessionId` 同语义）。
 */

import { useEffect, useState } from 'react'

import type { PendingApproval, SessionInfo } from '../../shared/types'

/** 审批视图项：队列项 + 淡出状态 */
export interface ApprovalViewItem {
  data: PendingApproval
  fading: boolean
  allowed?: boolean
}

interface SessionsData {
  sessions: SessionInfo[]
  approvals: ApprovalViewItem[]
  loading: boolean
  error: string | null
}

/** FR-3.6 审批块淡出保留时长（ms） */
const FADE_HOLD_MS = 2000

/**
 * 取某 session 对应的审批视图项（同 scanner 匹配语义：
 * approval.session 命中 session.name（项目名）或 session.sessionId）。
 * 未命中 → undefined（该审批可能属 orphan，由 SessionsView 单独渲染）。
 */
export function approvalForSession(
  session: SessionInfo,
  approvals: ApprovalViewItem[]
): ApprovalViewItem | undefined {
  return approvals.find(
    (a) =>
      a.data.session === session.name ||
      (session.sessionId !== '' && a.data.session === session.sessionId)
  )
}

export function useSessionsData(): SessionsData {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [approvals, setApprovals] = useState<ApprovalViewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    const timers = new Set<ReturnType<typeof setTimeout>>()

    // 初始加载（§7 getSessionsData）
    window.electronAPI
      .getSessionsData()
      .then((list) => {
        if (disposed) return
        setSessions(list)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (disposed) return
        setError(err instanceof Error ? err.message : '加载 Sessions 失败')
        setLoading(false)
      })

    // sessions push（services 每轮扫描，默认 3s）
    const offSessions = window.electronAPI.onSessionsUpdated((list) => {
      if (!disposed) setSessions(list)
    })

    // 新审批到达：运行时形状为 PendingApproval
    const offPending = window.electronAPI.onApprovalPending((payload) => {
      if (disposed) return
      const pending = payload as PendingApproval
      setApprovals((prev) => {
        if (prev.some((a) => a.data.id === pending.id)) return prev
        return [...prev, { data: pending, fading: false }]
      })
    })

    // 审批解析：标记 fading 保留 2s（FR-3.6），到时清除
    const offResolved = window.electronAPI.onApprovalResolved(({ id, allowed }) => {
      if (disposed) return
      setApprovals((prev) =>
        prev.map((a) => (a.data.id === id ? { ...a, fading: true, allowed } : a))
      )
      const timer = setTimeout(() => {
        timers.delete(timer)
        if (!disposed) setApprovals((prev) => prev.filter((a) => a.data.id !== id))
      }, FADE_HOLD_MS)
      timers.add(timer)
    })

    return () => {
      disposed = true
      timers.forEach((t) => clearTimeout(t))
      offSessions()
      offPending()
      offResolved()
    }
  }, [])

  return { sessions, approvals, loading, error }
}
