import { app, ipcMain } from 'electron'

import { loadConfig } from './config'
import { createMainWindow } from './window'
import { createTray } from './tray'
import { AppDatabase } from './db'
import { ApprovalQueue } from './approval-queue'
import { initNotifications } from './notifications'
import { createServer } from './server'
import { DeepSeekProvider } from './deepseek'
import { ClaudeCodeSessionScanner } from './claude-sessions'
import { startBalanceChecker, startSessionScanner } from './services'

import type { ManagedTray } from './tray'
import type { ManagedWindow } from './window'
import type { ManagedServer } from './server'
import type { ScheduledTask } from './services'

/**
 * M4/M5 — 主进程入口（整合托盘 + 窗口管理 + 数据库 + HTTP Server + 审批队列）
 *
 * 生命周期约定（DESIGN §6.4 / §6.5 / TASKS M4-M5）：
 *   - 单实例锁：重复实例立即退出
 *   - whenReady → createMainWindow + createTray + AppDatabase(initDB)
 *                 + ApprovalQueue + initNotifications + server.start
 *                 + DeepSeekProvider + ClaudeCodeSessionScanner + 双调度器启动
 *   - window-all-closed → 不 quit（托盘常驻）
 *   - will-quit → 双调度器 stop() + server.stop() + tray.destroy() + db.close()
 *   - SIGTERM/SIGINT → app.quit()（FR-6.5 优雅退出，经 will-quit 走清理）
 */

let managedWindow: ManagedWindow | null = null
let managedTray: ManagedTray | null = null
let managedServer: ManagedServer | null = null
let database: AppDatabase | null = null
let balanceTask: ScheduledTask | null = null
let sessionTask: ScheduledTask | null = null

// ─── 单实例锁 ───

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // 已有实例在跑，第二个进程立即退出
  console.log('[main] 检测到已有实例运行（单实例锁），本进程退出')
  app.quit()
} else {
  // 第二个实例启动时，唤起已有实例的窗口
  app.on('second-instance', () => {
    const win = managedWindow?.win
    if (win && !win.isDestroyed()) {
      win.show()
      win.focus()
    }
  })

  // ─── 最小窗口控制 IPC（M4 子集；全量 IPC 在 M7 ipc-handlers.ts）───
  // 通道命名沿用 §6.11 风格：window:* / app:toggle-pin（已在 §6.11 列出）
  function registerWindowIpc(): void {
    ipcMain.handle('window:hide', () => {
      const win = managedWindow?.win
      if (win && !win.isDestroyed()) win.hide()
    })

    ipcMain.handle('window:minimize', () => {
      const win = managedWindow?.win
      if (win && !win.isDestroyed()) win.minimize()
    })

    ipcMain.handle('window:toggle-maximize', () => {
      const win = managedWindow?.win
      if (win && !win.isDestroyed()) {
        if (win.isMaximized()) {
          win.unmaximize()
        } else {
          win.maximize()
        }
      }
    })

    ipcMain.handle('app:toggle-pin', (_event, pinned: boolean) => {
      managedWindow?.togglePin(pinned)
    })
  }

  app.whenReady().then(() => {
    const config = loadConfig()

    managedWindow = createMainWindow(config)
    managedTray = createTray(config, managedWindow.win)
    registerWindowIpc()

    // ─── M5：数据库 + 审批队列 + 通知 + HTTP Server ───
    // AppDatabase 用默认路径（Linux: ~/.config/harness-monitor/monitor.db，§6.2）。
    // constructor / initDB 属致命错误（db.ts 约定：路径不可写 / Schema 损坏等），
    // 由本调用方在启动阶段捕获并退出，避免裸 unhandled rejection 让应用半死
    // （托盘在、server 未起）。灰灯 = server 未启动 / 致命错误（§6.3）。
    try {
      database = new AppDatabase()
      database.initDB()

      const approvalQueue = new ApprovalQueue(config.notifications.approve_timeout_sec)
      initNotifications(managedWindow.win, config)

      // ─── M6：数据服务 + 调度 ───
      // DeepSeekProvider 读 process.env.DEEPSEEK_API_KEY + config balance_url（§6.7）。
      // ClaudeCodeSessionScanner 持 approvalQueue 引用（合并 hasPendingApproval，§6.8.2 step 4）。
      const balanceProvider = new DeepSeekProvider(config)
      const sessionScanner = new ClaudeCodeSessionScanner(config, approvalQueue)

      // getSessions 注入 scanner 缓存的同步读取（server /api/sessions 用，§5.2）
      managedServer = createServer({
        db: database,
        approvalQueue,
        tray: managedTray,
        win: managedWindow.win,
        config,
        getSessions: () => sessionScanner.getSessions()
      })
      managedServer.start(config.server.port)

      // 双调度器：立即各执行一次，随后按配置间隔轮询（§6.9）。
      // 余额侧颜色联动复用 server.ts computeTrayColor（红>橙>绿，services.ts 内注释）。
      balanceTask = startBalanceChecker({
        db: database,
        provider: balanceProvider,
        approvalQueue,
        config,
        win: managedWindow.win,
        tray: managedTray
      })
      sessionTask = startSessionScanner({
        scanner: sessionScanner,
        approvalQueue,
        db: database,
        config,
        win: managedWindow.win,
        tray: managedTray
      })
    } catch (err) {
      console.error(`[main] 后端启动失败（致命）: ${(err as Error).message}`)
      managedTray?.setIconColor('gray')
      app.exit(1)
      return
    }

    // macOS：点击 dock 图标且无窗口时重建窗口
    app.on('activate', () => {
      if (managedWindow?.win.isDestroyed() ?? true) {
        managedWindow = createMainWindow(config)
      } else {
        managedWindow?.win.show()
      }
    })
  })

  // 托盘常驻：所有窗口关闭也不退出（§6.4）
  app.on('window-all-closed', () => {
    // 故意留空 — close→hide 语义下窗口不会真正关闭，此处理论上不触发
  })

  // 进入退出流程：解除窗口 close→hide 拦截，允许窗口销毁
  app.on('before-quit', () => {
    managedWindow?.markQuitting()
  })

  // 退出时清理：双调度器 → HTTP server → 托盘 → 数据库（§6.9 / §6.5 / §6.4 / §6.2）
  // 定时器先于 server/db 停，避免 stop 间隙回调再触达已关闭的 db / 已销毁的 tray
  app.on('will-quit', () => {
    balanceTask?.stop()
    balanceTask = null
    sessionTask?.stop()
    sessionTask = null
    managedServer?.stop()
    managedServer = null
    managedTray?.destroy()
    managedTray = null
    database?.close()
    database = null
  })

  // ─── 优雅退出（FR-6.5）───
  process.on('SIGTERM', () => {
    app.quit()
  })
  process.on('SIGINT', () => {
    app.quit()
  })
}
