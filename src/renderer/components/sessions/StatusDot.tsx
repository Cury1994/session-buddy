/**
 * Session 任务状态灯（含名称标签，DESIGN §4 / 基准原型 .status-pulse）
 *
 * 四态（优先级高→低，均带颜色 + 名称文本）：
 *   待执行 红 #ff5252 脉冲 —— hasPendingApproval（命令等待审批，需用户操作）
 *   执行中 黄 #ffd54f 脉冲 —— 进程存活 && recentlyActive（transcript 最近写入，正在执行任务）
 *   busy   绿 #00e676 静   —— 进程存活兜底（会话在运行，但无近期活动）
 *   已退出 灰             —— 进程已死（status idle && memoryMB<=0）
 *   （idle 兜底"空闲"灰）
 */

import type { SessionInfo } from '../../../shared/types'

interface StatusDotProps {
  status: SessionInfo['status']
  memoryMB: number
  hasPendingApproval: boolean
  recentlyActive: boolean
}

function StatusDot({
  status,
  memoryMB,
  hasPendingApproval,
  recentlyActive
}: StatusDotProps): React.JSX.Element {
  let variant: 'pending' | 'executing' | 'busy' | 'idle' | 'dead'
  let label: string
  if (hasPendingApproval) {
    variant = 'pending'
    label = '待执行'
  } else if (status === 'busy' && recentlyActive) {
    variant = 'executing'
    label = '执行中'
  } else if (status === 'busy') {
    variant = 'busy'
    label = 'busy'
  } else if (memoryMB <= 0) {
    variant = 'dead'
    label = '已退出'
  } else {
    variant = 'idle'
    label = '空闲'
  }

  return (
    <span className="status-wrap">
      <span className={`status-dot ${variant}`} title={label} aria-label={label} />
      <span className="status-label">{label}</span>
    </span>
  )
}

export default StatusDot