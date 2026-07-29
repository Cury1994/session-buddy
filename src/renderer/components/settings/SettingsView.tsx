import { useEffect, useRef, useState } from 'react'

import type { AppConfig, DeepPartial } from '../../../shared/types'

/**
 * M10 — 设置视图（DESIGN §4 / TASKS §11，基准原型 harness_monitor.html view-settings）
 *
 * 两张卡片 + 退出按钮，内联于 Settings 分段（非 modal）：
 *   ├── General        Always on Top（app:toggle-pin，不持久化）/ Desktop Notifications（→ notifications.enabled）
 *   ├── Limits & Alerts Balance Warning ¥（→ balance_warn_threshold）/ 审批超时 60s 仅展示（D3 延后）/
 *   │                   查询间隔分钟（→ check_interval_min，FR-1.5）
 *   └── [Quit Harness Monitor] 红色全宽按钮（app:quit → will-quit 清理链）
 *
 * 保存语义（主对话决策 4）：修改即经 saveConfig 落盘。checkbox 变更即存；number 输入
 * **失焦 / 回车提交**（避免键入中途反复写盘）。行内反馈：resolve → "已保存 ✓"（绿，2s 淡出）；
 * reject → "保存失败：<msg>"（红，保留到下次操作）。无 toast/modal 库。
 *
 * Always on Top 取舍：窗口置顶态唯一真源是 window.ts 的 pin 状态（togglePin 同时驱动
 * alwaysOnTop 与 blur-不隐藏），WidgetHeader 📌 与本复选框共享之。打开设置时经只读
 * window:get-always-on-top 查询 isPinned() 反映当前真实状态，勾选即 togglePin 生效、
 * 不写 config（WindowConfig 无 alwaysOnTop 字段，本就不持久化）。
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

/** number 输入框样式（原型逐字：50px 宽、4px 圆角、半透明白底、细边框） */
const numberInputClass =
  'electron-no-drag w-[50px] px-1 py-0.5 text-xs rounded border border-black/10 bg-white/50 ' +
  'focus:outline-none focus:border-accent-blue'

function SettingsView(): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  // number 输入以字符串承载键入，失焦/回车时校验并提交；无效或无变更则回填权威值
  const [thresholdStr, setThresholdStr] = useState('')
  const [intervalStr, setIntervalStr] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [fading, setFading] = useState(false) // ok 反馈 2s 淡出的透明度开关
  const timersRef = useRef<number[]>([])

  const clearTimers = (): void => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = []
  }

  // 初始加载：拉取生效配置 + 当前置顶态
  useEffect(() => {
    let alive = true
    void window.electronAPI.getConfig().then((c) => {
      if (!alive) return
      setConfig(c)
      setThresholdStr(String(c.providers.deepseek.balance_warn_threshold))
      setIntervalStr(String(c.providers.deepseek.check_interval_min))
    })
    void window.electronAPI.getAlwaysOnTop().then((v) => {
      if (alive) setAlwaysOnTop(v)
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
      showErr((err as Error).message)
    }
  }

  // ── General ──

  const onAlwaysOnTopChange = (next: boolean): void => {
    setAlwaysOnTop(next)
    void window.electronAPI.togglePin(next) // 不持久化，与 WidgetHeader 📌 同源
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

  return (
    <div>
      {/* ── General ── */}
      <div className="card">
        <div className="card-title">General</div>
        <Row label="Always on Top">
          <input
            type="checkbox"
            className="electron-no-drag cursor-pointer"
            checked={alwaysOnTop}
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
          Quit Harness Monitor
        </button>
      </div>
    </div>
  )
}

export default SettingsView
