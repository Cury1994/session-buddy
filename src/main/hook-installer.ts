import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * M14 — PreToolUse hook 自动注册（启动时幂等确保，DESIGN §6.13）
 *
 * 目标：approve.sh 作为 Claude Code 的 PreToolUse hook 恒在 settings 里注册，
 * 避免 delete/覆盖/工具重置后审批链路第一环静默断开（2026-08-07 实测回归：
 * ~/.claude/settings.json 的 hooks 被清空 → server 在跑但收不到审批请求）。
 *
 * 只做**幂等合并**：读 settings JSON → 若 PreToolUse 已含指向 approve.sh 的
 * 条目则不动；否则追加（保留 env/model 等既有配置，绝不整体覆盖）。
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