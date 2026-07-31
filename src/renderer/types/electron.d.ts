/**
 * M7 — electronAPI 全局类型声明（DESIGN §7 / §6.11）
 *
 * 与 src/preload/index.ts 导出的 api 形状一一对应：
 *   - 11 invoke + 5 on-push 逐字对齐 DESIGN §7 ElectronAPI
 *   - windowHide / windowMinimize / windowToggleMaximize 为 M4 建立的
 *     window:* 通道子集（§7 接口未列，TrafficLights.tsx 红绿灯必需，
 *     属蓝图 §7 的受控超集，已记入 M7 偏差）
 *
 * 所有数据类型统一 import 自 src/shared/types.ts（§6.12 单一真源），
 * 避免渲染端字段名漂移。
 */

import type {
  AppConfig,
  ApprovalPayload,
  ApprovalRecord,
  BalanceDailySnapshot,
  DeepPartial,
  PendingApproval,
  SessionInfo,
  UsageRecord
} from '../../shared/types'

export interface ElectronAPI {
  // ── Request/Response（§7 逐字） ──
  getUsageData(): Promise<UsageRecord[]>
  getBalanceHistory(): Promise<BalanceDailySnapshot[]>
  getSessionsData(): Promise<SessionInfo[]>
  getApprovalHistory(): Promise<ApprovalRecord[]>
  getConfig(): Promise<AppConfig>
  saveConfig(partial: DeepPartial<AppConfig>): Promise<AppConfig>
  manualRefresh(): Promise<void>
  jumpToTerminal(cwd: string): Promise<boolean>
  /** 关闭会话所在终端窗口（F3 → closeTerminalOfPid；无终端窗口 → false） */
  terminateSession(pid: number): Promise<boolean>
  respondApproval(id: string, allowed: boolean): Promise<boolean>
  /** 当前待审批列表（P1-3 挂载补拉 seed，approval:get → approvalQueue.getAll） */
  getPendingApprovals(): Promise<PendingApproval[]>
  togglePin(pinned: boolean): Promise<void>
  /** 退出应用（M10 Settings Quit，app:quit → will-quit 清理链） */
  quitApp(): Promise<void>

  // ── 窗口控制子集（M4 建立，§7 未列；TrafficLights 红绿灯调用） ──
  windowHide(): Promise<void>
  windowMinimize(): Promise<void>
  windowToggleMaximize(): Promise<void>
  /** 查询当前置顶状态（M10 Settings "Always on Top" 初始勾选） */
  getAlwaysOnTop(): Promise<boolean>

  // ── Push events → 返回 unsubscribe 函数（§7 逐字） ──
  onUsageUpdated(cb: (data: UsageRecord[]) => void): () => void
  onSessionsUpdated(cb: (sessions: SessionInfo[]) => void): () => void
  /** 运行时负载实为 PendingApproval（含 id，§5.3）；类型按 §7 声明为 ApprovalPayload */
  onApprovalPending(cb: (data: ApprovalPayload) => void): () => void
  onApprovalResolved(cb: (data: { id: string; allowed: boolean }) => void): () => void
  onTrayColorChanged(cb: (color: string) => void): () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
