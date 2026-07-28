import { Notification } from 'electron'

import type { BrowserWindow } from 'electron'
import type { ApprovalPayload, AppConfig } from '../shared/types'

/**
 * M5 — 桌面通知工具模块（DESIGN §6.10 / §5.3）
 *
 * 两类通知：
 *   - notifyApproval(payload)：审批到达（M5 server 调用）
 *   - notifyBalanceLow(balance, currency)：余额告警（M6 balanceChecker 调用）
 *
 * 开关：config.notifications.enabled 为 false 时静默（每次调用实时读取，
 * 供 M10 设置页改配置后即时生效）。点击通知 → win.show() + focus。
 *
 * initNotifications 持有窗口引用（点击唤起）与配置引用（enabled 开关）；
 * M10 重新调度时可用新 config 再次调用以刷新引用。
 */

/** 命令预览截断长度（通知 body 过长无意义） */
const COMMAND_PREVIEW_MAX = 120

let winRef: BrowserWindow | null = null
let configRef: AppConfig | null = null

/** 初始化：持窗口 + 配置引用（server 启动前调用一次） */
export function initNotifications(win: BrowserWindow, config: AppConfig): void {
  winRef = win
  configRef = config
}

function notificationsEnabled(): boolean {
  return configRef?.notifications.enabled ?? false
}

/** 点击通知 → 唤起主窗口 */
function attachClickToShow(notification: Notification): void {
  notification.on('click', () => {
    const win = winRef
    if (win && !win.isDestroyed()) {
      win.show()
      win.focus()
    }
  })
}

/** 审批到达通知（标题含 session 名，body 命令预览截断） */
export function notifyApproval(payload: ApprovalPayload): void {
  if (!notificationsEnabled() || !Notification.isSupported()) return

  const command =
    payload.command.length > COMMAND_PREVIEW_MAX
      ? `${payload.command.slice(0, COMMAND_PREVIEW_MAX)}…`
      : payload.command

  const notification = new Notification({
    title: `Session ${payload.session} requests approval`,
    body: command
  })
  attachClickToShow(notification)
  notification.show()
}

/** 余额告警通知（M6 balanceChecker 调用；本模块先实现） */
export function notifyBalanceLow(balance: number, currency: string): void {
  if (!notificationsEnabled() || !Notification.isSupported()) return

  const symbol = currency === 'CNY' ? '¥' : `${currency} `
  const notification = new Notification({
    title: 'Low API Balance',
    body: `Balance below warning threshold: ${symbol}${balance.toFixed(2)}`
  })
  attachClickToShow(notification)
  notification.show()
}
