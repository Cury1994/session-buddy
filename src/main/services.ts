import { detectCalled } from './detectors'
import { notifyUsageLow } from './notifications'
import { readQuota } from './quota-reader'
import { computeGlobalWarnThreshold, computeTrayColor } from './server'
import { matchVendor } from './vendor-registry'
import { urlHost } from './cc-switch-usage'

import type { BrowserWindow } from 'electron'
import type { ApprovalQueue } from './approval-queue'
import type { ClaudeCodeSessionScanner } from './claude-sessions'
import type { AppDatabase } from './db'
import type { ManagedTray } from './tray'
import type { AppConfig, UsageCard, UsageSourceConfig } from '../shared/types'

/**
 * M6 → M13.5 — 定时调度胶水层（DESIGN §6.9 / §5.1 / §5.2）
 *
 * 双定时器：
 *   usageChecker   — 立即一次 + usage_poll_interval_min 分钟（默认 1）。M13.5 起泛化为
 *                    多卡余量轮询（quota-reader + detectors），取代 M6 的 DeepSeek 单卡
 *                    balanceChecker（deepseek.ts 已删）。
 *   sessionScanner — 立即一次 + refresh_interval_sec 秒（默认 3）
 * 各返回 `{stop()}` 清理 setInterval（index.ts 在 will-quit 先于 server.stop / db.close 调用）。
 *
 * 颜色联动（余额侧）：复用 server.ts 导出的 `computeTrayColor`（颜色优先级协议
 * 红>橙>绿 的唯一实现，见 server.ts 文件头协议注释），本模块**不自写颜色逻辑**，
 * 只把协议输出落到 `tray.setIconColor`。阈值传**全局最低告警线**
 * （computeGlobalWarnThreshold：min 所有 usage_source.warn_threshold），多卡下任一卡
 * 低于全局最低线触发红。余额恢复后的绿/橙判定、余额告警的红判定，全部由
 * computeTrayColor(approvalQueue.size, db.getLatestUsage(), threshold) 收敛，
 * 与审批侧（server.ts 内部 refreshTrayColor）走同一函数，两条链路收敛到同一优先级。
 *
 * NFR-3：定时器回调整体 try/catch + warn，单次失败不中断后续轮询。
 */

export interface UsageCheckerDeps {
  db: AppDatabase
  approvalQueue: ApprovalQueue // computeTrayColor 需要 queue size（红>橙判定）
  config: AppConfig
  win: BrowserWindow
  tray: ManagedTray
}

export interface SessionScannerDeps {
  scanner: ClaudeCodeSessionScanner
  approvalQueue: ApprovalQueue
  db: AppDatabase // refreshTrayColor 需要最新余额快照
  config: AppConfig
  win: BrowserWindow
  tray: ManagedTray
}

export interface ScheduledTask {
  stop(): void
  /** 手动触发一轮（M7 app:refresh IPC 委托，§6.11）：与定时回调同一 tick 闭包 */
  tick(): Promise<void>
}

function sendToRenderer(win: BrowserWindow, channel: string, payload: unknown): void {
  if (!win.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

// ─── 模块级卡片缓存（ipc usage:get 经 index.ts 注入读取） ───

/** 调度器最近一轮构建的 UsageCard[]；首轮 tick 完成前为 [] */
let latestUsageCardsCache: UsageCard[] = []

/** 读取调度器缓存的最新用量卡（index.ts 注入 ipc-handlers 的 getUsageCards） */
export function getCachedUsageCards(): UsageCard[] {
  return latestUsageCardsCache
}

// ─── 卡片构建（buildUsageCards / buildSourceCard，导出供测试与 tick 共用） ───

/**
 * http-json bearer 凭证的环境变量名推断（与 quota-reader.ts fetchRemainingViaHttp 同一规则）：
 * key_env 有值用 key_env，否则 `{ID 大写}_API_KEY`（deepseek → DEEPSEEK_API_KEY）。
 */
function bearerEnvName(source: { id: string; auth: { key_env?: string } }): string {
  return source.auth.key_env && source.auth.key_env.length > 0
    ? source.auth.key_env
    : `${source.id.toUpperCase()}_API_KEY`
}

/**
 * 单个 usage_source → 一张 UsageCard（并在 ok 时落库）。
 * 状态判定顺序（任务书约定）：
 *   ① subscription 且 url 空 → missing-config（订阅端点未配置占位）
 *   ② http-json bearer 且凭证 env 为空 → missing-credential（hint 指出缺哪个 env）
 *   ③ bss 且缺任一 AccessKey env → missing-credential（hint 列出缺的 env）
 *   ④ 其余走 readQuota：QuotaInfo → ok（remaining/unit/currency/updatedAt/warnThreshold）；
 *      null → error（网络/解析失败，NFR-3 保留上次展示）
 * ok 卡顺带 recordUsage 落库（provider=source.id, model='all', billing/unit 六参，M13.4），
 * 使 db.getLatestUsage()（托盘色判定 / /api/usage）与 get30DayBalance（usage:history）有数据。
 */
async function buildSourceCard(db: AppDatabase, source: UsageSourceConfig): Promise<UsageCard> {
  const base = { sourceId: source.id, name: source.name, billing: source.billing }

  if (source.kind === 'subscription' && source.url.trim() === '') {
    return { ...base, status: 'missing-config', missingHint: '未配置订阅端点' }
  }

  if (source.kind === 'http-json' && source.auth.type === 'bearer') {
    const envName = bearerEnvName(source)
    if (!process.env[envName]) {
      return { ...base, status: 'missing-credential', missingHint: `缺少环境变量 ${envName}` }
    }
  }

  if (source.kind === 'bss') {
    const missing = [source.access_key_id_env, source.access_key_secret_env].filter(
      (envName) => !process.env[envName]
    )
    if (missing.length > 0) {
      return { ...base, status: 'missing-credential', missingHint: `缺少 ${missing.join(' / ')}` }
    }
  }

  const quota = await readQuota(source)
  if (quota === null) {
    return { ...base, status: 'error' }
  }

  // 落库：currency 缺省取 unit（订阅 token 类源无 currency 概念）
  db.recordUsage(source.id, 'all', quota.remaining, quota.currency ?? quota.unit, source.billing, quota.unit)

  const card: UsageCard = {
    ...base,
    status: 'ok',
    remaining: quota.remaining,
    unit: quota.unit,
    updatedAt: quota.updatedAt
  }
  if (quota.currency !== undefined) card.currency = quota.currency
  // bss 源类型上无 warn_threshold 字段（按量现金余额，告警线意义弱），不参与
  if (source.kind !== 'bss' && source.warn_threshold !== undefined) {
    card.warnThreshold = source.warn_threshold
  }
  return card
}

/**
 * 构建本轮全部用量卡（导出供测试；tick 每轮调用一次）：
 *   1. usage_sources 顺序逐个 buildSourceCard（配置声明序 = 展示序）
 *   2. matchedIds = 所有 source 的 id + detect_ids + url host（M15：有 url 的 source
 *      自动按 url host 匹配检测结果，无需手配 detect_ids=[host]）
 *   3. detectCalled 中未被吸收的项 → registry fallback：命中内置厂商模板（如 DeepSeek）
 *      则用模板生成 source 走 buildSourceCard 出余量卡（零配置）；未命中 → 槽位卡
 *      （status=missing-config，引导补配置；billing 记 'payg'，带 cc-switch 证据的 calls）
 * ok 卡在 buildSourceCard 内落库（见该函数注释）。NFR-3：单个畸形 source 只降级
 * 该卡为 error，不中断整轮构建。
 */
export async function buildUsageCards(db: AppDatabase, config: AppConfig): Promise<UsageCard[]> {
  const sources = config.usage_sources ?? []
  const detected = detectCalled(config)

  const cards: UsageCard[] = []
  const matchedIds = new Set<string>()

  for (const source of sources) {
    // 畸形配置防御（用户手改 yaml）：无 id 的 source 跳过，不让整轮构建失败
    if (!source || typeof source.id !== 'string' || source.id === '') continue
    matchedIds.add(source.id)
    for (const detectId of source.detect_ids ?? []) matchedIds.add(detectId)
    // M15 url host 匹配：有 url 的 source（http-json / url 非空 subscription）按 host 吸收检测结果
    if ('url' in source && typeof source.url === 'string' && source.url.trim() !== '') {
      matchedIds.add(urlHost(source.url))
    }

    try {
      cards.push(await buildSourceCard(db, source))
    } catch (err) {
      console.warn(`[services] buildSourceCard ${source.id} 失败: ${(err as Error).message}`)
      cards.push({ sourceId: source.id, name: source.name, billing: source.billing, status: 'error' })
    }
  }

  // 检测到了但未被任何 usage_source 吸收 → registry fallback / 槽位卡（追加在配置声明卡之后）
  for (const called of detected) {
    if (matchedIds.has(called.id)) continue

    // M15 零配置：命中内置厂商模板（host 精确匹配）→ 用模板生成 source 走正常余量查询
    const templated = matchVendor(called.id)
    if (templated) {
      matchedIds.add(called.id)
      matchedIds.add(templated.id)
      try {
        cards.push(await buildSourceCard(db, templated))
      } catch (err) {
        console.warn(`[services] registry 厂商 ${called.id} buildSourceCard 失败: ${(err as Error).message}`)
        cards.push({
          sourceId: templated.id,
          name: templated.name,
          billing: templated.billing,
          status: 'error'
        })
      }
      continue
    }

    const slot: UsageCard = {
      sourceId: called.id,
      name: called.name,
      billing: 'payg',
      status: 'missing-config'
    }
    if (called.calls !== undefined) slot.calls = called.calls
    cards.push(slot)
  }

  return cards
}

// ─── 调度器 ───

/**
 * 多卡余量轮询（M13.5，取代 M6 startBalanceChecker）。每轮：
 * buildUsageCards（ok 卡落库）→ 缓存刷新 → push usage:updated（UsageCard[]）→
 * per-card 低余量告警（各自 warn_threshold，独立去抖、恢复后重置）→ 按协议刷新托盘色。
 */
export function startUsageChecker(deps: UsageCheckerDeps): ScheduledTask {
  const { db, approvalQueue, config, win, tray } = deps
  const intervalMin = Math.max(1, config.usage_poll_interval_min)
  const intervalMs = intervalMin * 60 * 1000
  // 全局最低告警线（托盘色用）：min 所有 usage_source.warn_threshold，缺省 Infinity
  const globalWarnThreshold = computeGlobalWarnThreshold(config.usage_sources ?? [])

  // per-card 低余量去抖（按 sourceId）：避免每轮重复弹通知；余量恢复后重置，再跌破可再弹。
  // 卡转入非 ok 态（error/missing-*）时不动集合——未恢复不重置，转回 ok 且仍低不重复告警。
  const lowNotified = new Set<string>()

  async function tick(): Promise<void> {
    try {
      const cards = await buildUsageCards(db, config)
      latestUsageCardsCache = cards
      sendToRenderer(win, 'usage:updated', cards)

      // 低余量告警（per-card）：仅 ok 卡且配置了 warn_threshold 者参与
      for (const card of cards) {
        if (card.status !== 'ok' || card.remaining === undefined || card.warnThreshold === undefined) {
          continue
        }
        const isLow = card.remaining < card.warnThreshold
        if (isLow && !lowNotified.has(card.sourceId)) {
          notifyUsageLow(card)
          lowNotified.add(card.sourceId)
        } else if (!isLow && lowNotified.has(card.sourceId)) {
          lowNotified.delete(card.sourceId) // 恢复后重置，再次跌破可再弹
        }
      }

      // 颜色优先级协议（红>橙>绿）：余额告警→红由 computeTrayColor 判定。
      // 审查 P3-5 沿用：本轮只取一次最新余额快照供托盘色判定。
      const latest = db.getLatestUsage()
      tray.setIconColor(computeTrayColor(approvalQueue.size, latest, globalWarnThreshold))
    } catch (err) {
      console.warn(`[services] usageChecker tick 失败: ${(err as Error).message}`)
    }
  }

  void tick() // 立即执行一次
  const timer = setInterval(() => {
    void tick()
  }, intervalMs)

  return {
    stop(): void {
      clearInterval(timer)
    },
    tick: () => tick()
  }
}

/**
 * Session 扫描。每轮：discoverSessions（内部刷新 scanner 缓存）→
 * 更新托盘菜单快照 → push sessions:updated → 按协议刷新托盘色（存活 session
 * 变化可能影响颜色判定边界，调一次无副作用）。
 */
export function startSessionScanner(deps: SessionScannerDeps): ScheduledTask {
  const { scanner, approvalQueue, db, config, win, tray } = deps
  const intervalSec = Math.max(1, config.harnesses['claude-code'].refresh_interval_sec)
  const intervalMs = intervalSec * 1000
  // M13.5：与 usageChecker 同一全局最低告警线（否则两条链路阈值不一致会互相闪烁覆盖）
  const globalWarnThreshold = computeGlobalWarnThreshold(config.usage_sources ?? [])

  async function tick(): Promise<void> {
    try {
      const sessions = await scanner.discoverSessions()
      tray.setSessionSnapshot(
        sessions.map((s) => ({
          name: s.name,
          status: s.status,
          hasPendingApproval: s.hasPendingApproval,
          recentlyActive: s.recentlyActive,
          tool: s.tool,
          apiProvider: s.apiProvider
        }))
      )
      sendToRenderer(win, 'sessions:updated', sessions)
      tray.setIconColor(computeTrayColor(approvalQueue.size, db.getLatestUsage(), globalWarnThreshold))
    } catch (err) {
      console.warn(`[services] sessionScanner tick 失败: ${(err as Error).message}`)
    }
  }

  void tick() // 立即执行一次
  const timer = setInterval(() => {
    void tick()
  }, intervalMs)

  return {
    stop(): void {
      clearInterval(timer)
    },
    tick: () => tick()
  }
}
