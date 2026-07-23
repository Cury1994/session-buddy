import { contextBridge } from 'electron'

/**
 * M1 — 空 contextBridge 骨架
 *
 * M9（IPC 通道 + Preload）会在此暴露 `window.electronAPI` 的具体方法
 * （用量查询、sessions、审批、设置等）。M1 仅占位，确保
 * contextIsolation 链路打通、preload 能被主进程正确加载。
 *
 * 全局命名约定 `electronAPI`（对齐 DESIGN §7 / TASKS M9），避免与
 * 第三方库常见的 `window.api` 命名冲突。
 */
const api = {
  version: '1.0.0'
} as const

try {
  contextBridge.exposeInMainWorld('electronAPI', api)
} catch (error) {
  console.error('[preload] exposeInMainWorld failed:', error)
}

export type Api = typeof api
