import { notifyBalanceLow } from './notifications'
import { computeTrayColor } from './server'

import type { BrowserWindow } from 'electron'
import type { ApprovalQueue } from './approval-queue'
import type { ClaudeCodeSessionScanner } from './claude-sessions'
import type { AppDatabase } from './db'
import type { DeepSeekProvider } from './deepseek'
import type { ManagedTray } from './tray'
import type { AppConfig } from '../shared/types'

/**
 * M6 — 定时调度胶水层（DESIGN §6.9 / §5.1 / §5.2）
 *
 * 双定时器：
 *   balanceChecker — 立即一次 + check_interval_min 分钟（默认 1）
 *   sessionScanner — 立即一次 + refresh_interval_sec 秒（默认 3）
 * 各返回 `{stop()}` 清理 setInterval（index.ts 在 will-quit 先于 server.stop / db.close 调用）。
 *
 * 颜色联动（余额侧）：复用 server.ts 导出的 `computeTrayColor`（颜色优先级协议
 * 红>橙>绿 的唯一实现，见 server.ts 文件头协议注释），本模块**不自写颜色逻辑**，
 * 只把协议输出落到 `tray.setIconColor`。余额恢复后的绿/橙判定、余额告警的红判定，
 * 全部由 computeTrayColor(approvalQueue.size, db.getLatestUsage(), threshold) 收敛，
 * 与审批侧（server.ts 内部 refreshTrayColor）走同一函数，两条链路收敛到同一优先级。
 *
 * NFR-3：定时器回调整体 try/catch + warn，单次失败不中断后续轮询。
 */

export interface BalanceCheckerDeps {
  db: AppDatabase
  provider: DeepSeekProvider
  approvalQueue: ApprovalQueue // computeTrayColor 需要 queue size（红>橙判定）
  config: AppConfig
  win: BrowserWindow
  tray: ManagedTray
}

export interface SessionScannerDeps {
  scanner: ClaudeCodeSessionScanner
  approvalQueue: ApprovalQueue
  db: AppDatabase // refreshTrayColor 需要最新余额快照
  config: AppConfig
  win: BrowserWindow
  tray: ManagedTray
}

export interface ScheduledTask {
  stop(): void
}

function sendToRenderer(win: BrowserWindow, channel: string, payload: unknown): void {
  if (!win.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

/**
 * 余额轮询。每轮：checkBalance → 非 null 则入库 + push usage:updated →
 * 阈值判定（低余额首次告警弹通知，恢复后重置）→ 按协议刷新托盘色。
 */
export function startBalanceChecker(deps: BalanceCheckerDeps): ScheduledTask {
  const { db, provider, approvalQueue, config, win, tray } = deps
  const intervalMin = Math.max(1, config.providers.deepseek.check_interval_min)
  const intervalMs = intervalMin * 60 * 1000
  const threshold = config.providers.deepseek.balance_warn_threshold

  // 低余额去抖：避免每分钟重复弹通知；余额恢复后重置，再次跌破可再弹
  let lowNotified = false

  async function tick(): Promise<void> {
    try {
      const info = await provider.checkBalance()
      if (!info) return // NFR-3：失败保留上次数据，不 push、不改色

      db.recordUsage(info.provider, 'all', info.balance, info.currency)
      // 审查 P3-5：本轮只取一次最新余额快照，sendToRenderer 与 computeTrayColor 复用，
      // 避免同一 tick 内两次 db.getLatestUsage()。
      const latest = db.getLatestUsage()
      sendToRenderer(win, 'usage:updated', latest)

      const isLow = info.balance < threshold
      if (isLow && !lowNotified) {
        notifyBalanceLow(info.balance, info.currency)
        lowNotified = true
      } else if (!isLow && lowNotified) {
        lowNotified = false
      }

      // 颜色优先级协议（红>橙>绿）：余额告警→红由 computeTrayColor 判定
      tray.setIconColor(computeTrayColor(approvalQueue.size, latest, threshold))
    } catch (err) {
      console.warn(`[services] balanceChecker tick 失败: ${(err as Error).message}`)
    }
  }

  void tick() // 立即执行一次
  const timer = setInterval(() => {
    void tick()
  }, intervalMs)

  return {
    stop(): void {
      clearInterval(timer)
    }
  }
}

/**
 * Session 扫描。每轮：discoverSessions（内部刷新 scanner 缓存）→
 * 更新托盘菜单快照 → push sessions:updated → 按协议刷新托盘色（存活 session
 * 变化可能影响颜色判定边界，调一次无副作用）。
 */
export function startSessionScanner(deps: SessionScannerDeps): ScheduledTask {
  const { scanner, approvalQueue, db, config, win, tray } = deps
  const intervalSec = Math.max(1, config.harnesses['claude-code'].refresh_interval_sec)
  const intervalMs = intervalSec * 1000
  const threshold = config.providers.deepseek.balance_warn_threshold

  async function tick(): Promise<void> {
    try {
      const sessions = await scanner.discoverSessions()
      tray.setSessionSnapshot(sessions.map((s) => ({ name: s.name, status: s.status })))
      sendToRenderer(win, 'sessions:updated', sessions)
      tray.setIconColor(computeTrayColor(approvalQueue.size, db.getLatestUsage(), threshold))
    } catch (err) {
      console.warn(`[services] sessionScanner tick 失败: ${(err as Error).message}`)
    }
  }

  void tick() // 立即执行一次
  const timer = setInterval(() => {
    void tick()
  }, intervalMs)

  return {
    stop(): void {
      clearInterval(timer)
    }
  }
}
