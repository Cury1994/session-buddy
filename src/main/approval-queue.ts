import { randomUUID } from 'node:crypto'

import type { ApprovalPayload, PendingApproval } from '../shared/types'

/**
 * M5 — 审批队列（DESIGN §6.6 / §5.3）
 *
 * 阻塞式审批的内存中枢：POST /approve 入队拿到 `{id, promise}` 后 `await promise`
 * 挂起 HTTP 请求；用户（或超时）解析 promise 后请求才返回。
 *
 * id 策略（REVIEW #12）：`crypto.randomUUID()`（RFC 4122 v4）。UUID 无状态、
 * 无需跨重启持久化自增计数器、并发安全；仅存于内存 Map 与运行时 IPC，不落库
 * （approval_history 用自身 INTEGER AUTOINCREMENT id，见 §6.2）。
 *
 * 超时：入队时 `setTimeout(timeoutSec)`（默认读 config.notifications.approve_timeout_sec），
 * 到点自动 resolve(false)（deny）并从 Map 移除——server 侧 await 恢复时 `size`
 * 已反映移除，颜色联动（server.refreshTrayColor）据此复位。
 */

interface PendingEntry {
  pending: PendingApproval
  resolve: (allowed: boolean) => void
  timer: NodeJS.Timeout
}

export class ApprovalQueue {
  private readonly pending = new Map<string, PendingEntry>()
  private readonly timeoutSec: number

  /** @param timeoutSec 审批超时秒数（默认 60；由 config.notifications.approve_timeout_sec 传入） */
  constructor(timeoutSec = 60) {
    this.timeoutSec = timeoutSec
  }

  /**
   * 入队一个审批请求。
   * @returns id（UUID）+ promise（用户 respond 或超时后解析为 allowed:boolean）
   */
  enqueue(payload: ApprovalPayload): { id: string; promise: Promise<boolean> } {
    const id = randomUUID()
    const pending: PendingApproval = {
      ...payload,
      id,
      createdAt: Date.now(),
      timeoutSec: this.timeoutSec
    }

    let resolve!: (allowed: boolean) => void
    const promise = new Promise<boolean>((res) => {
      resolve = res
    })

    // 超时兜底：自动 deny。先 delete 再 resolve，保证 server 侧 await 恢复时
    // queue.size 已更新（respond 与超时互斥，delete 返回 false 说明已被 respond 移除）。
    const timer = setTimeout(() => {
      if (this.pending.delete(id)) {
        resolve(false)
      }
    }, this.timeoutSec * 1000)

    this.pending.set(id, { pending, resolve, timer })
    return { id, promise }
  }

  /**
   * 解析指定审批。
   * @returns 是否成功（id 不存在 / 已超时被移除 → false）
   */
  respond(id: string, allowed: boolean): boolean {
    const entry = this.pending.get(id)
    if (!entry) return false
    clearTimeout(entry.timer)
    this.pending.delete(id)
    entry.resolve(allowed)
    return true
  }

  /** 所有 pending 审批列表（GET /api/approvals）。 */
  getAll(): PendingApproval[] {
    return [...this.pending.values()].map((entry) => entry.pending)
  }

  /** 当前待审批数量（托盘橙色判定：size > 0）。 */
  get size(): number {
    return this.pending.size
  }
}
