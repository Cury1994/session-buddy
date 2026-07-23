import { app, BrowserWindow } from 'electron'
import { join } from 'path'

/**
 * M1 — 最小主进程入口
 *
 * 仅负责：app ready 后创建一个 BrowserWindow 并加载渲染进程。
 * frameless / transparent / 系统托盘 / 单实例锁 / 窗口显隐等窗口管理逻辑
 * 属于 M4（系统托盘 + 窗口管理），此处不提前实现。
 *
 * 窗口尺寸取自 DESIGN §2.9 / config.yaml（340×650），M1 先用固定值，
 * M2 配置管理接入后改由 loadConfig() 提供。
 */
const WINDOW_WIDTH = 340
const WINDOW_HEIGHT = 650

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 优雅显示，避免白屏闪烁
  win.on('ready-to-show', () => {
    win.show()
  })

  // 开发环境加载 Vite dev server，生产环境加载打包产物
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    // macOS：点击 dock 图标且无窗口时重建窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 所有窗口关闭时退出（非 macOS）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
