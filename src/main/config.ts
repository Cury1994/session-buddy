import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse as yamlParse, stringify as yamlStringify } from 'yaml'

import type { AppConfig, DeepPartial } from '../shared/types'

/**
 * M2 — 配置管理（DESIGN §6.1 / §8.1 / §8.2）
 *
 * 注意：本模块**不 import electron 的 `app`**，因为验收用裸 node 直接
 * `require('./out/main/config')` 运行，import electron 会让裸 node 崩溃。
 * 内置 config.yaml 的路径用 `__dirname` 相对推导：
 *   - 开发 / electron-vite build 产物：out/main/config.js → 上两级即项目根
 *   - 打包后资源路径（process.resourcesPath 等）是 M15 的事，届时再适配
 */

/**
 * 递归深拷贝 / 部分覆盖用的工具类型：单一真源在 shared/types.ts（§6.12），
 * 此处再导出，保持 ipc-handlers 等既有 `import { DeepPartial } from './config'` 不破。
 */
export type { DeepPartial }

// ─── 路径 ───

const USER_DIR_PRIMARY = join(homedir(), '.config', 'harness-monitor')
const USER_FILE_PRIMARY = join(USER_DIR_PRIMARY, 'config.yaml')
const USER_FILE_COMPAT = join(homedir(), '.config', 'claude-monitor', 'config.yaml')

// out/main/config.js → 上两级 = 项目根（dev 与 electron-vite build 产物均成立）
const BUILTIN_CONFIG_PATH = join(__dirname, '..', '..', 'config.yaml')

// ─── 兜底默认值（DESIGN §8.1；当内置 config.yaml 不可读时使用） ───

const DEFAULT_CONFIG: AppConfig = {
  server: { host: '127.0.0.1', port: 18456 },
  providers: {
    deepseek: {
      balance_url: 'https://api.deepseek.com/user/balance',
      check_interval_min: 1,
      balance_warn_threshold: 10
    }
  },
  usage_sources: [
    {
      id: 'deepseek',
      name: 'DeepSeek',
      billing: 'payg',
      kind: 'http-json',
      url: 'https://api.deepseek.com/user/balance',
      auth: { type: 'bearer', key_env: 'DEEPSEEK_API_KEY' },
      // path 带数组下标（balance_infos[0].total_balance），实现方（M13.3）需支持
      remaining: { path: 'balance_infos[0].total_balance', limit: undefined },
      unit: 'CNY',
      currency: 'CNY',
      warn_threshold: 10
      // M15：detect_ids 已删——cc-switch 检测结果按 url host 归并，本源 url host
      // (api.deepseek.com) 自动匹配，无需手配桥接（见 services.buildUsageCards）
    },
    {
      // 阿里云百炼订阅套餐：端点待用户提供，先占位（M13.2+ 再接入）
      id: 'aliyun-bailian',
      name: '阿里云百炼',
      billing: 'subscription',
      kind: 'subscription',
      url: '',
      auth: { type: 'none' },
      remaining: { path: '', limit: undefined },
      unit: 'token',
      // M15：detect_ids 改为 host——cc-switch 按 host 归并后，两个百炼 provider
      // (coding/AIgC 模型) 共享 base_url host，合并成一张卡；本源 url 空，靠 detect_ids 桥接
      detect_ids: ['token-plan.cn-beijing.maas.aliyuncs.com']
    }
  ],
  detection: {
    cc_switch: { enabled: true, db_path: '~/.cc-switch/cc-switch.db' },
    claude_sessions: { enabled: true }
  },
  // M13.5：全局用量源轮询间隔（分钟）。单卡时代的 providers.deepseek.check_interval_min
  // 为过渡字段（渲染端设置页 M13.6 迁移到本字段后删除）。
  usage_poll_interval_min: 1,
  harnesses: {
    'claude-code': {
      sessions_glob: '~/.claude/sessions/*.json',
      settings_path: '~/.claude/settings.json',
      refresh_interval_sec: 3,
      config_dirs: ['~/.claude']
    }
  },
  notifications: { enabled: true, approve_timeout_sec: 60 },
  window: { width: 420, height: 650 },
  // M17: 模型上下文长度表（model id → { len, source }；空表 = 全走 registry/heuristic 推导）
  context_lengths: {}
}

// ─── 工具 ───

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 存在性守卫删除：清理原子写临时文件，任何删除错误均忽略 */
function removeIfExists(filePath: string): void {
  try {
    unlinkSync(filePath)
  } catch {
    /* 临时文件不存在或清理失败均可忽略 */
  }
}

/**
 * 递归深合并：纯对象逐层合并，**数组整体替换**（不做元素级合并），
 * 标量直接覆盖。返回值与入参完全解耦（structuredClone 拷贝），不 mutate 入参。
 */
export function deepMerge(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const result = structuredClone(base)
  if (!isPlainObject(overrides)) return result

  for (const [key, overValue] of Object.entries(overrides)) {
    const baseValue = result[key]
    if (isPlainObject(overValue) && isPlainObject(baseValue)) {
      result[key] = deepMerge(baseValue, overValue)
    } else {
      result[key] = structuredClone(overValue)
    }
  }
  return result
}

/**
 * 读取并解析单个 YAML 配置文件。
 * - 文件不存在（ENOENT）→ 静默返回 undefined（非错误，正常缺省）
 * - 其它读取错误 / YAML 解析错误 / 顶层非对象 → console.warn + 返回 undefined
 *   （不抛给调用方，符合 TASKS §18.4 降级原则）
 */
function readYamlFile(filePath: string): Record<string, unknown> | undefined {
  let text: string
  try {
    text = readFileSync(filePath, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    console.warn(`[config] 读取失败 ${filePath}: ${(err as Error).message}`)
    return undefined
  }

  let parsed: unknown
  try {
    parsed = yamlParse(text)
  } catch (err) {
    console.warn(`[config] YAML 解析失败 ${filePath}: ${(err as Error).message}`)
    return undefined
  }

  if (parsed === null) return undefined // 空文件视为无覆盖
  if (!isPlainObject(parsed)) {
    console.warn(`[config] 顶层非对象，已忽略 ${filePath}`)
    return undefined
  }
  return parsed
}

/**
 * 解析 `--config <path>` / `--config=<path>`（DESIGN §6.1 优先级 1，预留实装）。
 * 重复出现 `--config` 时为 **first-wins**：首次匹配即 `return`，后续重复参数被忽略。
 */
function resolveCliConfigPath(argv: readonly string[] = process.argv): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === undefined) continue
    if (arg === '--config') {
      const next = argv[i + 1]
      return next && next.length > 0 ? next : undefined
    }
    if (arg.startsWith('--config=')) {
      const value = arg.slice('--config='.length)
      return value.length > 0 ? value : undefined
    }
  }
  return undefined
}

/**
 * 加载并合并配置（DESIGN §6.1 / §8.2）。
 *
 * 合并顺序（低 → 高优先级）：内置默认 → claude-monitor(兼容) → harness-monitor → --config。
 *
 * 注：DESIGN §8.2 的伪代码 user_paths 循环顺序与 §6.1 优先级表存在出入
 * （§8.2 循环会让 claude-monitor 覆盖 harness-monitor）。此处遵循 §6.1 优先级表
 * 与 TASKS §3 的明确要求：harness-monitor 优先级高于向后兼容的 claude-monitor。
 */
export function loadConfig(): AppConfig {
  let cfg: Record<string, unknown> = deepMerge(
    {},
    DEFAULT_CONFIG as unknown as Record<string, unknown>
  )

  const builtin = readYamlFile(BUILTIN_CONFIG_PATH)
  if (builtin) cfg = deepMerge(cfg, builtin)

  const compat = readYamlFile(USER_FILE_COMPAT)
  if (compat) cfg = deepMerge(cfg, compat)

  const primary = readYamlFile(USER_FILE_PRIMARY)
  if (primary) cfg = deepMerge(cfg, primary)

  const cliPath = resolveCliConfigPath()
  if (cliPath) {
    const cli = readYamlFile(cliPath)
    if (cli) cfg = deepMerge(cfg, cli)
  }

  return cfg as unknown as AppConfig
}

/**
 * 保存用户配置：把 partial 深合并进现有用户文件（保留其它已覆盖 key），
 * 写回 `~/.config/harness-monitor/config.yaml`（目录不存在则创建）。
 * 仅写入用户显式覆盖的 key，不把默认值烘焙进用户文件（DESIGN §8.2）。
 *
 * 契约（M10 收窄，主对话决策）：写入失败**抛出异常**（rename / 写盘失败均 throw，
 * 不再静默 warn 降级）。理由：保存是前台用户动作，静默降级＝假成功真丢失，比报错更糟；
 * 抛出后经 IPC 转 reject、UI 显错误，应用不崩，仍合 §18.4 "降级不崩溃" 精神。
 * 读取侧（loadConfig）的降级保留不变。成功返回合并后的完整生效配置。
 */
export function saveConfig(partial: DeepPartial<AppConfig>): AppConfig {
  const existing = readYamlFile(USER_FILE_PRIMARY) ?? {}
  const mergedUser = deepMerge(
    existing,
    partial as unknown as Record<string, unknown>
  )

  // 原子写：先写同目录临时文件，成功后 renameSync 覆盖目标（POSIX 同目录 rename 原子）。
  // 临时文件名含 pid + 随机后缀，规避并发/残留命名冲突；任何失败路径都用存在性守卫清理临时文件。
  const tmpPath = `${USER_FILE_PRIMARY}.tmp-${process.pid}-${randomUUID().slice(0, 8)}`
  try {
    mkdirSync(USER_DIR_PRIMARY, { recursive: true })
    writeFileSync(tmpPath, yamlStringify(mergedUser), 'utf8')
  } catch (err) {
    removeIfExists(tmpPath) // 写入失败：存在性守卫清理可能残留的临时文件
    const msg = `写入配置失败 ${USER_FILE_PRIMARY}: ${(err as Error).message}`
    console.warn(`[config] ${msg}`)
    throw new Error(msg)
  }

  try {
    renameSync(tmpPath, USER_FILE_PRIMARY)
  } catch (err) {
    removeIfExists(tmpPath) // rename 失败：清理临时文件 + 抛出（M10 契约收窄）
    const msg = `原子重命名失败 ${USER_FILE_PRIMARY}: ${(err as Error).message}`
    console.warn(`[config] ${msg}`)
    throw new Error(msg)
  }

  return loadConfig()
}
