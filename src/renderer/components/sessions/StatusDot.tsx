/**
 * M9 — Session 状态灯（DESIGN §4 / 基准原型 .status-pulse）
 *
 * busy（进程存活）：绿色 #00e676 脉冲动画（globals.css @keyframes status-pulse）。
 * idle（进程死亡）：灰色静止；memoryMB<=0 视为进程已退出（dead，更淡的灰）。
 * SessionStatus 仅 busy/idle 两态（§6.12），dead 由 idle + memoryMB=0 推断（§6.8 进程死亡 memory=0）。
 */

import type { SessionInfo } from '../../../shared/types'

interface StatusDotProps {
  status: SessionInfo['status']
  memoryMB: number
}

function StatusDot({ status, memoryMB }: StatusDotProps): React.JSX.Element {
  const dead = status === 'idle' && memoryMB <= 0
  const variant = status === 'busy' ? 'busy' : dead ? 'dead' : 'idle'
  const label = status === 'busy' ? 'Working' : dead ? 'Process exited' : 'Waiting'

  return <span className={`status-dot ${variant}`} title={label} aria-label={label} />
}

export default StatusDot
