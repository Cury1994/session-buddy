import { BrowserWindow, nativeImage } from 'electron'
import { join } from 'path'

import { buildAppIconPng } from './tray'
import type { AppConfig } from '../shared/types'

/**
 * M4 — 窗口管理（DESIGN §6.4 / §2.9 / §2.10）
 *
 * 窗口尺寸唯一真源：config.window（默认 340×650，见 DESIGN §2.9 / §8.1），
 * 本模块不自带尺寸常量，直接读 config。
 *
 * 圆角 16px 说明（Linux 适配，DESIGN §2.10）：
 *   frame:false 窗口的 16px 圆角由**渲染侧 CSS**（M7 `.widget-window` 的
 *   border-radius + overflow:hidden）实现，主进程不在此设置圆角——
 *   X11 下 Electron 无法可靠地为非透明窗口设置客户端圆角，强行设置
 *   可能无效甚至产生黑色边角。transparent:true 也未启用（§2.9 明确
 *   本应用非 Widget 形态，无需透明），因此圆角视觉完全交给 CSS。
 */

/** show/focus 后的 blur 宽限期（ms）：抵御 Wayland 焦点弹回导致的误隐藏 */
const SHOW_GRACE_MS = 500

/** createMainWindow 的受控返回值：窗口实例 + 行为开关 */
export interface ManagedWindow {
  win: BrowserWindow
  /** Pin 切换 → alwaysOnTop + blur 不隐藏（渲染端 📌 按钮经 IPC 调用） */
  togglePin(pinned: boolean): void
  isPinned(): boolean
  /** app 进入退出流程后调用：解除 close→hide 拦截，允许窗口真正销毁 */
  markQuitting(): void
}

export function createMainWindow(config: AppConfig): ManagedWindow {
  const win = new BrowserWindow({
    width: config.window.width, // 默认 340（config.yaml window.width）
    height: config.window.height, // 默认 650（config.yaml window.height）
    frame: false, // 无边框，红绿灯由渲染端 TrafficLights.tsx 自绘（M7，§2.10）
    resizable: true,
    skipTaskbar: false, // 正常显示在任务栏（§2.9）
    show: false, // 初始隐藏，托盘左键唤起（§6.4）
    // 任务栏图标：应用自带绿色圆点（与托盘同款），替换 Electron 默认图标
    icon: nativeImage.createFromBuffer(buildAppIconPng()),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // sandbox:true（M7 决策落定，收口 M1 遗留）：preload 仅使用
      // contextBridge + ipcRenderer（沙箱兼容 API），无 require('node:*') /
      // 原生模块链路，实测渲染端 electronAPI 全通道可用。主进程原生模块
      // （better-sqlite3 等）不受渲染端沙箱影响。CSP meta 见 renderer/index.html。
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  let pinned = false
  let quitting = false

  // 托盘应用语义：ready-to-show 后**不自动 show**（§6.4）。
  // 窗口仅在托盘左键 / 菜单 Show Dashboard / IPC 唤起时显示。
  // 调试逃生舱：HM_DEBUG_SHOW=1 启动时临时显示，便于开发验证（不影响最终行为）。
  win.on('ready-to-show', () => {
    if (process.env['HM_DEBUG_SHOW'] === '1') {
      win.show()
    }
  })

  // blur → hide（pinned 状态除外，§6.4 "点击窗口外区域 → 窗口自动隐藏"）。
  // 两条守卫：
  //  1. DevTools 打开时不隐藏——聚焦 DevTools 会触发主窗口 blur，否则调试时窗口反复消失；
  //  2. show/focus 后 500ms 宽限期——GNOME Wayland 下新 show 的窗口常发生
  //     「show → focus → 焦点瞬间弹回原活动窗口 → blur」序列（focus-stealing
  //     prevention），没有宽限期窗口会在唤起后立即消失。实测确认该序列存在。
  let lastActivationAt = 0
  win.on('show', () => {
    lastActivationAt = Date.now()
  })
  win.on('focus', () => {
    lastActivationAt = Date.now()
  })
  win.on('blur', () => {
    if (pinned) return
    if (win.webContents.isDevToolsOpened()) return
    if (Date.now() - lastActivationAt < SHOW_GRACE_MS) return
    win.hide()
  })

  // Close → hide 不 quit（§2.10 红绿灯语义 / §6.4）。
  // 真正的退出由 index.ts 在 before-quit 中 markQuitting() 后放行。
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      win.hide()
    }
  })

  // 开发环境加载 Vite dev server，生产环境加载打包产物
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return {
    win,
    togglePin(next: boolean): void {
      pinned = next
      if (!win.isDestroyed()) {
        win.setAlwaysOnTop(pinned)
      }
    },
    isPinned: () => pinned,
    markQuitting(): void {
      quitting = true
    }
  }
}
