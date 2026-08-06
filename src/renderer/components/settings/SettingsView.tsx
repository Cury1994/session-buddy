import { useEffect, useRef, useState } from 'react'

import { BILLING_BADGE_CLASS } from '../usage/UsageCardCard'

import type {
  AppConfig,
  BillingMode,
  DeepPartial,
  HttpJsonSource,
  RemainingSpec,
  SubscriptionSource,
  UsageCard,
  UsageSourceConfig,
  UsageSourceKind
} from '../../../shared/types'

/**
 * M10 + M13.6 — 设置视图（DESIGN §4 / TASKS §11 + M13.6）
 *
 * 四块 + 退出按钮，内联于 Settings 分段（非 modal）：
 *   ├── 用量源管理（M13.6）  usage_sources 列表 + 新增/编辑表单（整组替换保存）
 *   ├── General        Always on Top（app:toggle-pin，不持久化）/ Desktop Notifications
 *   ├── Limits & Alerts Balance Warning ¥（providers.deepseek 过渡字段，M13.6 保留现状）/
 *   │                   审批超时 60s 仅展示（D3 延后）/ 查询间隔分钟
 *   └── [Quit Harness Monitor] 红色全宽按钮
 *
 * 用量源管理（M13.6 契约）：
 *   - 列表每行：名称 + 计费徽章 + 接入方式 + 状态标记（优先运行时卡状态
 *     [usage:get 交叉引用]：未配置/缺凭证/查询失败；无卡时配置级退化判定：
 *     订阅端点空 → 未配置）+ [编辑]
 *   - 表单字段：名称 / ID（编辑锁定，改 ID 会孤儿化既有卡）/ 计费形式（select）/
 *     接入方式 kind（select，切换联动字段）/ 查询 URL / 鉴权 / 凭证 env /
 *     余量提取 path（可空）/ limit（可空）/ 单位 / 告警线（可选）；
 *     bss 源为 AccessKey ID/Secret 双 env
 *   - 保存：构建 UsageSourceConfig 后**整体写回 usage_sources 数组**
 *     （deepMerge 数组整体替换语义，M2）；成功后主进程 reschedule → 用量卡即时重算。
 *     编辑回写保留 detect_ids（检测桥接）与 currency（表单不含该字段）
 *   - focusUsageSource：UsageView 槽位卡"配置此 API"跳转进入 —— 找到该 source
 *     打开编辑表单并高亮其行，否则打开新增表单（name 预填 focus 值）；
 *     消费后经 onFocusHandled 回调清除（避免下次手动进设置重复触发）
 *
 * 保存语义（主对话决策 4）：修改即经 saveConfig 落盘。checkbox 变更即存；number 输入
 * **失焦 / 回车提交**。行内反馈：resolve → "已保存 ✓"（绿，2s 淡出）；reject →
 * "保存失败：<msg>"（红，保留到下次操作）。无 toast/modal 库。
 */

/** 新增表单的 editingId 哨兵值（区别于真实 source.id） */
const NEW_SOURCE_KEY = '__new__'

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

/** 接入方式展示名 */
const KIND_LABEL: Record<UsageSourceKind, string> = {
  'http-json': 'HTTP JSON',
  bss: 'BSS 签名',
  subscription: '订阅端点'
}

interface SettingsViewProps {
  /** 置顶态真源（App 持有，与 WidgetHeader 📌 共享，P3-1） */
  pinned: boolean
  /** 回写真源（App.setPinned）；本组件另调 togglePin 驱动窗口 */
  onPinChange: (pinned: boolean) => void
  /** M13.6 用量源聚焦标记（UsageView 槽位卡"配置此 API"跳转传入；消费后回调清除） */
  focusUsageSource?: string | null
  /** 聚焦已消费（App 清除 state，避免下次手动进设置重复触发） */
  onFocusHandled?: () => void
}

/** 新增/编辑表单的平面状态（kind 无关字段统一承载，保存时按 kind 组装） */
interface SourceFormState {
  id: string
  name: string
  billing: BillingMode
  kind: UsageSourceKind
  url: string
  authType: 'bearer' | 'none'
  keyEnv: string
  path: string
  limit: string
  unit: string
  warnThreshold: string
  bssIdEnv: string
  bssSecretEnv: string
}

const EMPTY_FORM: SourceFormState = {
  id: '',
  name: '',
  billing: 'payg',
  kind: 'http-json',
  url: '',
  authType: 'bearer',
  keyEnv: '',
  path: '',
  limit: '',
  unit: '',
  warnThreshold: '',
  bssIdEnv: '',
  bssSecretEnv: ''
}

/** UsageSourceConfig → 表单状态（编辑预填） */
function sourceToForm(s: UsageSourceConfig): SourceFormState {
  if (s.kind === 'bss') {
    return {
      ...EMPTY_FORM,
      id: s.id,
      name: s.name,
      billing: 'payg',
      kind: 'bss',
      bssIdEnv: s.access_key_id_env,
      bssSecretEnv: s.access_key_secret_env
    }
  }
  return {
    ...EMPTY_FORM,
    id: s.id,
    name: s.name,
    billing: s.billing,
    kind: s.kind,
    url: s.url,
    authType: s.auth.type,
    keyEnv: s.auth.key_env ?? '',
    path: s.remaining.path ?? '',
    limit: s.remaining.limit ?? '',
    unit: s.unit,
    warnThreshold: s.warn_threshold !== undefined ? String(s.warn_threshold) : ''
  }
}

/** 表单状态 → UsageSourceConfig（按 kind 组装；编辑时保留 detect_ids 与 currency） */
function formToSource(form: SourceFormState, original?: UsageSourceConfig): UsageSourceConfig {
  const detectIds = original?.detect_ids
  const hasDetectIds = detectIds !== undefined && detectIds.length > 0
  const warnRaw = form.warnThreshold.trim()
  const warnNum = warnRaw === '' ? NaN : Number(warnRaw)
  const warnOk = Number.isFinite(warnNum) && warnNum >= 0

  if (form.kind === 'bss') {
    return {
      id: form.id,
      name: form.name,
      billing: 'payg',
      kind: 'bss',
      access_key_id_env: form.bssIdEnv.trim(),
      access_key_secret_env: form.bssSecretEnv.trim(),
      ...(hasDetectIds ? { detect_ids: detectIds } : {})
    }
  }

  if (form.kind === 'subscription') {
    const src: SubscriptionSource = {
      id: form.id,
      name: form.name,
      billing: 'subscription',
      kind: 'subscription',
      url: form.url.trim(),
      auth: {
        type: form.authType,
        key_env: form.keyEnv.trim() !== '' ? form.keyEnv.trim() : undefined
      },
      remaining: remainingSpec(form),
      unit: form.unit.trim(),
      ...(hasDetectIds ? { detect_ids: detectIds } : {})
    }
    if (warnOk) src.warn_threshold = warnNum
    return src
  }

  const src: HttpJsonSource = {
    id: form.id,
    name: form.name,
    billing: form.billing,
    kind: 'http-json',
    url: form.url.trim(),
    auth: {
      type: form.authType,
      key_env: form.keyEnv.trim() !== '' ? form.keyEnv.trim() : undefined
    },
    remaining: remainingSpec(form),
    unit: form.unit.trim(),
    ...(hasDetectIds ? { detect_ids: detectIds } : {})
  }
  if (warnOk) src.warn_threshold = warnNum
  // 编辑 http-json 源时保留既有 currency（表单不含币种字段，避免回写丢币种）
  if (original?.kind === 'http-json' && original.currency !== undefined) {
    src.currency = original.currency
  }
  return src
}

/** path/limit → RemainingSpec（空串 → undefined，交给后端缺省语义；两者均为 JSON 点号路径） */
function remainingSpec(form: SourceFormState): RemainingSpec {
  return {
    path: form.path.trim() !== '' ? form.path.trim() : undefined,
    limit: form.limit.trim() !== '' ? form.limit.trim() : undefined
  }
}

/** 用量源行状态标记：优先运行时卡状态（usage:get 交叉引用，真实），无卡时配置级退化判定 */
function rowMarkFor(
  source: UsageSourceConfig,
  card: UsageCard | undefined
): { text: string; className: string } | null {
  if (card) {
    if (card.status === 'missing-config') return { text: '未配置', className: 'usage-badge-missing-config' }
    if (card.status === 'missing-credential') return { text: '缺凭证', className: 'usage-badge-missing-credential' }
    if (card.status === 'error') return { text: '查询失败', className: 'usage-badge-error' }
    return null
  }
  // 无运行时卡（首轮 tick 前等）：配置级判定 —— 订阅端点空 → 未配置
  if (source.kind === 'subscription' && source.url.trim() === '') {
    return { text: '未配置', className: 'usage-badge-missing-config' }
  }
  return null
}

/** 凭证 env 留空时后端按 `{ID 大写}_API_KEY` 推断（与 services.ts bearerEnvName 同规则） */
function inferredEnv(id: string): string {
  const upper = id.trim().toUpperCase()
  return `${upper === '' ? 'SOURCE' : upper}_API_KEY`
}

/** number/文本输入框样式（原型逐字：圆角 4px、半透明白底、细边框；宽度按用途微调） */
const numberInputClass =
  'electron-no-drag w-[50px] px-1 py-0.5 text-xs rounded border border-black/10 bg-white/50 ' +
  'focus:outline-none focus:border-accent-blue'
const textInputClass =
  'electron-no-drag w-[110px] px-1 py-0.5 text-xs rounded border border-black/10 bg-white/50 ' +
  'focus:outline-none focus:border-accent-blue disabled:opacity-50'
const wideInputClass =
  'electron-no-drag w-[170px] px-1 py-0.5 text-xs rounded border border-black/10 bg-white/50 ' +
  'focus:outline-none focus:border-accent-blue placeholder:text-black/25'
const selectClass =
  'electron-no-drag w-[110px] px-1 py-0.5 text-xs rounded border border-black/10 bg-white/50 ' +
  'focus:outline-none focus:border-accent-blue cursor-pointer'

function SettingsView({
  pinned,
  onPinChange,
  focusUsageSource,
  onFocusHandled
}: SettingsViewProps): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null)
  // number 输入以字符串承载键入，失焦/回车时校验并提交；无效或无变更则回填权威值
  const [thresholdStr, setThresholdStr] = useState('')
  const [intervalStr, setIntervalStr] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [fading, setFading] = useState(false) // ok 反馈 2s 淡出的透明度开关
  const timersRef = useRef<number[]>([])

  // ── M13.6 用量源管理 state ──
  const [usageCards, setUsageCards] = useState<UsageCard[]>([]) // 运行时卡状态（行标记交叉引用）
  const [form, setForm] = useState<SourceFormState | null>(null) // null = 未在编辑
  const [editingId, setEditingId] = useState<string | null>(null) // 编辑中的 source.id / NEW_SOURCE_KEY
  const [highlightId, setHighlightId] = useState<string | null>(null) // 聚焦行脉冲高亮
  const [formError, setFormError] = useState<string | null>(null) // 表单内校验错误（红字）
  const formRef = useRef<HTMLDivElement>(null)

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
    })
    return () => {
      alive = false
    }
  }, [])

  // M13.6 行标记：挂载拉一次运行时卡状态（调度器缓存，一次 invoke；失败不阻塞设置页）
  useEffect(() => {
    let alive = true
    void window.electronAPI
      .getUsageData()
      .then((cards) => {
        if (alive) setUsageCards(cards)
      })
      .catch(() => {
        /* 标记缺失不阻塞设置页 */
      })
    return () => {
      alive = false
    }
  }, [])

  // 卸载清理淡出/聚焦定时器
  useEffect(() => clearTimers, [])

  // M13.6 聚焦：UsageView 槽位卡"配置"跳转进入。找到该用量源 → 打开编辑表单 +
  // 行脉冲高亮；未找到（检测到但无配置项）→ 打开新增表单，name 预填 focus 值。
  // 处理后回调 onFocusHandled 清除标记（App 消费，避免下次手动进设置重复触发）。
  useEffect(() => {
    if (!focusUsageSource || !config) return
    const found = config.usage_sources.find((s) => s.id === focusUsageSource)
    if (found) {
      setEditingId(found.id)
      setForm(sourceToForm(found))
      setHighlightId(found.id)
      timersRef.current.push(
        window.setTimeout(() => setHighlightId((cur) => (cur === found.id ? null : cur)), 3000)
      )
    } else {
      setEditingId(NEW_SOURCE_KEY)
      setForm({ ...EMPTY_FORM, name: focusUsageSource })
    }
    setFormError(null)
    onFocusHandled?.()
  }, [focusUsageSource, config, onFocusHandled])

  // 表单打开（聚焦进入 / 手动新增 / 编辑）→ 滚动到可视区（等 view-fade 动画完成后定位）
  const formOpen = form !== null
  useEffect(() => {
    if (!formOpen) return
    timersRef.current.push(
      window.setTimeout(() => {
        formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }, 120)
    )
  }, [formOpen])

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

  // ── M13.6 用量源表单 ──

  const setFormField = <K extends keyof SourceFormState>(
    key: K,
    value: SourceFormState[K]
  ): void => {
    setForm((f) => (f ? { ...f, [key]: value } : f))
    setFormError(null)
  }

  const startNewForm = (): void => {
    setEditingId(NEW_SOURCE_KEY)
    setForm({ ...EMPTY_FORM })
    setFormError(null)
  }

  const startEdit = (s: UsageSourceConfig): void => {
    setEditingId(s.id)
    setForm(sourceToForm(s))
    setFormError(null)
  }

  const cancelForm = (): void => {
    setForm(null)
    setEditingId(null)
    setFormError(null)
  }

  /** 保存：整组替换 usage_sources（deepMerge 数组整体替换语义）；乐观更新失败回滚 */
  const saveSource = (): void => {
    if (!config || !form) return

    const id = form.id.trim()
    if (id === '') {
      setFormError('ID 不能为空（用量卡按 ID 区分）')
      return
    }
    const isNew = editingId === NEW_SOURCE_KEY
    if (isNew && config.usage_sources.some((s) => s.id === id)) {
      setFormError(`ID "${id}" 已存在，请换一个`)
      return
    }
    if (form.kind === 'bss') {
      if (form.bssIdEnv.trim() === '' || form.bssSecretEnv.trim() === '') {
        setFormError('AccessKey 的两个环境变量名均不能为空')
        return
      }
    } else {
      if (form.kind === 'http-json' && form.url.trim() === '') {
        setFormError('查询 URL 不能为空')
        return
      }
      const warnRaw = form.warnThreshold.trim()
      if (warnRaw !== '') {
        const n = Number(warnRaw)
        if (!Number.isFinite(n) || n < 0) {
          setFormError('告警线必须是 ≥ 0 的数字')
          return
        }
      }
    }

    const name = form.name.trim() || id
    const original = isNew ? undefined : config.usage_sources.find((s) => s.id === editingId)
    const source = formToSource({ ...form, id, name }, original)
    const prev = config
    const nextSources = isNew
      ? [...config.usage_sources, source]
      : config.usage_sources.map((s) => (s.id === editingId ? source : s))

    setConfig({ ...config, usage_sources: nextSources }) // 乐观更新（失败回滚）
    void window.electronAPI
      .saveConfig({ usage_sources: nextSources })
      .then((merged) => {
        setConfig(merged)
        setForm(null)
        setEditingId(null)
        setFormError(null)
        showOk()
      })
      .catch((err: unknown) => {
        setConfig(prev) // 回滚到保存前配置
        const kind = err instanceof Error && err.name !== '' ? err.name : 'Error'
        showErr(`请检查配置目录权限（${kind}）`)
      })
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

  const sources = config.usage_sources ?? []

  return (
    <div>
      {/* ── 用量源管理（M13.6，置于 General 之前） ── */}
      <div className="card">
        <div className="card-title">用量源管理</div>

        {form ? (
          <div ref={formRef} className="usage-form">
            <div className="usage-form-title">
              {editingId === NEW_SOURCE_KEY ? '新增用量源' : `编辑用量源：${form.name || form.id}`}
            </div>
            <Row label="名称">
              <input
                className={textInputClass}
                value={form.name}
                placeholder={form.id}
                onChange={(e) => setFormField('name', e.target.value)}
              />
            </Row>
            <Row label="ID">
              <input
                className={textInputClass}
                value={form.id}
                disabled={editingId !== NEW_SOURCE_KEY}
                onChange={(e) => setFormField('id', e.target.value)}
              />
            </Row>
            <Row label="计费形式">
              <select
                className={selectClass}
                value={form.billing}
                onChange={(e) => setFormField('billing', e.target.value as BillingMode)}
              >
                <option value="payg">按量消费</option>
                <option value="subscription">订阅消费</option>
              </select>
            </Row>
            <Row label="接入方式">
              <select
                className={selectClass}
                value={form.kind}
                onChange={(e) => setFormField('kind', e.target.value as UsageSourceKind)}
              >
                <option value="http-json">HTTP JSON</option>
                <option value="bss">阿里云 BSS</option>
                <option value="subscription">订阅端点</option>
              </select>
            </Row>

            {form.kind !== 'bss' ? (
              <>
                <Row label="查询 URL">
                  <input
                    className={wideInputClass}
                    value={form.url}
                    placeholder="https://api.example.com/user/balance"
                    onChange={(e) => setFormField('url', e.target.value)}
                  />
                </Row>
                <Row label="鉴权">
                  <select
                    className={selectClass}
                    value={form.authType}
                    onChange={(e) =>
                      setFormField('authType', e.target.value as 'bearer' | 'none')
                    }
                  >
                    <option value="bearer">Bearer Token</option>
                    <option value="none">无</option>
                  </select>
                </Row>
                <Row label="凭证环境变量">
                  <input
                    className={textInputClass}
                    value={form.keyEnv}
                    placeholder={inferredEnv(form.id)}
                    onChange={(e) => setFormField('keyEnv', e.target.value)}
                  />
                </Row>
                <Row label="余量提取 path">
                  <input
                    className={wideInputClass}
                    value={form.path}
                    placeholder="balance_infos[0].total_balance"
                    onChange={(e) => setFormField('path', e.target.value)}
                  />
                </Row>
                <Row label="limit（可空）">
                  <input
                    className={wideInputClass}
                    value={form.limit}
                    placeholder="如 data.limits[0]"
                    onChange={(e) => setFormField('limit', e.target.value)}
                  />
                </Row>
                <Row label="单位">
                  <input
                    className={textInputClass}
                    value={form.unit}
                    placeholder="CNY / token / 次"
                    onChange={(e) => setFormField('unit', e.target.value)}
                  />
                </Row>
                <Row label="告警线（可空）">
                  <input
                    className={numberInputClass}
                    value={form.warnThreshold}
                    placeholder="如 10"
                    onChange={(e) => setFormField('warnThreshold', e.target.value)}
                  />
                </Row>
              </>
            ) : (
              <>
                <Row label="AccessKey ID 环境变量">
                  <input
                    className={textInputClass}
                    value={form.bssIdEnv}
                    placeholder="ALIYUN_ACCESS_KEY_ID"
                    onChange={(e) => setFormField('bssIdEnv', e.target.value)}
                  />
                </Row>
                <Row label="AccessKey Secret 环境变量">
                  <input
                    className={textInputClass}
                    value={form.bssSecretEnv}
                    placeholder="ALIYUN_ACCESS_KEY_SECRET"
                    onChange={(e) => setFormField('bssSecretEnv', e.target.value)}
                  />
                </Row>
              </>
            )}

            {formError && <div className="usage-form-error">{formError}</div>}
            <div className="usage-form-actions">
              <button type="button" className="btn" onClick={cancelForm}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={saveSource}>
                保存
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="usage-sources-actions">
              <button type="button" className="btn" onClick={startNewForm}>
                ＋ 新增用量源
              </button>
            </div>
            {sources.length === 0 ? (
              <p className="empty-state empty-state-compact">尚未配置用量源，点击上方按钮添加。</p>
            ) : (
              sources.map((s) => {
                const card = usageCards.find((c) => c.sourceId === s.id)
                const mark = rowMarkFor(s, card)
                return (
                  <div
                    key={s.id}
                    className={`usage-source-row${highlightId === s.id ? ' usage-source-highlight' : ''}`}
                  >
                    <div className="usage-source-info">
                      <span className="usage-source-name" title={s.id}>
                        {s.name}
                      </span>
                      <span className={`usage-badge ${BILLING_BADGE_CLASS[s.billing]}`}>
                        {s.billing === 'payg' ? '按量' : '订阅'}
                      </span>
                      <span className="usage-source-kind">{KIND_LABEL[s.kind]}</span>
                      {mark && <span className={`usage-badge ${mark.className}`}>{mark.text}</span>}
                    </div>
                    <button type="button" className="btn" onClick={() => startEdit(s)}>
                      编辑
                    </button>
                  </div>
                )
              })
            )}
          </>
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
          Quit Harness Monitor
        </button>
      </div>
    </div>
  )
}

export default SettingsView
