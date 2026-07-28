import { app, ipcMain } from 'electron'

import { loadConfig } from './config'
import { createMainWindow } from './window'
import { createTray } from './tray'

import type { ManagedTray } from './tray'
import type { ManagedWindow } from './window'

/**
 * M4 — 主进程入口（整合托盘 + 窗口管理）
 *
 * 生命周期约定（DESIGN §6.4 / TASKS M4）：
 *   - 单实例锁：重复实例立即退出
 *   - whenReady → createMainWindow + createTray（窗口初始隐藏，托盘左键唤起）
 *   - window-all-closed → 不 quit（托盘常驻）
 *   - will-quit → tray.destroy()
 *   - SIGTERM/SIGINT → app.quit()（FR-6.5 优雅退出）
 */

let managedWindow: ManagedWindow | null = null
let managedTray: ManagedTray | null = null

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

  // 退出时清理托盘
  app.on('will-quit', () => {
    managedTray?.destroy()
    managedTray = null
  })

  // ─── 优雅退出（FR-6.5）───
  process.on('SIGTERM', () => {
    app.quit()
  })
  process.on('SIGINT', () => {
    app.quit()
  })
}
