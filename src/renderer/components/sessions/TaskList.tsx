/**
 * M16 F2 — 任务进度清单（SessionCard 展开详情区，基准原型 prototype-sessions-v1.html .tasks 段）
 *
 * 有 tasks：完成数/总数 + 绿色进度条 + 每项状态渲染：
 *   completed   → ✓ 绿底勾 + 文本划线弱化
 *   in_progress → 黄色脉冲点（task-dot-pulse）+ 加粗文本
 *   pending     → 灰色空框
 * 无 tasks：居中灰字斜体"无任务清单"。
 *
 * 类名映射表用完整字面量（Tailwind 3.4 会剥离未在源码字面出现的 @layer components
 * 类名，模板拼接会丢样式——M13.6 环境坑）。
 */

import type { SessionTask } from '../../../shared/types'

/** status → 条目整体类名（完整字面量，见文件头注） */
const TASK_ITEM_CLASS: Record<SessionTask['status'], string> = {
  completed: 'task-item done',
  in_progress: 'task-item run',
  pending: 'task-item pend'
}

function TaskList({ tasks }: { tasks: SessionTask[] }): React.JSX.Element {
  if (tasks.length === 0) {
    return (
      <div className="detail-sec">
        <div className="detail-title">
          <span className="detail-ico" aria-hidden="true">
            ✓
          </span>
          任务进度
        </div>
        <div className="detail-empty">无任务清单</div>
      </div>
    )
  }

  const doneCount = tasks.filter((t) => t.status === 'completed').length
  const pct = Math.round((doneCount / tasks.length) * 100)

  return (
    <div className="detail-sec">
      <div className="detail-title">
        <span className="detail-ico" aria-hidden="true">
          ✓
        </span>
        任务进度
      </div>
      <div className="task-progress">
        <div className="task-progress-bar">
          <div className="task-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="task-progress-num">
          {doneCount}/{tasks.length}
        </span>
      </div>
      <div className="task-list">
        {tasks.map((t) => (
          <div key={t.taskId} className={TASK_ITEM_CLASS[t.status]}>
            <span className="task-check" aria-hidden="true">
              {t.status === 'completed' ? '✓' : ''}
            </span>
            <span className="task-text" title={t.content}>
              {t.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TaskList
