import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

/**
 * M12 — 权限镜像模块（DESIGN §6.14 / TASKS §15）
 *
 * 目标：**工具审批面 ≡ 终端原生询问面**。`mirrorFilter()` 判定"终端此刻会不会弹
 * 原生询问"——不会 → `'passthrough'`（工具完全静默）；会 → `'ask'`（进审批流弹卡）。
 * 终端二问的压制由 approve.sh 放行时输出权限 JSON 完成（§6.13.4，Plan A）。
 *
 * 纯函数 + 只读文件，裸 node 可测（同 config.ts / deepseek.ts 模式，**不 import electron**）。
 *
 * 规则来源：四层 settings 的 `permissions.allow` / `permissions.deny` 并集（§6.14.3），
 * 按文件 mtime 缓存。项目层（③④）路径含 cwd，故"按文件路径缓存" ≡ "按 cwd 键缓存"
 * （不同会话 cwd 不同 → 项目层文件路径不同 → 缓存天然隔离）。
 *
 * 规则匹配为**子集实现，偏差方向恒无害**（§6.14.4）：passthrough 误判 → 引擎仍弹原生
 * 询问（用户在终端决定，无害）；ask 误判 → 多弹一张卡（本模块的质量指标即消除它）。
 */

// ─── 类型 ───

/** 四层 settings 合并后的 allow/deny 规则并集 */
export interface MergedRules {
  allow: string[]
  deny: string[]
}

/** mirrorFilter 的判定结果 */
export type MirrorVerdict = 'passthrough' | 'ask'

// ─── mtime 缓存（按文件绝对路径键；项目层路径含 cwd，天然按 cwd 隔离） ───

interface RulesCacheEntry {
  mtimeMs: number
  rules: MergedRules
}

const rulesCache = new Map<string, RulesCacheEntry>()

// ─── 小工具 ───

/** `~` / `~/…` 展开为 home（homedir() 每次调用新鲜取值，尊重运行时 HOME） */
function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return p
}

/** 安全取对象字符串字段（缺失/非字符串 → 空串） */
function strField(obj: Record<string, unknown>, key: string): string {
  const v = obj[key]
  return typeof v === 'string' ? v : ''
}

/** unknown → 字符串数组（过滤非字符串元素；非数组 → 空） */
function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

// ─── 规则来源与合并（§6.14.3） ───

/**
 * 读取单层 settings 的 permissions.allow/deny。
 * - 文件缺失（statSync 抛错）→ 该层视为空
 * - JSON 损坏 / 解析失败 → 该层视为空（不抛）
 * - 按文件 mtime 缓存：mtimeMs 未变直接复用解析结果（statSync 廉价重校验，无需 fs.watch）
 */
function readLayerRules(filePath: string): MergedRules {
  let mtimeMs: number
  try {
    mtimeMs = statSync(filePath).mtimeMs
  } catch {
    return { allow: [], deny: [] }
  }

  const cached = rulesCache.get(filePath)
  if (cached !== undefined && cached.mtimeMs === mtimeMs) return cached.rules

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return { allow: [], deny: [] }
  }

  const perms = (parsed as { permissions?: unknown } | null)?.permissions
  const permsObj = (typeof perms === 'object' && perms !== null ? perms : {}) as {
    allow?: unknown
    deny?: unknown
  }
  const rules: MergedRules = {
    allow: toStringArray(permsObj.allow),
    deny: toStringArray(permsObj.deny)
  }
  rulesCache.set(filePath, { mtimeMs, rules })
  return rules
}

/**
 * 合并四层 settings 的 allow/deny 并集（与 Claude Code 权限合并语义一致）：
 *   ① ~/.claude/settings.json  ② ~/.claude/settings.local.json
 *   ③ <cwd>/.claude/settings.json  ④ <cwd>/.claude/settings.local.json
 * 缺失/损坏层视为空（不抛）。
 */
export function loadMergedRules(cwd: string): MergedRules {
  const home = homedir()
  const layers = [
    join(home, '.claude', 'settings.json'),
    join(home, '.claude', 'settings.local.json'),
    join(cwd, '.claude', 'settings.json'),
    join(cwd, '.claude', 'settings.local.json')
  ]
  const allow: string[] = []
  const deny: string[] = []
  for (const layer of layers) {
    const r = readLayerRules(layer)
    allow.push(...r.allow)
    deny.push(...r.deny)
  }
  return { allow, deny }
}

// ─── 规则解析 ───

interface ParsedRule {
  tool: string
  /** 括号内参数；裸工具名（无括号）为 undefined */
  arg: string | undefined
}

/** `Tool(arg)` → {tool, arg}；裸名 / 畸形括号 → {tool: 全名, arg: undefined}。首个 `(` 与末个 `)` 定界（arg 内可含括号） */
function parseRule(rule: string): ParsedRule {
  const open = rule.indexOf('(')
  if (open === -1) return { tool: rule.trim(), arg: undefined }
  const close = rule.lastIndexOf(')')
  if (close <= open) return { tool: rule.trim(), arg: undefined }
  return { tool: rule.slice(0, open).trim(), arg: rule.slice(open + 1, close) }
}

// ─── 单规则匹配（§6.14.4 子集语义） ───

/** 工具级裸名匹配：精确相等，或尾部 `*` 前缀（如 `mcp__github__*`） */
function matchToolName(ruleName: string, tool: string): boolean {
  if (ruleName.endsWith('*')) return tool.startsWith(ruleName.slice(0, -1))
  return ruleName === tool
}

/** 名称参数匹配（Skill(name)）：精确或尾部 `*` 前缀 */
function matchNameArg(arg: string, actual: string): boolean {
  const a = arg.trim()
  if (a.endsWith('*')) return actual.startsWith(a.slice(0, -1))
  return a === actual
}

/**
 * 单个 Bash 子命令对单条 Bash 规则：
 *   `Bash(cmd)` 精确相等；`Bash(cmd *)` / `Bash(cmd:*)` 前缀（剥尾 `*` 与可选 `:`）。
 */
function matchBashSingle(ruleArg: string, command: string): boolean {
  const rule = ruleArg.trim()
  const cmd = command.trim()
  if (rule.endsWith('*')) {
    let prefix = rule.slice(0, -1)
    if (prefix.endsWith(':')) prefix = prefix.slice(0, -1)
    return cmd.startsWith(prefix)
  }
  return cmd === rule
}

/** 转义正则特殊字符（glob → RegExp 用） */
function escapeRegexChar(c: string): string {
  return c.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

/** 路径 glob → RegExp：`**`→`.*`、`*`→`[^/]*`，其余字面转义 */
function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*'
        i++
      } else {
        re += '[^/]*'
      }
    } else {
      re += escapeRegexChar(c as string)
    }
  }
  return new RegExp(`^${re}$`)
}

/**
 * 路径 glob 匹配（Read/Edit/Write）：
 *   规则路径——首部 `//` 视作绝对（`//sys/**` → `/sys/**`，与终端写入形式一致）、
 *   `~` 展开、相对路径按 cwd 解析；实际路径同样归一为绝对后做 glob 全匹配。
 */
function matchPathGlob(ruleArg: string, actualPath: string, cwd: string): boolean {
  if (actualPath === '') return false
  let rulePath = ruleArg.trim()
  if (rulePath.startsWith('//')) rulePath = '/' + rulePath.slice(2)
  const expanded = expandHome(rulePath)
  const absRule = isAbsolute(expanded) ? expanded : join(cwd, expanded)
  return globToRegExp(absRule).test(resolveAbsPath(actualPath, cwd))
}

/** 实际路径归一为绝对：`~` 展开；相对按 cwd */
function resolveAbsPath(p: string, cwd: string): string {
  const expanded = expandHome(p)
  return isAbsolute(expanded) ? expanded : join(cwd, expanded)
}

/** WebFetch(domain:host)：URL hostname === host 或以 `.host` 结尾（含子域） */
function matchWebFetchDomain(arg: string, url: string): boolean {
  const a = arg.trim()
  const prefix = 'domain:'
  if (!a.startsWith(prefix)) return false
  const host = a.slice(prefix.length).trim().toLowerCase()
  if (host === '') return false
  let hostname: string
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  return hostname === host || hostname.endsWith(`.${host}`)
}

/** 单条规则是否命中该工具调用（非 Bash 单目标；Bash 的复合语义在上层处理） */
function matchesRule(
  rule: string,
  tool: string,
  toolInput: Record<string, unknown>,
  cwd: string
): boolean {
  const { tool: rTool, arg } = parseRule(rule)
  if (arg === undefined) return matchToolName(rTool, tool)
  if (rTool !== tool) return false
  switch (tool) {
    case 'Bash':
      return matchBashSingle(arg, strField(toolInput, 'command'))
    case 'Read':
    case 'Edit':
    case 'Write':
      return matchPathGlob(arg, strField(toolInput, 'file_path'), cwd)
    case 'WebFetch':
      return matchWebFetchDomain(arg, strField(toolInput, 'url'))
    case 'Skill':
      return matchNameArg(arg, strField(toolInput, 'skill') || strField(toolInput, 'name'))
    default:
      return false
  }
}

// ─── 复合 Bash 命令切分（§6.14.4） ───

/**
 * 按顶层分隔符切分命令：`;` `&&` `||` `|` 与换行。引号内分隔符不误切（quote-aware）；
 * 更深的命令替换嵌套误切属已知边界 → 偏差方向为多弹卡（无害）。
 */
function splitTopLevel(command: string): string[] {
  const parts: string[] = []
  let cur = ''
  let quote: string | null = null
  for (let i = 0; i < command.length; i++) {
    const c = command[i] as string
    if (quote !== null) {
      cur += c
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      cur += c
      continue
    }
    if (c === '\n' || c === ';') {
      parts.push(cur)
      cur = ''
      continue
    }
    if (c === '&' && command[i + 1] === '&') {
      parts.push(cur)
      cur = ''
      i++
      continue
    }
    if (c === '|' && command[i + 1] === '|') {
      parts.push(cur)
      cur = ''
      i++
      continue
    }
    if (c === '|') {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  parts.push(cur)
  return parts.map((p) => p.trim()).filter((p) => p.length > 0)
}

/**
 * 规则集是否覆盖该工具调用。
 * - Bash：切分子命令——`every`（allow 语义）**全部**子命令各被某条规则覆盖才算命中；
 *   `some`（deny 语义）任一子命令被覆盖即命中（交还引擎原生拦截）。裸 `Bash` 规则覆盖一切。
 * - 非 Bash：单一目标，some/every 等价于"存在规则命中"。
 */
function ruleCoversTool(
  tool: string,
  toolInput: Record<string, unknown>,
  cwd: string,
  rules: string[],
  quantifier: 'every' | 'some'
): boolean {
  if (tool === 'Bash') {
    const subs = splitTopLevel(strField(toolInput, 'command'))
    if (subs.length === 0) return false
    const parsed = rules.map(parseRule)
    const bareBash = parsed.some((r) => r.tool === 'Bash' && r.arg === undefined)
    if (bareBash) return true
    const bashArgs = parsed
      .filter((r) => r.tool === 'Bash' && r.arg !== undefined)
      .map((r) => r.arg as string)
    const covered = (sub: string): boolean => bashArgs.some((arg) => matchBashSingle(arg, sub))
    return quantifier === 'every' ? subs.every(covered) : subs.some(covered)
  }
  return rules.some((r) => matchesRule(r, tool, toolInput, cwd))
}

/** Read 默认表：解析后路径在 cwd 内 → passthrough */
function isWithinCwd(absPath: string, cwd: string): boolean {
  if (absPath === cwd) return true
  const base = cwd.endsWith('/') ? cwd : `${cwd}/`
  return absPath.startsWith(base)
}

// ─── 对外主入口（§6.14.2） ───

/**
 * 判定"终端此刻会不会弹原生询问"。求值顺序（短路）：
 *   1. bypassPermissions → passthrough（该模式终端从不询问）
 *   2. acceptEdits 且编辑类（Edit/Write/NotebookEdit）→ passthrough
 *   3. 命中 deny 规则 → passthrough（交还引擎原生拦截，保持终端语义）
 *   4. 命中 allow 规则 → passthrough
 *   5. 工具默认表：Read 且路径在 cwd 内 → passthrough；
 *      其余（Bash/Edit/Write/WebFetch/WebSearch/Skill/mcp__ 通配/Read 越界/未知）→ ask
 *   6. plan 模式按 default 处理（宁可多弹卡，失败模式无害）
 */
export function mirrorFilter(
  tool: string,
  toolInput: Record<string, unknown>,
  cwd: string,
  permissionMode: string
): MirrorVerdict {
  const mode = permissionMode === '' ? 'default' : permissionMode

  // 1. bypassPermissions：终端从不询问
  if (mode === 'bypassPermissions') return 'passthrough'
  // 2. acceptEdits + 编辑类：终端不问（plan/default 不命中此分支）
  if (mode === 'acceptEdits' && (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit')) {
    return 'passthrough'
  }

  const { allow, deny } = loadMergedRules(cwd)

  // 3. deny 命中 → passthrough（任一子命令被 deny 覆盖即交还引擎原生拦截）
  if (ruleCoversTool(tool, toolInput, cwd, deny, 'some')) return 'passthrough'
  // 4. allow 命中 → passthrough（Bash 复合需全部子命令覆盖）
  if (ruleCoversTool(tool, toolInput, cwd, allow, 'every')) return 'passthrough'

  // 5. 工具默认表
  if (tool === 'Read') {
    const filePath = strField(toolInput, 'file_path')
    if (filePath !== '' && isWithinCwd(resolveAbsPath(filePath, cwd), cwd)) return 'passthrough'
    return 'ask' // Read 越界 / 路径缺失 → ask
  }

  // Bash/Edit/Write/WebFetch/WebSearch/Skill/mcp__ 通配/未知工具 → 无规则命中即 ask
  return 'ask'
}

// ─── 审批卡内容单一真源（§6.5 前置管线） ───

/**
 * 从 toolInput 按工具构建审批卡展示的摘要：
 *   Bash: command；Edit/Write/Read: file_path；WebFetch: url；WebSearch: query；
 *   其余 / 缺字段: 截断 JSON（~200 字符）。修复旧版 approve.sh 字段错位导致的空卡 bug。
 */
export function buildCommandSummary(tool: string, toolInput: Record<string, unknown>): string {
  switch (tool) {
    case 'Bash': {
      const c = strField(toolInput, 'command')
      if (c !== '') return c
      break
    }
    case 'Edit':
    case 'Write':
    case 'Read': {
      const f = strField(toolInput, 'file_path')
      if (f !== '') return f
      break
    }
    case 'WebFetch': {
      const u = strField(toolInput, 'url')
      if (u !== '') return u
      break
    }
    case 'WebSearch': {
      const q = strField(toolInput, 'query')
      if (q !== '') return q
      break
    }
    default:
      break
  }
  let json = ''
  try {
    json = JSON.stringify(toolInput) ?? ''
  } catch {
    json = ''
  }
  return json.length > 200 ? `${json.slice(0, 200)}…` : json
}
