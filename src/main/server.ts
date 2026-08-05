import { app, Notification } from 'electron'
import express from 'express'

import { notifyApproval } from './notifications'
import { buildCommandSummary, mirrorFilter } from './permission-mirror'

import type { Server } from 'node:http'
import type { BrowserWindow } from 'electron'
import type { ApprovalQueue } from './approval-queue'
import type { AppDatabase } from './db'
import type { ManagedTray, TrayIconColor } from './tray'
import type {
  AppConfig,
  ApprovalPayload,
  PendingApproval,
  SessionInfo,
  UsageRecord
} from '../shared/types'

/**
 * M5 — HTTP API + 审批联动（DESIGN §6.5 / §5.3 / §6.3）
 *
 * 六路由（§6.5）：
 *   GET  /health              → {"status":"ok"}
 *   GET  /api/usage           → db.getLatestUsage()
 *   GET  /api/sessions        → getSessions()（M6 scanner 注入口，缺省 []）
 *   GET  /api/approvals       → approvalQueue.getAll()
 *   POST /approve             → 阻塞式审批（enqueue → 橙 + 通知 → await → {id, allowed}）
 *   POST /approve/:id/respond → 解析审批（respond → recordApproval → 复位 tray）
 *
 * ─── 颜色优先级协议（本模块定义，M6 余额侧共同遵循，见 DESIGN §6.3）───
 *   优先级从高到低：**红（余额 < balance_warn_threshold）> 橙（待审批）> 绿（空闲）**
 *   灰仅用于 server 未启动 / 致命错误，不参与 computeTrayColor。
 *   统一由 computeTrayColor() 计算、refreshTrayColor() 落盘到 tray，避免各处
 *   无脑 setIconColor('green') 覆盖掉活跃的红/橙状态：
 *     - 有任一 provider 最新余额 < 阈值 → 红（即使队列非空也红，红 > 橙）
 *     - 否则队列非空 → 橙
 *     - 否则 → 绿
 *   M6 余额侧：checkBalance 后同样调用本协议（余额恢复且队列空 → 绿；队列非空 → 橙；
 *   余额告警 → 红 + notifyBalanceLow），保证两条联动链路收敛到同一优先级。
 */

/**
 * 自动审批全局开关（F3）：会话级、重启复位、两步确认（确认在渲染端 SessionsView）。
 *   主进程仅持有 boolean flag，由 IPC approval:set-auto-approve / get-auto-approve 读写。
 *   开启时 POST /approve 立即放行（复用唯一落库点记 allowed=1，不入队/不通知/不置橙/不 push）。
 *   模块级 flag 不持久化 —— 进程重启后天然复位为 false（用户选定的安全默认）。
 *   注意：渲染端 SessionsView 切走重挂载（App.tsx key={activeView}）会复位前端 state，
 *   但主进程 flag 不随之复位；SessionsView 挂载时经 getAutoApprove() 播种以对齐真源。
 */
let autoApprove = false

/** 设置自动审批开关（IPC approval:set-auto-approve 委托） */
export function setAutoApprove(v: boolean): void {
  autoApprove = v
}

/** 读取自动审批开关（IPC approval:get-auto-approve 委托；渲染端挂载播种真源） */
export function getAutoApprove(): boolean {
  return autoApprove
}

/**
 * 按颜色优先级协议计算托盘色（纯函数，便于 M6 复用 / 单测）。
 * @param queueSize      当前待审批数量
 * @param latestUsage    db.getLatestUsage() 的最新余额快照
 * @param warnThreshold  config.providers.deepseek.balance_warn_threshold（¥ 绝对金额）
 */
export function computeTrayColor(
  queueSize: number,
  latestUsage: UsageRecord[],
  warnThreshold: number
): TrayIconColor {
  // 优先级 0：余额告警 → 红（高于橙，即使有待审批）
  if (latestUsage.some((u) => u.balance < warnThreshold)) return 'red'
  // 优先级 1：待审批 → 橙
  if (queueSize > 0) return 'amber'
  // 优先级 2：空闲 → 绿
  return 'green'
}

/** createServer 的依赖注入包（getSessions 为 M6 scanner 注入口） */
export interface ServerDeps {
  db: AppDatabase
  approvalQueue: ApprovalQueue
  tray: ManagedTray
  win: BrowserWindow
  config: AppConfig
  /** M6 session scanner 注入；缺省返回 []（M5 阶段无 scanner） */
  getSessions?: () => SessionInfo[] | Promise<SessionInfo[]>
}

/** createServer 的受控返回值 */
export interface ManagedServer {
  start(port: number): void
  stop(): void
}

export function createServer(deps: ServerDeps): ManagedServer {
  const { db, approvalQueue, tray, win, config } = deps
  const getSessions = deps.getSessions ?? ((): SessionInfo[] => [])
  const warnThreshold = config.providers.deepseek.balance_warn_threshold

  const expressApp = express()
  expressApp.use(express.json())

  let server: Server | null = null

  /** 向渲染端 push（M7 前的通道先接上，渲染端尚无监听也无妨） */
  function sendToRenderer(channel: string, payload: unknown): void {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }

  /** 按颜色优先级协议刷新托盘色（红 > 橙 > 绿，见文件头协议注释） */
  function refreshTrayColor(): void {
    tray.setIconColor(computeTrayColor(approvalQueue.size, db.getLatestUsage(), warnThreshold))
  }

  // ─── 路由 ───

  expressApp.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  expressApp.get('/api/usage', (_req, res) => {
    res.json(db.getLatestUsage())
  })

  expressApp.get('/api/sessions', async (_req, res) => {
    try {
      res.json(await getSessions())
    } catch (err) {
      console.warn(`[server] /api/sessions 失败: ${(err as Error).message}`)
      res.json([])
    }
  })

  expressApp.get('/api/approvals', (_req, res) => {
    res.json(approvalQueue.getAll())
  })

  /**
   * POST /approve — 阻塞式审批入口（§5.3）。
   * approve.sh / curl 挂起等待，直到 respond 或超时（queue 内部 setTimeout 兜底）。
   */
  expressApp.post('/approve', async (req, res) => {
    const body = (req.body ?? {}) as Partial<ApprovalPayload>
    // toolInput：hook 原始 tool_input 对象（approve.sh 经 --argjson 透传）；非纯对象/缺失 → {}
    const toolInput: Record<string, unknown> =
      typeof body.toolInput === 'object' &&
      body.toolInput !== null &&
      !Array.isArray(body.toolInput)
        ? body.toolInput
        : {}
    const tool = typeof body.tool === 'string' && body.tool !== '' ? body.tool : 'Bash'
    const cwd = typeof body.cwd === 'string' ? body.cwd : ''
    const permissionMode = typeof body.permissionMode === 'string' ? body.permissionMode : ''
    const payload: ApprovalPayload = {
      harness: typeof body.harness === 'string' ? body.harness : 'unknown',
      session: typeof body.session === 'string' ? body.session : 'unknown',
      // command 单一真源：server 从 toolInput 按工具构建（§6.5 前置管线），修复旧版 approve.sh
      // 读 .tool_use.input（实际发 tool_input）导致的审批卡空内容 bug。
      command: buildCommandSummary(tool, toolInput),
      cwd,
      tool,
      description: typeof body.description === 'string' ? body.description : '',
      toolInput,
      permissionMode
    }

    // 镜像过滤前置（§5.3 / §6.14，2026-08-03 审批镜像轮）：判定"终端此刻会不会弹原生询问"。
    //   passthrough（不会弹）→ 立即返回 {"action":"passthrough"}：
    //     不入队 / 不落库（不变量 A）/ 不通知 / 不置橙 / 不 push —— 工具完全静默，
    //     终端原生权限流接管（allow 规则静默执行 / deny 规则原生拦截）。
    //   ask（会弹）→ 进入 F3 早退检查 → 入队阻塞审批。
    if (mirrorFilter(tool, toolInput, cwd, permissionMode) === 'passthrough') {
      res.json({ action: 'passthrough' })
      return
    }

    // 自动审批（F3）：会话级全局开关开启时立即放行。
    //   复用唯一落库点记一条 allowed=1 历史（不变量 A：recordApproval 唯一落库）；
    //   不入队 / 不通知 / 不置橙 / 不 push —— 渲染端从没有这张卡（无需淡出），托盘不闪橙。
    //   approve.sh 阻塞的 curl 直接收到 allowed:true 放行。
    if (getAutoApprove()) {
      db.recordApproval(payload.harness, payload.session, payload.command, payload.cwd, payload.tool, true)
      res.json({ id: '', allowed: true })
      return
    }

    const { id, promise } = approvalQueue.enqueue(payload)
    // push 给渲染端的负载（§5.3 approval:pending）：payload + 运行时字段
    const pending: PendingApproval = {
      ...payload,
      id,
      createdAt: Date.now(),
      timeoutSec: config.notifications.approve_timeout_sec
    }

    // 审批侧联动：桌面通知 + 托盘置橙（refreshTrayColor 在余额正常时置橙；
    // 若余额告警活跃则保持红 —— 红 > 橙，见文件头协议）
    notifyApproval(payload)
    refreshTrayColor()
    sendToRenderer('approval:pending', pending)

    // 阻塞等待：超时由 queue 内部兜底 auto-deny，这里直接 await promise 即可
    const allowed = await promise

    // 审批历史入库（唯一落库点，覆盖 respond 与超时 auto-deny 两条路径）。
    // §5.3 将 recordApproval 画在 respond 分支，但超时 auto-deny 不经过 respond，
    // 若只在 respond 落库会漏记超时记录（M5/M11 验收要求超时也写历史 allowed=0）。
    // 故统一在 await 恢复后落库：promise 仅解析一次 → 每条审批恰好一条历史，无重复。
    db.recordApproval(payload.harness, payload.session, payload.command, payload.cwd, payload.tool, allowed)

    // 审批结束（respond 或超时）后按协议复位托盘色。
    // 超时路径不会经过 /respond，必须在此复位，否则托盘滞留橙色。
    refreshTrayColor()

    // approval:resolved push（P1-2 整改）：补发以覆盖**超时 auto-deny 路径**。
    // 超时不经过 /respond 路由，原先只有 respond 路径 push → 渲染端卡片 zombie +
    // badge 永久卡住。此处统一在 await 恢复后补发，与 /respond 路由 / approval:respond
    // IPC 既有的同语义 push 重复也幂等无害（渲染端 useSessionsData 对同 id 标记
    // fading 幂等；badge 计数 Math.max(0, c-1) 有下限）。
    sendToRenderer('approval:resolved', { id, allowed })

    res.json({ id, allowed })
  })

  /**
   * POST /approve/:id/respond — 解析指定审批（§5.3）。
   * body {allowed:boolean} → respond → push approval:resolved → 复位 tray。
   * 历史入库在 POST /approve 的 await 恢复处统一处理（见该 handler 注释）。
   */
  expressApp.post('/approve/:id/respond', (req, res) => {
    const id = req.params['id']
    const body = (req.body ?? {}) as { allowed?: unknown }
    const allowed = body.allowed === true

    const ok = id !== undefined && approvalQueue.respond(id, allowed)
    if (!ok) {
      res.status(404).json({ ok: false, error: 'approval not found or already resolved' })
      return
    }

    sendToRenderer('approval:resolved', { id, allowed })

    // 队列空时按颜色优先级协议复位（而非无脑置绿）。
    // 注：审批历史入库统一在 POST /approve 的 await 恢复处（唯一落库点，
    // 同时覆盖超时 auto-deny），此处不重复 recordApproval。
    refreshTrayColor()

    res.json({ ok: true })
  })

  // ─── 错误中间件（必须在所有路由之后注册）───
  // express.json()（body-parser）解析非法 JSON 时会抛错，默认错误页回传含绝对路径 +
  // 调用栈的 HTML（审查 P2-1）。统一兜底为 JSON 400，仅 warn 一行 err.message，
  // 不回传栈 / 路径。
  expressApp.use(
    (
      err: Error & { status?: number },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (res.headersSent) {
        next(err)
        return
      }
      console.warn(`[server] 请求错误: ${err.message}`)
      res.status(err.status || 400).json({ ok: false, error: 'bad request' })
    }
  )

  // ─── 生命周期 ───

  /**
   * EADDRINUSE 处理（v2.3 简化，§6.5）：
   *   1. 探测 http://127.0.0.1:{port}/health（2s 超时）→ {"status":"ok"}
   *      视为本应用旧实例（单实例锁失效的极端情况）→ 记日志 + exit(0)
   *   2. 否则 → 日志 + 桌面通知"端口被占用" → exit(1)
   *   不做端口重试、不写端口文件（approve.sh 直连固定端口）。
   */
  async function handlePortInUse(port: number): Promise<void> {
    let isOldInstance = false
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(2000)
      })
      if (resp.ok) {
        const data = (await resp.json()) as { status?: string }
        isOldInstance = data.status === 'ok'
      }
    } catch {
      isOldInstance = false
    }

    if (isOldInstance) {
      console.log(`[server] 端口 ${port} 已被本应用旧实例占用（/health 正常），本进程正常退出`)
      // 走 app.quit() → will-quit 清理链（db.close / tray.destroy / server.stop），
      // 而非 app.exit() 绕过清理（审查 P3-4）。保留退出码 0。
      process.exitCode = 0
      app.quit()
      return
    }

    const msg = `端口 ${port} 被占用，请关闭占用程序后重启`
    console.error(`[server] ${msg}`)
    if (Notification.isSupported()) {
      new Notification({ title: 'Harness Monitor', body: msg }).show()
    }
    // 给桌面通知一点显示时间再退出（日志已即时输出）。退出码 1 + 走清理链。
    setTimeout(() => {
      process.exitCode = 1
      app.quit()
    }, 1500)
  }

  return {
    start(port: number): void {
      server = expressApp.listen(port, config.server.host, () => {
        console.log(`[server] listening on http://${config.server.host}:${port}`)
      })
      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          void handlePortInUse(port)
        } else {
          console.error(`[server] 启动失败: ${err.message}`)
          process.exitCode = 1
          app.quit()
        }
      })
    },

    stop(): void {
      if (server) {
        server.close()
        server = null
      }
    }
  }
}
