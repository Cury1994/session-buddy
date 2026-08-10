import { app, ipcMain } from 'electron'

import { loadConfig, saveConfig } from './config'
import { isAutoApproveOn, setAutoApprove } from './server'

import type { ApprovalQueue } from './approval-queue'
import type { ClaudeCodeSessionScanner } from './claude-sessions'
import type { AppDatabase } from './db'
import type { SessionDetailScanner } from './session-detail'
import type { ManagedTray } from './tray'
import type { ManagedWindow } from './window'
import type { DeepPartial } from './config'
import type { AppConfig, ApprovalResponse, SessionDetail, UsageCard } from '../shared/types'

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
 *   invoke: usage:get / usage:history / sessions:get / sessions:detail（M16 B1）/
 *           config:get / config:save / app:refresh / app:quit /
 *           approval:respond /
 *           approval:get（P1-3 挂载补拉 seed）/ app:toggle-pin /
 *           approval:set-auto-approve / approval:get-auto-approve（F3 自动审批开关，M17.1 每会话独立）
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
  /** M16 B1：会话细节增量扫描器（sessions:detail 数据源；scanner 每轮 discoverSessions 已喂 scan） */
  detailScanner: SessionDetailScanner
  approvalQueue: ApprovalQueue
  /** 当前未被 handler 直接使用（颜色 push 在 tray.ts 内部完成），保留供后续模块扩展 */
  tray: ManagedTray
  window: ManagedWindow
  /** app:refresh → 手动触发一轮 usageChecker + sessionScanner（services 暴露的 tick） */
  triggerRefresh: () => Promise<void>
  /**
   * usage:get → 调度器缓存的最新 UsageCard[]（M13.5：startUsageChecker 每轮刷新，
   * services.getCachedUsageCards；index.ts 注入）。buildUsageCards 是 async（readQuota
   * 异步），IPC handle 不直接触发查询，只读缓存——首轮 tick 完成前返回 []。
   */
  getUsageCards: () => UsageCard[]
  /**
   * config:save 成功后按新配置重调度双定时器（index.ts 实现并注入）：
   * stop 旧 usageChecker/sessionScanner → 重新 loadConfig → 按新 config 重启。
   * 使 usage_poll_interval_min / refresh_interval_sec / usage_sources.warn_threshold /
   * notifications.enabled 变更即时生效（M10，M13.5 泛化）。
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

  /**
   * 最新用量卡（M13.5 起返回 UsageCard[]，取代 M8 的 db.getLatestUsage()）。
   * 读调度器缓存（每轮 usageChecker tick 刷新），不在 IPC 内触发异步余量查询。
   * 渲染端 M13.6 消费多卡；旧渲染端（M8 useUsageData）期望 UsageRecord[]，
   * 运行时形态变化由 M13.6 同步改（本模块只保证主进程编译通过）。
   */
  ipcMain.handle('usage:get', () => deps.getUsageCards())

  /**
   * 30 天余额走势（db.get30DayBalance，供 TrendSparkline，§6.11 v2.3 补入）。
   * M13.5：接受 sourceId 参数逐卡取趋势（provider=source.id, model='all'）；
   * 入参缺失/非串回退 'deepseek'（旧渲染端无参调用的过渡兼容，M13.6 起逐卡传参）。
   */
  ipcMain.handle('usage:history', (_event, sourceId?: unknown) => {
    const id = typeof sourceId === 'string' && sourceId !== '' ? sourceId : 'deepseek'
    return db.get30DayBalance(id, 'all')
  })

  // ─── Sessions / 审批历史 ───

  /** 活跃 session（scanner 缓存的同步读取，§5.2） */
  ipcMain.handle('sessions:get', () => scanner.getSessions())

  /**
   * 会话展开详情（M16 B1，F2 任务清单 / F3 子 Agent；M17.1 起无 messages 尾流）：
   * 只读 detailScanner 增量缓存（scanner 每轮 discoverSessions 已对每个活跃会话喂 scan，
   * 本 handler 不触发任何文件 IO）。入参 sessionId 非 string/空 → 空载荷。
   */
  ipcMain.handle('sessions:detail', (_event, sessionId: unknown): SessionDetail => {
    if (typeof sessionId !== 'string' || sessionId === '') {
      return { tasks: [], agents: [], messages: [] }
    }
    return deps.detailScanner.getDetail(sessionId)
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

  /** 手动刷新一轮（多卡余量查询 + session 扫描，FR-1.5） */
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

  // ─── 审批 ───

  /**
   * 当前待审批列表（P1-3 整改，§6.6 getAll）：渲染端 useSessionsData 挂载时与
   * sessions:get 一并 seed，覆盖「离标签页 / 启动前到达的审批在 widget 内不可见」
   * 缺陷。App.tsx key={activeView} 切回 Sessions 即重挂载 → 重新 seed，天然覆盖
   * 「离标签页期间到达」+「启动前已 pending」两种情形。只读队列快照，不落库不改队列。
   */
  ipcMain.handle('approval:get', () => approvalQueue.getAll())

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

  /**
   * 设置某会话的自动审批开关（F3，M17.1 每会话独立 / 重启复位 / 两步确认在渲染端）：
   * 薄封装委托 server.ts 模块级会话键集合（仅按 sessionId 建键，approve.sh 的
   * payload.session 即 .session_id）。入参非 string 按空串归一（忽略），v 非 boolean 一律按 false 归一。
   * 开启后该会话的 POST /approve 立即放行（复用唯一落库点记 allowed=1，不入队/不通知/不置橙）。
   */
  ipcMain.handle(
    'approval:set-auto-approve',
    (_event, sessionId: unknown, v: unknown) => {
      setAutoApprove(
        typeof sessionId === 'string' ? sessionId : '',
        v === true
      )
    }
  )

  /**
   * 读取某会话的自动审批开关（F3，M17.1）：渲染端 SessionCard 挂载播种真源，
   * 避免切走重挂载后与主进程集合失配。按 sessionId 命中。
   */
  ipcMain.handle('approval:get-auto-approve', (_event, sessionId: unknown) => {
    return isAutoApproveOn(typeof sessionId === 'string' ? sessionId : '')
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
