/**
 * M16 F4 — 最近对话尾流（SessionCard 展开详情区，基准原型 prototype-sessions-v1.html .log 段）
 *
 * 有 messages：深色终端风格列表——user 头红（USER）/ assistant 头蓝（CLAUDE），
 * 文本灰白 monospace，超长换行。无 messages：居中灰字斜体"无近期对话"。
 *
 * 行类名三元用完整字面量（Tailwind 3.4 剥离坑，见 TaskList.tsx 头注）。
 */

import type { SessionMessage } from '../../../shared/types'

/** role → 头署名（契约仅 user/assistant 两态） */
const MSG_WHO: Record<SessionMessage['role'], string> = {
  user: 'USER',
  assistant: 'CLAUDE'
}

function MessageTail({ messages }: { messages: SessionMessage[] }): React.JSX.Element {
  if (messages.length === 0) {
    return (
      <div className="detail-sec">
        <div className="detail-title">
          <span className="detail-ico" aria-hidden="true">
            ◎
          </span>
          最近对话
        </div>
        <div className="detail-empty">无近期对话</div>
      </div>
    )
  }

  return (
    <div className="detail-sec">
      <div className="detail-title">
        <span className="detail-ico" aria-hidden="true">
          ◎
        </span>
        最近对话
      </div>
      <div className="msg-log">
        {messages.map((m, i) => (
          <div key={`${m.role}-${i}`} className={m.role === 'user' ? 'msg-line user' : 'msg-line'}>
            <span className="msg-who">{MSG_WHO[m.role]}</span>
            <span className="msg-text">{m.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default MessageTail
