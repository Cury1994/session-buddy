import { readFileSync, writeFileSync, watch } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * 主注册位 = settings.local.json（M17 根治，2026-08-08）。
 * 背景：cc-switch 热切换 provider 时用其 provider 快照（仅 env、无 hooks）整体覆写
 * ~/.claude/settings.json，抹掉 hooks → 审批链路第一环静默断开（08-06/08-07/08-08
 * 三次回归，M14 启动幂等只能兜"启动前被清"，兜不住"启动后被覆写"）。
 * 实测：Claude Code 2.1.207 从用户级 settings.local.json 加载 hooks（官方文档标
 * "project only"，实测用户级生效，以实测为准），且 cc-switch 不碰此文件 → 迁移后免疫。
 * 注意：hooks 跨层级合并，同一 approve.sh 绝不能同时在 settings.json 与 settings.local.json
 * 都注册（会双执行 → 双卡/双落库），故主注册位固定 local。
 */
/** fs.watch 监听目录 ~/.claude/ 下这两个文件，任一被外部覆写即防抖补注册 */
const WATCH_FILENAMES = ['settings.json', 'settings.local.json']
const WATCH_DEBOUNCE_MS = 500

/**
 * M14 — PreToolUse hook 自动注册（启动时幂等确保，DESIGN §6.13）
 *
 * 目标：approve.sh 作为 Claude Code 的 PreToolUse hook 恒在 settings 里注册，
 * 避免 delete/覆盖/工具重置后审批链路第一环静默断开（2026-08-07 实测回归：
 * ~/.claude/settings.json 的 hooks 被清空 → server 在跑但收不到审批请求）。
 *
 * 主注册位：~/.claude/settings.local.json（见文件头注释，M17 起迁移，免疫 cc-switch 覆写）。
 *
 * 只做**幂等合并**：读 settings JSON → 若 PreToolUse 已含指向 approve.sh 的
 * 条目则不动；否则追加（保留 permissions 等既有配置，绝不整体覆盖）。
 * matcher 空串 = 匹配所有工具（审批镜像轮起，§6.13.2）；timeout 70000ms ＞
 * curl -m 65 ＞ server 60s auto-deny（§6.13 实测，写 70 会被 70ms 即杀）。
 *
 * 纯 node + 只读/定点写一个文件，可裸 node 自测。失败不抛（NFR-3）：
 * settings 不可读/不可写/JSON 损坏 → warn + 静默跳过，不阻断应用启动
 * （审批是可降级功能，退化到终端原生询问，安全无害）。
 */

/** 单条 PreToolUse hook 条目（approve.sh 全工具中继） */
function buildHookEntry(approveScriptPath: string): unknown {
  return {
    matcher: '',
    hooks: [{ type: 'command', command: approveScriptPath, timeout: 70000 }]
  }
}

/** 该 settings 文件是否已注册指向 approve.sh 的 PreToolUse 条目（按路径尾部匹配，幂等判据） */
function isRegistered(parsed: Record<string, unknown>, approveScriptPath: string): boolean {
  const preToolUse = (parsed['hooks'] as Record<string, unknown> | undefined)?.['PreToolUse']
  if (!Array.isArray(preToolUse)) return false
  return preToolUse.some((entry) => {
    if (typeof entry !== 'object' || entry === null) return false
    const hooks = (entry as Record<string, unknown>)['hooks']
    if (!Array.isArray(hooks)) return false
    return hooks.some(
      (h) =>
        typeof h === 'object' &&
        h !== null &&
        (h as Record<string, unknown>)['type'] === 'command' &&
        String((h as Record<string, unknown>)['command'] ?? '').endsWith(approveScriptPath)
    )
  })
}

/**
 * 幂等确保 approve.sh 注册进指定 settings 文件（~ 前缀展开）。
 * 已注册 → 不动；未注册 → 追加。任何失败 → warn + 返回 false（不抛，NFR-3）。
 */
export function ensureHookRegistered(settingsPath: string, approveScriptPath: string): boolean {
  const expanded = settingsPath === '~' ? homedir() : settingsPath.startsWith('~/') ? join(homedir(), settingsPath.slice(2)) : settingsPath

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(readFileSync(expanded, 'utf8')) as Record<string, unknown>
  } catch (err) {
    console.warn(`[hook-installer] 读取 ${expanded} 失败（文件缺失/损坏），跳过自动注册: ${(err as Error).message}`)
    return false
  }

  if (isRegistered(parsed, approveScriptPath)) return true // 已注册，幂等

  const hooks = (parsed['hooks'] ?? {}) as Record<string, unknown>
  const preToolUse = Array.isArray(hooks['PreToolUse']) ? (hooks['PreToolUse'] as unknown[]) : []
  preToolUse.push(buildHookEntry(approveScriptPath))
  hooks['PreToolUse'] = preToolUse
  parsed['hooks'] = hooks

  try {
    writeFileSync(expanded, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
    console.log(`[hook-installer] 已注册 PreToolUse hook → ${expanded}`)
    return true
  } catch (err) {
    console.warn(`[hook-installer] 写入 ${expanded} 失败，自动注册未生效: ${(err as Error).message}`)
    return false
  }
}

/**
 * 监听 ~/.claude/ 下 settings 文件，外部覆写清空 hooks 后自动补注册（防抖）。
 *
 * 必要性：M14 只在启动时注册一次，兜不住"启动后被覆写"（cc-switch 热切换 provider
 * 整体覆写 settings.json，08-08 实测：实例 13:02 启动 → 13:33 被覆写 → 审批静默断开）。
 * 此处对 settings.json / settings.local.json 任一变更防抖重新 ensure 到 localSettingsPath
 * （主注册位，见文件头），把断链窗口从"直到重启"压到几百 ms。
 * 失败不抛（NFR-3）；watch 自身不可用（如 fs 无 inotify）则 warn 一次后放弃，
 * 退化为"仅启动注册"。
 *
 * 返回 stop 函数供 will-quit 释放，避免已退出进程句柄残留。
 */
export function startHookWatcher(
  settingsDir: string,
  localSettingsPath: string,
  approveScriptPath: string
): () => void {
  let watcher: ReturnType<typeof watch> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const debounced = (filename: string | null): void => {
    if (filename && !WATCH_FILENAMES.includes(filename)) return // 只关心两个 settings 文件
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      ensureHookRegistered(localSettingsPath, approveScriptPath)
    }, WATCH_DEBOUNCE_MS)
  }

  try {
    watcher = watch(settingsDir, (_eventType, filename) => debounced(filename))
  } catch (err) {
    console.warn(`[hook-installer] fs.watch 不可用，退化仅启动注册: ${(err as Error).message}`)
    return () => {}
  }

  return () => {
    if (timer) clearTimeout(timer)
    timer = null
    watcher?.close()
    watcher = null
  }
}