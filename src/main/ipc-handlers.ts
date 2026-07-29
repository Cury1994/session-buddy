import { app, ipcMain } from 'electron'

import { loadConfig, saveConfig } from './config'

import type { ApprovalQueue } from './approval-queue'
import type { ClaudeCodeSessionScanner } from './claude-sessions'
import type { AppDatabase } from './db'
import type { ManagedTray } from './tray'
import type { ManagedWindow } from './window'
import type { DeepPartial } from './config'
import type { AppConfig, ApprovalResponse } from '../shared/types'

/**
 * M7 — IPC 通道集中注册（DESIGN §6.11 / §7）
 *
 * 所有 ipcMain.handle 薄封装在此注册，每个 handler 只做参数校验 + 委托，
 * 不持有业务逻辑。依赖经 deps 注入（index.ts 接线）。
 *
 * ─── 不变量（审查整改确立，DESIGN §5.3）───
 *   db.recordApproval 的**唯一落库点**在 server.ts POST /approve 的 await 恢复处
 *   （覆盖 respond / 超时 auto-deny 两条路径，promise 单次解析 → 每条审批恰一行）。
 *   本模块的 approval:respond **只做** queue.respond + 补发 approval:resolved push
 *   （使所有视图收敛），**绝不重复落库**、不刷托盘色（POST /approve 恢复处已按
 *   颜色优先级协议刷新）。
 *
 * 通道一览（§6.11）：
 *   invoke: usage:get / usage:history / sessions:get / history:get /
 *           config:get / config:save / app:refresh / app:quit /
 *           session:jump-terminal / session:terminate / approval:respond /
 *           app:toggle-pin
 *   window:hide / window:minimize / window:toggle-maximize / window:get-always-on-top
 *           （M4 建立的窗口控制子集，§6.11 未列但 TrafficLights 必需，
 *            自 index.ts 临时注册迁入统一管理）
 *   push（他模块发出）: usage:updated / sessions:updated / approval:pending /
 *           approval:resolved（本模块补发）/ tray:color-changed（tray.ts 发出）
 */

/** registerIpcHandlers 的依赖注入包（index.ts 接线） */
export interface IpcHandlerDeps {
  db: AppDatabase
  scanner: ClaudeCodeSessionScanner
  approvalQueue: ApprovalQueue
  /** 当前未被 handler 直接使用（颜色 push 在 tray.ts 内部完成），保留供后续模块扩展 */
  tray: ManagedTray
  window: ManagedWindow
  /** app:refresh → 手动触发一轮 balanceChecker + sessionScanner（services 暴露的 tick） */
  triggerRefresh: () => Promise<void>
  /**
   * config:save 成功后按新配置重调度双定时器（index.ts 实现并注入）：
   * stop 旧 balanceChecker/sessionScanner → 重新 loadConfig → 按新 config 重启。
   * 使 check_interval_min / refresh_interval_sec / balance_warn_threshold /
   * notifications.enabled 变更即时生效（M10）。
   */
  reschedule: () => void
}

/** 纯对象守卫：config:save 入参校验（拒绝 null / 数组 / 标量） */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function registerIpcHandlers(deps: IpcHandlerDeps): void {
  const { db, scanner, approvalQueue, window: managedWindow } = deps

  // ─── 用量 ───

  /** 最新余额快照（db.getLatestUsage，§6.2） */
  ipcMain.handle('usage:get', () => db.getLatestUsage())

  /** 30 天余额走势（db.get30DayBalance，供 TrendSparkline，§6.11 v2.3 补入） */
  ipcMain.handle('usage:history', () => db.get30DayBalance('deepseek', 'all'))

  // ─── Sessions / 审批历史 ───

  /** 活跃 session（scanner 缓存的同步读取，§5.2） */
  ipcMain.handle('sessions:get', () => scanner.getSessions())

  /** 最近审批历史（limit 缺省 20，非法值回退 20） */
  ipcMain.handle('history:get', (_event, limit?: number) => {
    const safeLimit =
      typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? limit : 20
    return db.getRecentApprovals(safeLimit)
  })

  // ─── 配置 ───

  /** 每次读盘上最新合并配置（loadConfig 内部已降级，§6.1 / §8.2） */
  ipcMain.handle('config:get', () => loadConfig())

  /**
   * 深合并写回用户配置文件（saveConfig，§8.2），成功后重调度双定时器。
   * - 入参非对象 → warn + 返回当前生效配置（loadConfig），不落盘。
   * - saveConfig 写失败会**抛异常**（M10 契约收窄，见 config.ts）→ invoke 转 reject，
   *   渲染端据此显 "保存失败"。成功返回合并后完整 AppConfig 供 UI 确认，并经
   *   deps.reschedule() 让 check_interval_min / balance_warn_threshold /
   *   notifications.enabled 等变更即时生效。
   */
  ipcMain.handle('config:save', (_event, partial: unknown) => {
    if (!isPlainObject(partial)) {
      console.warn('[ipc] config:save 入参非对象，已忽略')
      return loadConfig()
    }
    const merged = saveConfig(partial as DeepPartial<AppConfig>) // 失败抛 → invoke reject
    deps.reschedule() // 成功后按新 config 重调度定时器
    return merged // 返回生效配置供 UI 确认
  })

  // ─── 应用级 ───

  /** 手动刷新一轮（余额查询 + session 扫描，FR-1.5） */
  ipcMain.handle('app:refresh', async () => {
    await deps.triggerRefresh()
  })

  /**
   * 退出应用（M10 Settings Quit 按钮，FR-6.5）：走 app.quit() → before-quit
   * (markQuitting) → will-quit 清理链（双调度器 stop / server.stop / tray.destroy /
   * db.close），与托盘菜单 Quit / SIGTERM 同一退出路径，无残留进程。
   */
  ipcMain.handle('app:quit', () => {
    app.quit()
  })

  /** Pin 切换 → alwaysOnTop + blur 不隐藏（M4 已有，统一到 handlers） */
  ipcMain.handle('app:toggle-pin', (_event, pinned: boolean) => {
    managedWindow.togglePin(pinned === true)
  })

  // ─── Session 操作 ───

  /**
   * 跳转终端（FR-2.7）。
   * ⚠ M9 桩：通道先行注册齐全（§6.11），实际 kgx/gnome-terminal 直起逻辑
   *   在 M9 Sessions 视图实现（DESIGN §6.8.4）。当前恒返回 false。
   */
  ipcMain.handle('session:jump-terminal', (_event, _cwd: string) => {
    return false // M9 实现
  })

  /** 终止 session 进程（FR-2.8）：SIGTERM，任何失败 → false */
  ipcMain.handle('session:terminate', (_event, pid: number) => {
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false
    if (pid === process.pid) return false // 自杀守卫：scanner 已排除自身，防御手动调用
    try {
      process.kill(pid, 'SIGTERM')
      return true
    } catch (err) {
      console.warn(`[ipc] session:terminate pid=${pid} 失败: ${(err as Error).message}`)
      return false
    }
  })

  // ─── 审批 ───

  /**
   * 响应审批（§5.3）：queue.respond 成功后**补发 approval:resolved push**，
   * 使所有订阅视图收敛（HTTP /respond 路由自带同语义 push，IPC 路径在此补齐）。
   * 落库与托盘色复位由 POST /approve 的 await 恢复处统一处理（见文件头不变量）。
   */
  ipcMain.handle('approval:respond', (_event, payload: ApprovalResponse) => {
    if (
      !isPlainObject(payload) ||
      typeof payload['id'] !== 'string' ||
      typeof payload['allowed'] !== 'boolean'
    ) {
      return false
    }
    const { id, allowed } = payload
    const ok = approvalQueue.respond(id, allowed)
    if (ok) {
      const win = managedWindow.win
      if (!win.isDestroyed()) {
        win.webContents.send('approval:resolved', { id, allowed })
      }
    }
    return ok
  })

  // ─── 窗口控制子集（M4 建立，TrafficLights.tsx 调用） ───

  ipcMain.handle('window:hide', () => {
    const win = managedWindow.win
    if (!win.isDestroyed()) win.hide()
  })

  ipcMain.handle('window:minimize', () => {
    const win = managedWindow.win
    if (!win.isDestroyed()) win.minimize()
  })

  ipcMain.handle('window:toggle-maximize', () => {
    const win = managedWindow.win
    if (!win.isDestroyed()) {
      if (win.isMaximized()) {
        win.unmaximize()
      } else {
        win.maximize()
      }
    }
  })

  /**
   * 查询当前置顶状态（M10 Settings "Always on Top" 复选框初始勾选）。
   * 返回 window.ts 的 pin 状态——togglePin 是 alwaysOnTop 的唯一切换点，
   * 与 WidgetHeader 📌 按钮共享同一状态，设置页打开时据此反映窗口真实置顶态。
   */
  ipcMain.handle('window:get-always-on-top', () => managedWindow.isPinned())
}
