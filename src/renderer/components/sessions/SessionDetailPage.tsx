/**
 * M17.1 — Session 二级详情页（基准原型 prototype-sessions-v2.html detailView 段）
 *
 * 由 SessionsView 在 selectedSessionId 非空时替换列表渲染（SegmentedControl 在
 * App.tsx，保持常驻）。结构：
 *   返回条：← 返回按钮 + 会话名 + "● 实时"标记（原型 .subbar）
 *   内容：TaskList(F2) + AgentPanel(F3) —— M17.1 契约无 messages，MessageTail 已删除
 *
 * 数据加载 + 实时同步：
 *   - 挂载即经 sessions:detail IPC 拉一次（loading / 失败空态）
 *   - 订阅 onSessionsUpdated（services 每轮扫描 push，默认 3s）：
 *       sessionId 仍在推送列表 → 重拉 getSessionDetail（覆盖新任务/子 Agent 与
 *         /clear 后主进程缓存重置为空 —— 即"清空回空态 + 实时同步"）
 *       sessionId 不在列表 → 会话已结束态（返回按钮可回列表）
 *   - 卸载退订（同 useSessionsData 的 disposed + off() 模式）
 *
 * 样式：返回条为 v2 新增结构，globals.css 由 B2 Settings 并行 agent 持有，
 * 本文件走内联 style（复用 .card / .detail-empty 等既有字面量类）。
 */

import { useEffect, useState } from 'react'

import type { SessionDetail } from '../../../shared/types'
import ActivityFeed from './ActivityFeed'
import AgentPanel from './AgentPanel'
import TaskList from './TaskList'

interface SessionDetailPageProps {
  sessionId: string
  /** 显示名（父级自 sessions 列表查得传入；会话结束查无时降级空串，本页自行兜底） */
  sessionName: string
  onBack: () => void
}

/** 详情页状态机：loading → ok / error；push 发现会话消失 → ended */
type DetailPageState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ended' }
  | { phase: 'ok'; detail: SessionDetail }

/** 返回按钮（原型 .back 对齐；内联样式，见文件头注） */
const BACK_BTN_STYLE: React.CSSProperties = {
  width: 26,
  height: 26,
  flex: '0 0 26px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: '1px solid rgba(0, 0, 0, 0.15)',
  backgroundColor: 'rgba(255, 255, 255, 0.7)',
  borderRadius: 8,
  color: 'var(--text-muted)',
  fontFamily: 'inherit',
  fontSize: 14,
  lineHeight: 1,
  cursor: 'default'
}

function SessionDetailPage({
  sessionId,
  sessionName,
  onBack
}: SessionDetailPageProps): React.JSX.Element {
  const [state, setState] = useState<DetailPageState>({ phase: 'loading' })

  useEffect(() => {
    // 空 sessionId（scanner 未产出 id 的兜底会话）不发请求，直接结束态
    if (sessionId === '') {
      setState({ phase: 'ended' })
      return
    }

    let disposed = false
    let ended = false
    // 请求序号：push 触发的并发重拉，只认最后一次响应，防旧响应覆盖新数据
    let seq = 0

    const fetchDetail = (): void => {
      const my = ++seq
      window.electronAPI
        .getSessionDetail(sessionId)
        .then((detail) => {
          if (disposed || my !== seq) return
          setState({ phase: 'ok', detail })
        })
        .catch(() => {
          if (disposed || my !== seq) return
          setState({ phase: 'error' })
        })
    }

    setState({ phase: 'loading' })
    fetchDetail()

    // sessions push（services 每轮扫描，默认 3s）：在列表 → 重拉详情；不在 → 会话已结束
    const offSessions = window.electronAPI.onSessionsUpdated((list) => {
      if (disposed || ended) return
      if (list.some((s) => s.sessionId === sessionId)) {
        fetchDetail()
      } else {
        ended = true
        setState({ phase: 'ended' })
      }
    })

    return () => {
      disposed = true
      offSessions()
    }
  }, [sessionId])

  /** 内容区（loading / error / ended 走既有 .detail-empty 空态类；ok 渲染 TaskList + AgentPanel） */
  const renderContent = (): React.JSX.Element => {
    switch (state.phase) {
      case 'loading':
        return (
          <div className="card">
            <div className="detail-empty">加载中…</div>
          </div>
        )
      case 'error':
        return (
          <div className="card">
            <div className="detail-empty detail-error">加载失败</div>
          </div>
        )
      case 'ended':
        return (
          <div className="card">
            <div className="detail-empty">会话已结束</div>
          </div>
        )
      case 'ok':
        return (
          <>
            {/* M19.1 动态消息置顶：最近的会话动态优先展示 */}
            <div className="card">
              <ActivityFeed items={state.detail.messages} />
            </div>
            <div className="card">
              <TaskList tasks={state.detail.tasks} />
            </div>
            <div className="card">
              <AgentPanel agents={state.detail.agents} />
            </div>
          </>
        )
    }
  }

  return (
    <>
      {/* 返回条（原型 .subbar）：← 返回 + 会话名 + ● 实时标记 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          fontSize: 13,
          fontWeight: 700
        }}
      >
        <button
          type="button"
          className="electron-no-drag"
          style={BACK_BTN_STYLE}
          title="返回会话列表"
          aria-label="返回会话列表"
          onClick={onBack}
        >
          ←
        </button>
        <span
          style={{
            flex: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
          title={sessionName}
        >
          {state.phase === 'ended'
            ? '会话已结束'
            : sessionName !== ''
              ? sessionName
              : sessionId}
        </span>
        {state.phase === 'ok' && (
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 400,
              color: 'var(--text-muted)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              flexShrink: 0
            }}
          >
            ● 实时
          </span>
        )}
      </div>

      {renderContent()}
    </>
  )
}

export default SessionDetailPage
