import { contextBridge, ipcRenderer } from 'electron'

/**
 * M4 — Preload：最小窗口控制 API
 *
 * M7（IPC 通道 + 挂件壳）会扩展为完整的 electronAPI（DESIGN §7：
 * 用量/sessions/审批/配置/推送事件 + 独立类型声明文件 .d.ts），
 * M4 阶段只暴露窗口行为所需的四个 invoke，保持最小可用。
 *
 * 通道命名沿用 DESIGN §6.11 风格：window:* / app:toggle-pin。
 */
const api = {
  version: '1.0.0',

  // ── M4 窗口控制子集（M7 扩展完整 API） ──

  /** 隐藏窗口（红绿灯 Close 同语义：hide 不 quit） */
  windowHide: (): Promise<void> => ipcRenderer.invoke('window:hide'),

  /** 最小化 */
  windowMinimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),

  /** 最大化 / 还原 toggle */
  windowToggleMaximize: (): Promise<void> => ipcRenderer.invoke('window:toggle-maximize'),

  /** Pin 切换 → alwaysOnTop + blur 不隐藏（§6.11 app:toggle-pin） */
  togglePin: (pinned: boolean): Promise<void> => ipcRenderer.invoke('app:toggle-pin', pinned)
} as const

try {
  contextBridge.exposeInMainWorld('electronAPI', api)
} catch (error) {
  console.error('[preload] exposeInMainWorld failed:', error)
}

export type Api = typeof api
