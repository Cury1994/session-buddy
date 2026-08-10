import { contextBridge, ipcRenderer } from 'electron'

import type { IpcRendererEvent } from 'electron'
import type {
  AppConfig,
  ApprovalPayload,
  BalanceDailySnapshot,
  DeepPartial,
  PendingApproval,
  SessionDetail,
  SessionInfo,
  UsageCard
} from '../shared/types'

/**
 * M7 — Preload：完整 electronAPI（DESIGN §7 / §6.11）
 *
 * contextBridge.exposeInMainWorld('electronAPI', {...})：
 *   - 15 个 invoke 方法（Request/Response，薄封装 ipcRenderer.invoke；
 *     含 M10 quitApp、P1-3 getPendingApprovals(approval:get) 与 F3 自动审批开关
 *     setAutoApprove/getAutoApprove(approval:set/get-auto-approve)）
 *   - 3 个窗口控制 invoke（M4 建立的 window:* 子集，TrafficLights.tsx 必需；
 *     §7 ElectronAPI 未列，属 M4 既有通道的延续）
 *   - 5 个 on-push 监听（返回 unsubscribe 函数，组件 useEffect 清理）
 *
 * 仅使用 contextBridge + ipcRenderer —— 两者均兼容 sandbox:true 渲染进程
 * （M7 sandbox 决策，见 window.ts 注释）。渲染端类型声明见
 * src/renderer/types/electron.d.ts（与本文件导出的形状一一对应）。
 */

/** on-push 监听器工厂：包装 ipcRenderer.on，返回精确移除该监听器的 unsubscribe */
function subscribe<T>(channel: string, cb: (data: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, data: T): void => cb(data)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api = {
  // ── Request/Response（§7，11 invoke） ──

  /** 最新用量卡（usage:get → 调度器缓存 UsageCard[]，M13.5 泛化；首轮 tick 前为 []） */
  getUsageData: (): Promise<UsageCard[]> => ipcRenderer.invoke('usage:get'),

  /** 30 天余额走势（usage:history → db.get30DayBalance(sourceId) 逐卡取趋势） */
  getBalanceHistory: (sourceId: string): Promise<BalanceDailySnapshot[]> =>
    ipcRenderer.invoke('usage:history', sourceId),

  /** 活跃 session 列表（sessions:get → scanner 缓存） */
  getSessionsData: (): Promise<SessionInfo[]> => ipcRenderer.invoke('sessions:get'),

  /** 会话展开详情（M16，sessions:detail → 增量细节扫描器缓存：任务/子Agent/消息尾流） */
  getSessionDetail: (sessionId: string): Promise<SessionDetail> =>
    ipcRenderer.invoke('sessions:detail', sessionId),

  /** 当前生效配置（config:get → loadConfig） */
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),

  /**
   * 深合并保存用户配置（config:save → saveConfig）。入参支持嵌套子集（DeepPartial）。
   * resolve → 合并后的完整生效配置；写盘失败 → reject（M10 契约收窄，UI 据此显错误）。
   */
  saveConfig: (partial: DeepPartial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke('config:save', partial),

  /** 手动刷新一轮（app:refresh → balanceChecker + sessionScanner 各一轮） */
  manualRefresh: (): Promise<void> => ipcRenderer.invoke('app:refresh'),

  /** 响应审批（approval:respond → queue.respond + approval:resolved push） */
  respondApproval: (id: string, allowed: boolean): Promise<boolean> =>
    ipcRenderer.invoke('approval:respond', { id, allowed }),

  /**
   * 当前待审批列表（approval:get → approvalQueue.getAll，P1-3 挂载补拉 seed）。
   * useSessionsData 挂载时与 sessions:get 一并调用，补上离标签页 / 启动前到达的审批。
   */
  getPendingApprovals: (): Promise<PendingApproval[]> => ipcRenderer.invoke('approval:get'),

  /**
   * 设置某会话的自动审批开关（F3，M17.1 每会话独立，approval:set-auto-approve →
   * server.ts 模块级会话键集合；仅按 sessionId 建键）。
   * 开启后该会话的审批立即放行（复用唯一落库点记 allowed=1，不入队/不通知/不置橙）。
   */
  setAutoApprove: (sessionId: string, v: boolean): Promise<void> =>
    ipcRenderer.invoke('approval:set-auto-approve', sessionId, v),

  /**
   * 读取某会话的自动审批开关（F3，M17.1，approval:get-auto-approve）：
   * SessionCard 挂载播种真源；按 sessionId 命中。
   */
  getAutoApprove: (sessionId: string): Promise<boolean> =>
    ipcRenderer.invoke('approval:get-auto-approve', sessionId),

  /** Pin 切换（app:toggle-pin → alwaysOnTop + blur 不隐藏） */
  togglePin: (pinned: boolean): Promise<void> => ipcRenderer.invoke('app:toggle-pin', pinned),

  /** 退出应用（app:quit → app.quit()，经 will-quit 清理链，FR-6.5） */
  quitApp: (): Promise<void> => ipcRenderer.invoke('app:quit'),

  // ── 窗口控制子集（M4 建立，§7 未列；TrafficLights.tsx 红绿灯调用） ──

  /** 隐藏窗口（红绿灯 Close 同语义：hide 不 quit） */
  windowHide: (): Promise<void> => ipcRenderer.invoke('window:hide'),

  /** 最小化 */
  windowMinimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),

  /** 最大化 / 还原 toggle */
  windowToggleMaximize: (): Promise<void> => ipcRenderer.invoke('window:toggle-maximize'),

  /** 查询当前置顶状态（window:get-always-on-top → ManagedWindow.isPinned，M10 设置页） */
  getAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('window:get-always-on-top'),

  // ── Push events（§7，返回 unsubscribe 函数） ──

  /** 用量卡更新（services.ts 每轮多卡余量查询后 push UsageCard[]，M13.5） */
  onUsageUpdated: (cb: (data: UsageCard[]) => void): (() => void) =>
    subscribe('usage:updated', cb),

  /** Session 列表更新（services.ts 每轮扫描后 push，默认 3s） */
  onSessionsUpdated: (cb: (sessions: SessionInfo[]) => void): (() => void) =>
    subscribe('sessions:updated', cb),

  /**
   * 新审批到达（server.ts POST /approve push）。
   * 运行时负载实为 PendingApproval（含 id/createdAt/timeoutSec，§5.3 / §6.12），
   * 类型按 §7 声明为 ApprovalPayload；M9 消费 id 字段时按运行时形状取用。
   */
  onApprovalPending: (cb: (data: ApprovalPayload) => void): (() => void) =>
    subscribe('approval:pending', cb),

  /** 审批已解析（IPC / HTTP /respond 两条路径均 push {id, allowed}） */
  onApprovalResolved: (cb: (data: { id: string; allowed: boolean }) => void): (() => void) =>
    subscribe('approval:resolved', cb),

  /** 托盘颜色变化（tray.ts setIconColor 成功后 push，四色字符串） */
  onTrayColorChanged: (cb: (color: string) => void): (() => void) =>
    subscribe('tray:color-changed', cb)
}

try {
  contextBridge.exposeInMainWorld('electronAPI', api)
} catch (error) {
  console.error('[preload] exposeInMainWorld failed:', error)
}

export type Api = typeof api
