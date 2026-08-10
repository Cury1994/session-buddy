/**
 * M19 — 动态消息（详情页「动态消息」板块，原型 prototype-sessions-v3.html .log 段）
 *
 * 近 3 条操作/对话混排尾流（SessionDetail.messages），深色终端风：
 *   user（红 who "USER"）/ assistant（蓝 who "CLAUDE"）/
 *   tool（绿 who "TOOL"）/ agent（紫 who "AGENT"）
 * 无 messages：居中灰字"无动态消息"。
 *
 * 复用 globals.css 孤儿 .msg-* 类（M17.1 删 MessageTail 后遗留，本次回归复用），
 * 类名全字面量（Tailwind 3.4 剥离坑，见 TaskList.tsx 头注）。
 */

import { useEffect, useRef } from 'react'

import type { SessionFeedItem } from '../../../shared/types'

/** kind → who 标签（深色终端风，v1 MessageTail 同源） */
const FEED_WHO: Record<SessionFeedItem['kind'], string> = {
  user: 'USER',
  assistant: 'CLAUDE',
  tool: 'TOOL',
  agent: 'AGENT'
}

/** kind → 行整体类名（user 红头 / assistant 蓝头 / tool 绿头 / agent 紫头） */
const FEED_ROW_CLASS: Record<SessionFeedItem['kind'], string> = {
  user: 'msg-line user',
  assistant: 'msg-line',
  tool: 'msg-line tool',
  agent: 'msg-line agent'
}

function ActivityFeed({ items }: { items: SessionFeedItem[] }): React.JSX.Element {
  const logRef = useRef<HTMLDivElement>(null)

  // M19.1 默认定位最新 + 新消息自动滚动到底部（.msg-log 内部滚动容器）：
  // 挂载时滚到底（详情打开即见最新动态），items 更新（3s 推送/详情重拉）时再次滚底，
  // 保证最新一条动态始终在可视区（"动态滑动到最佳展示位置"）。
  useEffect(() => {
    const el = logRef.current
    if (el !== null) el.scrollTop = el.scrollHeight
  }, [items])

  if (items.length === 0) {
    return (
      <div className="detail-sec">
        <div className="detail-title">
          <span className="detail-ico" aria-hidden="true">
            ◎
          </span>
          动态消息
        </div>
        <div className="detail-empty">无动态消息</div>
      </div>
    )
  }

  return (
    <div className="detail-sec">
      <div className="detail-title">
        <span className="detail-ico" aria-hidden="true">
          ◎
        </span>
        动态消息
      </div>
      <div className="msg-log" ref={logRef}>
        {items.map((m, i) => (
          <div key={i} className={FEED_ROW_CLASS[m.kind]}>
            <span className="msg-who">{FEED_WHO[m.kind]}</span>
            <span className="msg-text">{m.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ActivityFeed
