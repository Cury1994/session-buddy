/**
 * M16 F3 — 子 Agent 协作面板（SessionCard 展开详情区，基准原型 prototype-sessions-v1.html .ag 段）
 *
 * 有 agents：每项 = 类型首字母头像 + 类型名 + description + 状态标签
 *   running → 绿"运行中" / done → 灰"已返回"（契约仅两态，原型 wait 态不落地）。
 * 无 agents：居中灰字斜体"无子 Agent"。
 *
 * 类名映射表用完整字面量（Tailwind 3.4 剥离坑，见 TaskList.tsx 头注）。
 */

import type { SubAgentRef } from '../../../shared/types'

/** status → 状态标签类名（完整字面量） */
const AGENT_STATUS_CLASS: Record<SubAgentRef['status'], string> = {
  running: 'agent-status running',
  done: 'agent-status done'
}

/** status → 状态标签文案 */
const AGENT_STATUS_LABEL: Record<SubAgentRef['status'], string> = {
  running: '运行中',
  done: '已返回'
}

function AgentPanel({ agents }: { agents: SubAgentRef[] }): React.JSX.Element {
  if (agents.length === 0) {
    return (
      <div className="detail-sec">
        <div className="detail-title">
          <span className="detail-ico" aria-hidden="true">
            ◈
          </span>
          子 Agent 协作
        </div>
        <div className="detail-empty">无子 Agent</div>
      </div>
    )
  }

  return (
    <div className="detail-sec">
      <div className="detail-title">
        <span className="detail-ico" aria-hidden="true">
          ◈
        </span>
        子 Agent 协作
      </div>
      {agents.map((a) => (
        <div key={a.id} className="agent-row">
          <span className="agent-avatar" aria-hidden="true">
            {a.type.length > 0 ? a.type.charAt(0).toUpperCase() : '?'}
          </span>
          <div className="agent-info">
            <div className="agent-name" title={a.type}>
              {a.type}
            </div>
            <div className="agent-desc" title={a.description}>
              {a.description}
            </div>
          </div>
          <span className={AGENT_STATUS_CLASS[a.status]}>{AGENT_STATUS_LABEL[a.status]}</span>
        </div>
      ))}
    </div>
  )
}

export default AgentPanel
