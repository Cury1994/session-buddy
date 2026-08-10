import { useEffect, useRef, useState } from 'react'

import type {
  AppConfig,
  ContextEntry,
  ContextSource,
  ContextUnit,
  DeepPartial
} from '../../../shared/types'

/**
 * M10 + M17.1 — 设置视图（DESIGN §4 / TASKS §11 + M17.1）
 * M17.2 — 上下文长度表：整表折叠（默认展开）+ M/K 单位选择 + registry 行只读
 *
 * 三块 + 退出按钮，内联于 Settings 分段（非 modal）：
 *   ├── 模型上下文长度（M17.1）context_lengths 表（模型名 + 来源标签 + 可编辑长度）
 *   ├── General        Always on Top（app:toggle-pin，不持久化）/ Desktop Notifications
 *   ├── Limits & Alerts Balance Warning ¥ / 审批超时 60s 仅展示 / 查询间隔分钟
 *   └── [Quit SessionBuddy] 红色全宽按钮
 *
 * 模型上下文长度（M17.1 + M17.2 契约，AppConfig.context_lengths）：
 *   - 每行：模型名 + 来源标签（manual/registry/heuristic 三色徽章）+ 单位选择 + 长度输入
 *   - **registry 行只读**（100% 把握、无需用户确认的厂商默认值，不支持编辑）
 *   - manual/heuristic 行可编辑：失焦 / 回车提交；支持切换单位 M / K（value 换算展示，
 *     len 恒存原始 token 数）；编辑即强制 source='manual'，自动更新不再覆盖
 *   - 空态：尚无记录（成功调用 API 后由后端自动写入）
 *   - 整表折叠/展开 toggle（默认展开），复用 chevron 样式
 *
 * 保存语义（主对话决策 4）：修改即经 saveConfig 落盘。checkbox 变更即存；number 输入
 * **失焦 / 回车提交**。行内反馈：resolve → "已保存 ✓"（绿，2s 淡出）；reject →
 * "保存失败：<msg>"（红，保留到下次操作）。无 toast/modal 库。
 */

/** 行内保存反馈：ok=绿 2s 淡出；err=红保留到下次操作 */
type Feedback = { kind: 'ok' | 'err'; msg: string }

/** 设置行：左标签 + 右控件，原型 flex space-between / 12px */
function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between text-xs mb-3 last:mb-0">
      <span>{label}</span>
      {children}
    </div>
  )
}

/**
 * M17.1 来源标签 → 修饰类名。必须**字面引用**而非模板拼接：Tailwind 3.4 内容扫描
 * 只保留源码中字面出现的类名（与 UsageCardCard BILLING_BADGE_CLASS 同一约束）。
 * 与 .ctx-source-tag 组合成复合选择器（globals.css M17.1 段）。
 */
const SOURCE_TAG_CLASS: Record<ContextSource, string> = {
  manual: 'manual',
  registry: 'registry',
  heuristic: 'heuristic'
}

/** 来源标签展示名（对齐原型 prototype-ctx-settings-v1.html .src 变体） */
const SOURCE_LABEL: Record<ContextSource, string> = {
  manual: '手动',
  registry: '厂商默认',
  heuristic: '启发式'
}

// ── M17.2 长度单位（K=千 / M=百万）换算与展示 ──

/** 默认单位：len ≥ 1_000_000 → M，否则 K（registry 行与未选单位行的展示推导） */
function defaultUnit(len: number): ContextUnit {
  return len >= 1_000_000 ? 'M' : 'K'
}

/** len + 单位 → 该单位下的数值（1_000_000 + M → 1；200_000 + K → 200） */
function lenInUnit(len: number, unit: ContextUnit): number {
  return unit === 'M' ? len / 1_000_000 : len / 1_000
}

/** 单位下数值 + 单位 → 原始 token 数（1 + M → 1_000_000；200 + K → 200_000） */
function lenFromUnit(value: number, unit: ContextUnit): number {
  return Math.round(unit === 'M' ? value * 1_000_000 : value * 1_000)
}

/** 展示文本：数值（去除多余小数）+ 单位后缀（如 "1M" / "200K"），M17.2 应需求带单位 */
function formatLen(len: number, unit: ContextUnit): string {
  const n = lenInUnit(len, unit)
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
  return `${s}${unit}`
}

interface SettingsViewProps {
  /** 置顶态真源（App 持有，与 WidgetHeader 📌 共享，P3-1） */
  pinned: boolean
  /** 回写真源（App.setPinned）；本组件另调 togglePin 驱动窗口 */
  onPinChange: (pinned: boolean) => void
}

/** number/文本输入框样式（原型逐字：圆角 4px、半透明白底、细边框） */
const numberInputClass =
  'electron-no-drag w-[50px] px-1 py-0.5 text-xs rounded border border-black/10 bg-white/50 ' +
  'focus:outline-none focus:border-accent-blue'

function SettingsView({
  pinned,
  onPinChange
}: SettingsViewProps): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null)
  // number 输入以字符串承载键入，失焦/回车时校验并提交；无效或无变更则回填权威值
  const [thresholdStr, setThresholdStr] = useState('')
  const [intervalStr, setIntervalStr] = useState('')
  // M17.1：context_lengths 各行输入草稿（model → 键入值，**按所选单位换算后的数值**），
  // 加载时按权威值播种；M17.2 增单位选择
  const [ctxDrafts, setCtxDrafts] = useState<Record<string, string>>({})
  // M17.2：各行单位选择（model → 'M'|'K'），加载时按 entry.unit ?? 默认推导播种
  const [ctxUnits, setCtxUnits] = useState<Record<string, ContextUnit>>({})
  // M17.2：上下文长度表整表折叠开关（默认展开）
  const [ctxOpen, setCtxOpen] = useState(true)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [fading, setFading] = useState(false) // ok 反馈 2s 淡出的透明度开关
  const timersRef = useRef<number[]>([])

  const clearTimers = (): void => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = []
  }

  // 初始加载：拉取生效配置（置顶态经 props 由 App 真源供给，P3-1）
  useEffect(() => {
    let alive = true
    void window.electronAPI.getConfig().then((c) => {
      if (!alive) return
      setConfig(c)
      setThresholdStr(String(c.providers.deepseek.balance_warn_threshold))
      setIntervalStr(String(c.providers.deepseek.check_interval_min))
      const entries = c.context_lengths ?? {}
      const drafts: Record<string, string> = {}
      const units: Record<string, ContextUnit> = {}
      for (const [model, entry] of Object.entries(entries)) {
        const unit = entry.unit ?? defaultUnit(entry.len)
        units[model] = unit
        drafts[model] = String(lenInUnit(entry.len, unit))
      }
      setCtxDrafts(drafts)
      setCtxUnits(units)
    })
    return () => {
      alive = false
    }
  }, [])

  // 卸载清理淡出定时器
  useEffect(() => clearTimers, [])

  const showOk = (): void => {
    clearTimers()
    setFading(false)
    setFeedback({ kind: 'ok', msg: '已保存 ✓' })
    timersRef.current.push(window.setTimeout(() => setFading(true), 1500))
    timersRef.current.push(
      window.setTimeout(() => {
        setFeedback(null)
        setFading(false)
      }, 2000)
    )
  }

  const showErr = (msg: string): void => {
    clearTimers()
    setFading(false)
    setFeedback({ kind: 'err', msg: `保存失败：${msg}` })
  }

  /** 落盘：成功 → 以返回的合并配置刷新 state + 绿反馈；失败 → onFail 回滚 + 红反馈 */
  const persist = async (
    partial: DeepPartial<AppConfig>,
    onFail?: () => void
  ): Promise<void> => {
    try {
      const merged = await window.electronAPI.saveConfig(partial)
      setConfig(merged)
      showOk()
    } catch (err) {
      onFail?.()
      // P3-3 整改：UI 仅展示脱敏文案 —— 绝对路径 / pid / .tmp 文件名等细节只留
      // main 进程日志（config.ts console.warn），口径与 server.ts 错误中间件一致。
      // 错误类型（err.name）保留供排障，不含任何路径信息。
      const kind = err instanceof Error && err.name !== '' ? err.name : 'Error'
      showErr(`请检查配置目录权限（${kind}）`)
    }
  }

  // ── M17.1 + M17.2 模型上下文长度（失焦 / 回车提交；registry 行只读不可编辑） ──

  /** 计算某行当前生效单位（entry.unit ?? 默认推导；draft 用 ctxUnits state 实时值） */
  const unitOf = (model: string, entry: ContextEntry): ContextUnit =>
    ctxUnits[model] ?? entry.unit ?? defaultUnit(entry.len)

  /** 提交单行长度：校验正数 → 换算回原始 token → 强制 source='manual' 落盘（手动行不被自动更新覆盖）。
   *  仅可编辑行（manual/heuristic）调用；registry 行只读无此入口。 */
  const commitCtxLen = (model: string): void => {
    if (!config) return
    const entry = config.context_lengths?.[model]
    if (entry === undefined) return
    const raw = ctxDrafts[model] ?? String(entry.len)
    const num = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(num) || num <= 0) {
      // 无效 → 回填权威值（按当前单位换算展示）
      const unit = unitOf(model, entry)
      setCtxDrafts((d) => ({ ...d, [model]: String(lenInUnit(entry.len, unit)) }))
      return
    }
    const len = lenFromUnit(num, unitOf(model, entry))
    if (len === entry.len) {
      setCtxDrafts((d) => ({ ...d, [model]: String(num) })) // 无变更不落盘，仅规整显示
      return
    }
    setCtxDrafts((d) => ({ ...d, [model]: String(num) }))
    // deepMerge 键级合并：只写该模型条目，其余行不受影响
    void persist(
      { context_lengths: { [model]: { len, source: 'manual' } } },
      () => {
        const unit = unitOf(model, entry)
        setCtxDrafts((d) => ({ ...d, [model]: String(lenInUnit(entry.len, unit)) }))
      }
    )
  }

  /** 切换某行单位：仅重新换算草稿展示值，len 本身不变；立即落盘持久化单位偏好 */
  const changeCtxUnit = (model: string, next: ContextUnit): void => {
    if (!config) return
    const entry = config.context_lengths?.[model]
    if (entry === undefined) return
    const unit = unitOf(model, entry)
    if (unit === next) return
    const raw = ctxDrafts[model] ?? String(entry.len)
    const curNum = Number(raw)
    // 以当前草稿值（用户可能未提交）为换算基准：先转回原始 token，再按新单位重算
    const len = Number.isFinite(curNum) && curNum > 0 ? lenFromUnit(curNum, unit) : entry.len
    setCtxUnits((u) => ({ ...u, [model]: next }))
    setCtxDrafts((d) => ({ ...d, [model]: String(lenInUnit(len, next)) }))
    // 持久化单位偏好（len 不改；source 保持现状——单位选择不算手动编辑长度）
    void persist({ context_lengths: { [model]: { len, source: entry.source, unit: next } } })
  }

  // ── General ──

  const onAlwaysOnTopChange = (next: boolean): void => {
    onPinChange(next) // 回写 App 真源 → header 📌 同步高亮（P3-1）
    void window.electronAPI.togglePin(next) // 驱动窗口 alwaysOnTop，不持久化
  }

  const onNotificationsChange = (next: boolean): void => {
    if (!config) return
    const prev = config
    setConfig({ ...config, notifications: { ...config.notifications, enabled: next } })
    void persist({ notifications: { enabled: next } }, () => setConfig(prev))
  }

  // ── Limits & Alerts（失焦 / 回车提交） ──

  const commitThreshold = (): void => {
    if (!config) return
    const cur = config.providers.deepseek.balance_warn_threshold
    const num = Number(thresholdStr)
    if (thresholdStr.trim() === '' || !Number.isFinite(num) || num < 0) {
      setThresholdStr(String(cur)) // 无效 → 回填权威值
      return
    }
    if (num === cur) return // 无变更不落盘
    void persist(
      { providers: { deepseek: { balance_warn_threshold: num } } },
      () => setThresholdStr(String(cur))
    )
  }

  const commitInterval = (): void => {
    if (!config) return
    const cur = config.providers.deepseek.check_interval_min
    const num = Number(intervalStr)
    if (intervalStr.trim() === '' || !Number.isFinite(num) || num < 1) {
      setIntervalStr(String(cur)) // 间隔至少 1 分钟（services 亦 Math.max(1,…) 钳制）
      return
    }
    if (num === cur) return
    void persist(
      { providers: { deepseek: { check_interval_min: num } } },
      () => setIntervalStr(String(cur))
    )
  }

  const onEnterBlur = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
  }

  const onQuit = (): void => {
    void window.electronAPI.quitApp()
  }

  if (!config) {
    return (
      <div className="card">
        <div className="card-title">Settings</div>
        <p className="placeholder-text">加载配置中…</p>
      </div>
    )
  }

  // M17.1：上下文长度表按模型名排序（Object.entries 顺序不保证稳定）
  const ctxEntries = Object.entries(config.context_lengths ?? {}).sort(([a], [b]) =>
    a.localeCompare(b)
  )

  return (
    <div>
      {/* ── 模型上下文长度（M17.1 + M17.2，置于 General 之前，取代 M13.6 用量源管理） ── */}
      <div className="card ctx-card">
        <button
          type="button"
          className="ctx-toggle electron-no-drag"
          aria-expanded={ctxOpen}
          onClick={() => setCtxOpen((o) => !o)}
        >
          <span className={`chevron${ctxOpen ? ' open' : ''}`} aria-hidden="true">
            ▸
          </span>
          模型上下文长度
        </button>
        {ctxOpen && (
          <div className="ctx-sub">新模型成功调用后自动按厂商注册表写入，手动改过的行不再被自动覆盖。</div>
        )}

        {!ctxOpen ? null : ctxEntries.length === 0 ? (
          <p className="empty-state empty-state-compact">
            尚未记录模型上下文，成功调用 API 后自动出现
          </p>
        ) : (
          ctxEntries.map(([model, entry]) => {
            // registry = 100% 有把握的厂商默认值，只读展示；manual/heuristic 可编辑
            const editable = entry.source !== 'registry'
            const unit = unitOf(model, entry)
            return (
              <div key={model} className="ctx-row">
                <span className="ctx-model" title={model}>
                  {model}
                </span>
                <span className={`ctx-source-tag ${SOURCE_TAG_CLASS[entry.source]}`}>
                  {SOURCE_LABEL[entry.source]}
                </span>

                {editable ? (
                  <>
                    {/* 单位选择（M17.2）：K / M 切换，仅换算展示值，len 本身不变 */}
                    <div className="ctx-unit electron-no-drag" role="group" aria-label="单位">
                      {(['K', 'M'] as const).map((u) => (
                        <button
                          key={u}
                          type="button"
                          className={`ctx-unit-btn${unit === u ? ' on' : ''}`}
                          onClick={() => changeCtxUnit(model, u)}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                    {/* 长度输入：草稿值按所选单位承载；失焦/回车提交换算回原始 token 落盘 */}
                    <input
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      className="electron-no-drag ctx-input"
                      value={ctxDrafts[model] ?? String(entry.len)}
                      onChange={(e) =>
                        setCtxDrafts((d) => ({ ...d, [model]: e.target.value }))
                      }
                      onBlur={() => commitCtxLen(model)}
                      onKeyDown={onEnterBlur}
                    />
                  </>
                ) : (
                  // registry 只读：按 len + 默认单位展示带单位文本（如 "1M"）
                  <span className="ctx-value" title={`${entry.len.toLocaleString('en-US')} tokens`}>
                    {formatLen(entry.len, unit)}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ── General ── */}
      <div className="card">
        <div className="card-title">General</div>
        <Row label="Always on Top">
          <input
            type="checkbox"
            className="electron-no-drag cursor-pointer"
            checked={pinned}
            onChange={(e) => onAlwaysOnTopChange(e.target.checked)}
          />
        </Row>
        <Row label="Desktop Notifications">
          <input
            type="checkbox"
            className="electron-no-drag cursor-pointer"
            checked={config.notifications.enabled}
            onChange={(e) => onNotificationsChange(e.target.checked)}
          />
        </Row>
      </div>

      {/* ── Limits & Alerts ── */}
      <div className="card">
        <div className="card-title">Limits &amp; Alerts</div>
        <Row label="Balance Warning (¥)">
          <input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            className={numberInputClass}
            value={thresholdStr}
            onChange={(e) => setThresholdStr(e.target.value)}
            onBlur={commitThreshold}
            onKeyDown={onEnterBlur}
          />
        </Row>
        <Row label="Approval Timeout">
          <span className="text-text-muted">
            {config.notifications.approve_timeout_sec}s · 暂不可改
          </span>
        </Row>
        <Row label="Check Interval (min)">
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className={numberInputClass}
            value={intervalStr}
            onChange={(e) => setIntervalStr(e.target.value)}
            onBlur={commitInterval}
            onKeyDown={onEnterBlur}
          />
        </Row>
      </div>

      {/* ── 行内保存反馈（reserve 高度避免跳动） ── */}
      <div className="h-5 mb-1 text-center text-xs">
        {feedback && (
          <span
            className={`transition-opacity duration-500 ${fading ? 'opacity-0' : 'opacity-100'} ${
              feedback.kind === 'ok' ? 'text-success' : 'text-danger'
            }`}
          >
            {feedback.msg}
          </span>
        )}
      </div>

      {/* ── Quit ── */}
      <div className="text-center mt-2">
        <button
          type="button"
          onClick={onQuit}
          className="electron-no-drag w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white/60 border border-black/10 rounded-lg text-xs font-medium cursor-pointer text-danger hover:bg-white transition-colors"
        >
          Quit SessionBuddy
        </button>
      </div>
    </div>
  )
}

export default SettingsView
