import { app } from 'electron'

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
import { registerIpcHandlers } from './ipc-handlers'

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

  app.whenReady().then(() => {
    const config = loadConfig()

    managedWindow = createMainWindow(config)
    managedTray = createTray(config, managedWindow.win)

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

      // ─── M10：reschedule —— 配置保存后重调度（注入 ipc-handlers config:save）───
      // stop 旧双调度器 → 重新 loadConfig → 按新 config 重启；同时刷新 notifications
      // 模块配置引用（notifications.enabled 即时生效，见 notifications.ts 文件头约定）。
      // balance_warn_threshold / check_interval_min / refresh_interval_sec 在 start* 内
      // 按传入 config 固化，重启后即按新值轮询。const 句柄捕获：database / managedWindow /
      // managedTray 为模块级 let（will-quit 会置 null），闭包内无法收窄，故捕获为非空 const。
      const dbHandle = database
      const winHandle = managedWindow
      const trayHandle = managedTray
      const reschedule = (): void => {
        balanceTask?.stop()
        sessionTask?.stop()
        const fresh = loadConfig()
        initNotifications(winHandle.win, fresh)
        balanceTask = startBalanceChecker({
          db: dbHandle,
          provider: balanceProvider,
          approvalQueue,
          config: fresh,
          win: winHandle.win,
          tray: trayHandle
        })
        sessionTask = startSessionScanner({
          scanner: sessionScanner,
          approvalQueue,
          db: dbHandle,
          config: fresh,
          win: winHandle.win,
          tray: trayHandle
        })
      }

      // ─── M7：IPC 通道集中注册（§6.11 全量 invoke + 窗口控制子集）───
      // 薄封装委托给上面创建的各模块；window:* / app:toggle-pin 自 M4 的 index.ts
      // 临时注册迁入 ipc-handlers.ts 统一管理。app:refresh 委托双调度器的 tick()
      // （services.ts 暴露的手动触发入口，与定时回调同一闭包）。
      registerIpcHandlers({
        db: database,
        scanner: sessionScanner,
        approvalQueue,
        tray: managedTray,
        window: managedWindow,
        triggerRefresh: async () => {
          await Promise.all([balanceTask?.tick(), sessionTask?.tick()])
        },
        reschedule
      })
    } catch (err) {
      console.error(`[main] 后端启动失败（致命）: ${(err as Error).message}`)
      // 审查 P2-3：不再 setIconColor('gray') —— 致命即退出，灰灯随进程消失，
      // 从未有可观测窗口，属不可观测状态。保留 error 日志 + 退出。
      // 审查 P3-4：走 app.quit() → will-quit 清理链（tray.destroy / db.close 等），
      // 而非 app.exit() 绕过清理。will-quit 对各资源的 undefined 状态已用可选链健壮处理。
      process.exitCode = 1
      app.quit()
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

    // 审查 P3-4：致命路径经 process.exitCode + app.quit() 走清理链，但 Electron 默认
    // 退出流程以 exit 0 结束，不保留非零码。清理完成后若 exitCode 为非零，用 app.exit()
    // 强制以该码退出——清理链与退出码两全。正常退出路径 exitCode 为 undefined，
    // 继续走 Electron 默认流程（exit 0），行为不变。
    if (process.exitCode) app.exit(Number(process.exitCode))
  })

  // ─── 优雅退出（FR-6.5）───
  process.on('SIGTERM', () => {
    app.quit()
  })
  process.on('SIGINT', () => {
    app.quit()
  })
}
