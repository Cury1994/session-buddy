# harness-monitor — 任务文档

> 版本 v2.3 | 2026-07-27 | Electron 全量重写 · 340px 悬浮挂件
>
> **v2.3 变更**（蓝图裁剪，用户逐项确认）：
> - **砍假数据**：用量视图删统计卡（今日 token / 本月用量 / 千 token 均价——DeepSeek API 不返回）与余额进度条（API 不返回总预算）；`api_usage` 表删三列；告警阈值改 ¥ 绝对金额（默认 10）；趋势线改画 30 天**余额**走势（原生 SVG，删 recharts 依赖）
> - **删想象规模**：端口冲突改"提示退出"（删 port+1..+10 重试与 server.port 文件协议）；终端跳转只留 kgx/gnome-terminal；Session 发现只扫配置目录（删多 profile 自动发现）；busy/idle 改进程存活判定（删 CPU 阈值 / 进程树）
> - **延后项**（REQUIREMENTS §5）：打包 + 开机自启（D1）/ 终端并行审批（D2）/ 审批超时配置（D3）移出本轮，原 M11 打包模块删除，链路 12→**11 模块**
> - 时间戳统一本地时间（`datetime('now','localtime')`），M3 review 的时区时限 P2 在 **M3 schema 返工**中直接解决，不再是 M7 决策点
> - 新增 **M3 schema 返工**任务（删三列 + localtime + 类型精简 + autostart 字段移除）
>
> **v2.2 变更**（链路合并 16→12）：旧 M6+M7+M8→新 M6 数据服务+调度；旧 M9+M10→新 M7 IPC+挂件壳；旧 M14 通知+颜色联动拆入新 M5（审批侧）/ 新 M6（余额侧）。

---

## 1. 模块总览与优先级

```
Phase 1 ──── 基础设施
  M1  项目骨骼                     [P0]  1.5h   ✅
  M2  配置管理                     [P0]  1h     ✅
  M3  数据库 (+ v2.3 schema 返工)  [P0]  1h+0.5h ✅(返工中)
  M4  系统托盘 + 窗口管理           [P0]  2h
────────────────────────────────────────────
Phase 2 ──── 后端服务
  M5  HTTP Server + 审批队列 + 审批联动   [P0]  2.5h
  M6  数据服务 + 调度 + 余额联动          [P0]  2.5h
────────────────────────────────────────────
Phase 3 ──── 前端 UI
  M7  IPC 通道 + 挂件壳             [P0]  3h
  M8  用量视图 (余额卡 + 余额趋势线)   [P0]  1h
  M9  Sessions 视图 (SessionCard/ApprovalBlock/History) [P0] 3h
  M10 设置视图 (SettingsView)            [P1]  1.5h
────────────────────────────────────────────
Phase 4 ──── 集成
  M11 端到端测试 + approve.sh      [P0]  1.5h
────────────────────────────────────────────
                          剩余合计 ~17.5h
延后项（本轮不做）：D1 打包+开机自启 / D2 终端并行 / D3 审批超时配置
```

### 优先级定义

| 级别 | 含义 |
|------|------|
| P0 | 核心功能，必须实现，否则产品不可用 |
| P1 | 重要功能，增强用户体验 |
| P2 | 锦上添花，已移入延后项（§13） |

### 依赖关系

```
M1 (骨骼)
 ├─ M2 (配置)
 ├─ M3 (数据库) ← v2.3 schema 返工
 └─ M4 (Tray+Window)
      └─ M5 (Server + 审批队列 + 审批联动)
           └─ M6 (数据服务 + 调度 + 余额联动)   ← 需 M5 的 approvalQueue 合并审批状态
                └─ M7 (IPC + 挂件壳)
                     ├─ M8  (用量视图)
                     ├─ M9  (Sessions 视图)
                     └─ M10 (设置视图)
                          └─ M11 (端到端测试 + approve.sh)
```

### 跨模块遗留项登记（随模块关闭核销）

| 遗留项 | 来源 | 归属 |
|--------|------|------|
| 时区：datetime('now') UTC 存储问题 | M3 review（时限 P2） | **M3 返工解决**：统一 `datetime('now','localtime')`，types 时间戳标注本地时间 |
| UsageDailyAggregate 迁入 shared | M3 遗留 | **M3 返工**：更名 `BalanceDailySnapshot` 并迁入 shared/types.ts |
| autostart 字段移除（AppConfig + config.yaml） | v2.3 裁剪 | **M3 返工**一并处理 |
| saveConfig 成功反馈设计（返回值 / 失败 UI 提示） | M2 review 延后项 | M10（设置视图一并设计） |
| sandbox:false 决策记录 + CSP meta | M1 review 延后项 | M7 |
| recharts 依赖移除（package.json + lockfile） | v2.3 裁剪 | M8（原生 SVG 替代后移除） |
| chrome-sandbox SUID 4755 固化 | M1 遗留 | 延后项 D1（随打包处理） |

---

## 2. M1 — 项目骨骼

**输入**：无（从零开始）
**输出**：可启动的 Electron 窗口
**依赖**：无

### 任务
1. 创建 npm 项目 + `git init`
2. 安装依赖（electron, electron-vite, react, react-dom, typescript, tailwindcss, postcss, autoprefixer, better-sqlite3, express, yaml, recharts）
3. 安装 devDependencies（@types/react, @types/react-dom, @types/express, @types/better-sqlite3, @types/node, electron-builder, @vitejs/plugin-react）
4. 配置 electron.vite.config.ts（main/preload/renderer 三入口）
5. 配置 tsconfig.json / tsconfig.node.json / tsconfig.web.json
6. 配置 tailwind.config.ts（content paths + 浅色毛玻璃主题 extend，见 DESIGN §2.2）
7. 配置 postcss.config.js
8. 创建 `src/main/index.ts`（最小 app ready + window 创建）
9. 创建 `src/preload/index.ts`（空 contextBridge）
10. 创建 `src/renderer/index.html` + `main.tsx` + `App.tsx`（最小 React 渲染）
11. 创建 `src/renderer/globals.css`（Tailwind directives + 浅色毛玻璃 CSS 变量，见 DESIGN §2.2）
12. 创建 `config.yaml`（默认配置）
13. 创建 `.gitignore`（node_modules, out, dist, .venv）

### 验收标准
```bash
cd harness-monitor
npm install
npm run dev
# → Electron 窗口弹出，显示 "Hello harness-monitor"
# → Tailwind 浅色毛玻璃背景生效
```

---

## 3. M2 — 配置管理

**输入**：M1（项目骨架）
**输出**：类型安全的配置加载模块
**依赖**：无

### 任务
1. 实现 `src/main/config.ts`：
   - `loadConfig()`：按优先级加载 YAML（项目内置 → `~/.config/harness-monitor/` → `~/.config/claude-monitor/`）
   - `deepMerge(defaults, overrides)`：递归合并
   - 类型化返回 `AppConfig`（嵌套结构 `providers:` / `harnesses:`，可扩展）
2. 实现 `saveConfig(partial)`：deep merge 用户修改 → 写回 `~/.config/harness-monitor/config.yaml`
3. 类型定义（内联在 config.ts 或单独 types.ts）

### 验收标准
```bash
# 无用户配置时加载默认值
node -e "require('./out/main/config').loadConfig()"
# → 打印完整配置对象，port=18456

# 用户配置覆盖
mkdir -p ~/.config/harness-monitor
printf 'server:\n  port: 9999\n' > ~/.config/harness-monitor/config.yaml
# → port=9999，其他保持默认
# 注：用 printf（bash echo 不展开 \n，会写入字面量）；验证后删除测试文件
```

---

## 4. M3 — 数据库（含 v2.3 schema 返工）

**输入**：M1 + M2（配置）
**输出**：SQLite 初始化 + DAO 方法
**依赖**：better-sqlite3 已安装

### 任务（v2.3 返工后终态）
1. 实现 `src/main/db.ts`：
   - `constructor(dbPath?)`: 默认路径 `app.getPath('userData')/monitor.db`（Linux 下 `~/.config/harness-monitor/monitor.db`）
   - `initDB()`: 建表（api_usage + approval_history + 索引），WAL 模式；时间戳默认值 `datetime('now','localtime')`
   - `recordUsage(provider, model, balance, currency)`: INSERT（**v2.3：删 todayTokens/monthUsed/totalBudget 三参数**——API 不返回，原为假数据）
   - `getLatestUsage()`: SELECT MAX(id) GROUP BY provider, model
   - `get30DayBalance(provider, model)`: 每日取 MAX(id) 快照的 balance（**v2.3：原 get30DayUsage 按 token 求和 → 改按日取余额快照**，返回 `BalanceDailySnapshot[]`）
   - `recordApproval(harness, sessionName, command, cwd, allowed)`: INSERT
   - `getRecentApprovals(limit = 20)`: SELECT ORDER BY timestamp DESC, id DESC LIMIT ?
   - `close()`: 关闭连接
2. `src/shared/types.ts` 同步精简：`UsageRecord` 删三字段、`BalanceInfo` 仅 provider/balance/currency、新增 `BalanceDailySnapshot {day, balance}`（替代 db.ts 的 UsageDailyAggregate 并迁入 shared）；`AppConfig` 删 `autostart` 段；时间戳字段注释标注本地时间
3. 项目根 `config.yaml` 删 `autostart:` 段，`balance_warn_threshold: 10`

### 验收标准（v2.3 返工后）
```bash
rm -f /tmp/test-monitor.db*
node -e "
const {AppDatabase} = require('./out/main/db');
const db = new AppDatabase('/tmp/test-monitor.db');
db.initDB();
db.recordUsage('deepseek', 'all', 342.18, 'CNY');
console.log(db.getLatestUsage());  // [{provider:'deepseek', balance:342.18, balanceCurrency:'CNY', timestamp:'YYYY-MM-DD HH:MM:SS'(本地时间)}]
console.log(db.get30DayBalance('deepseek', 'all'));  // [{day:'YYYY-MM-DD', balance:342.18}]
db.recordApproval('claude-code', 'cury-6d', 'sudo echo test', '/tmp', true);
console.log(db.getRecentApprovals(5));  // [{command:'sudo echo test', allowed:true, ...}]
db.close();
"
# → 两表读写正常；timestamp 为本地时间；SQLite 文件存在
# → 旧 schema 遗留：~/.config/harness-monitor/monitor.db（M1~M3 开发期生成，如有）直接删除重建，无需迁移（无真实数据）
```

---

## 5. M4 — 系统托盘 + 窗口管理

**输入**：M1 + M2
**输出**：Tray 图标 + 可显示/隐藏的窗口
**依赖**：electron 已安装

### 任务
1. 实现 `src/main/tray.ts`：
   - `createTray(config, window)`:
     - 生成 SVG data URL（22×22 圆点 + 外发光）
     - `nativeImage.createFromDataURL()` → `new Tray(nativeImage)`
     - 右键菜单（原生 Menu，结构见 DESIGN §6.3）：`Harness Monitor`(label) / Show Dashboard ⌘O / Hide Dashboard ⌘H / ── / Active Agents(动态 session 列表：状态点+名称+项目名) / ── / Preferences... ⌘, / ── / Quit ⌘Q
     - Active Agents 项在 `right-click` 事件用最新 session 快照重建
     - 左键 → toggle 窗口
   - `setIconColor(color: 'green'|'amber'|'red'|'gray')`：重新生成 SVG + setImage
   - `getCurrentColor()` → 当前颜色
2. 实现 `src/main/window.ts`：
   - `createMainWindow(config)`:
     - BrowserWindow: 宽高读 `config.window`（默认 340×650），frame:false, resizable:true, skipTaskbar:false, 圆角 16px（见 DESIGN §2.9/§6.4）
     - blur → hide (unless pinned)
   - `togglePin(pinned)` → alwaysOnTop 切换
3. 更新 `src/main/index.ts`：
   - `app.requestSingleInstanceLock()` → 拒绝重复实例
   - `app.whenReady()` → 创建 window + tray
   - `app.on('window-all-closed')` → 不做 quit（tray 保持运行）
   - `app.on('will-quit')` → 清理 tray

### 验收标准
```bash
npm run dev
# → 系统托盘出现绿色圆点
# → 左键点击 → 窗口弹出（340×650，浅色毛玻璃，圆角 16px）
# → 右键 → Show/Hide Dashboard + Active Agents + Preferences + Quit 菜单
# → 点击窗口外区域 → 窗口自动隐藏
# → 点击 📌 → 窗口置顶不隐藏
```

---

## 6. M5 — HTTP Server + 审批队列 + 审批联动

**输入**：M3（DB）+ M4（Window + Tray）
**输出**：Express HTTP API + 阻塞式审批机制 + 通知工具模块 + 审批侧颜色联动
**依赖**：express 已安装
**合并自**：旧 M5（Server + 审批队列）+ 旧 M14 审批侧（notifyApproval + 橙/绿切换）

### 任务
1. 实现 `src/main/approval-queue.ts`：
   - `enqueue(payload)` → `{id, promise}` + 60s setTimeout auto-deny；`id = crypto.randomUUID()`（见 DESIGN §6.6）
   - `respond(id, allowed)` → resolve promise → 返回是否成功
   - `getAll()` → 所有 pending 列表
   - `size` → getter
2. 实现 `src/main/notifications.ts`（通知工具模块，本模块创建，两类通知都实现；`notifyBalanceLow` 由 M6 调用）：
   - `notifyApproval(payload)` → `new Notification({ title, body: "Session X requests approval", ... })`
   - `notifyBalanceLow(balance, currency)` → `new Notification(...)`
   - 检查 `config.notifications.enabled` 开关（关闭则静默）
   - 通知点击 → `win.show()`
3. 实现 `src/main/server.ts`：
   - `createServer(db, approvalQueue, window, tray)`:
     - Express app + JSON 中间件
     - `GET /health` → `{status:"ok"}`
     - `GET /api/usage` → `db.getLatestUsage()`
     - `GET /api/sessions` → `sessionScanner.getSessions()`（scanner 在 M6 注入，本模块先留注入口）
     - `GET /api/approvals` → `approvalQueue.getAll()`
     - `POST /approve` → `approvalQueue.enqueue()` → **tray 置橙 + notifyApproval** → `await promise` → 返回
     - `POST /approve/:id/respond` → `approvalQueue.respond()` → **队列空时按颜色优先级协议复位 tray** → 返回
   - `start(port)` / `stop()` 生命周期
   - **EADDRINUSE 处理（v2.3 简化，见 DESIGN §6.5）**：探测 `/health` 判断是否本应用旧实例（是则正常退出）；否则桌面通知/日志提示"端口 18456 被占用，请关闭占用程序后重启"→ 退出(1)。**不做端口重试，不写端口文件**
4. **颜色优先级协议**（M5 定义，M6 余额侧共同遵循）：
   - 优先级：**红（余额 < ¥ 阈值）> 橙（待审批）> 绿（空闲）**
   - 队列清空复位绿色前，须检查余额告警是否活跃（查 db 最新 usage 对比阈值，或维护共享告警标志，实现方自定）；活跃则保持红
   - 协议落点写入代码注释，供 M6 对照

### 验收标准
```bash
npm run dev
curl http://127.0.0.1:18456/health  # → {"status":"ok"}
curl http://127.0.0.1:18456/api/sessions  # → []

# 终端 1 (阻塞)：
curl -X POST http://127.0.0.1:18456/approve \
  -H "Content-Type: application/json" \
  -d '{"harness":"claude-code","session":"test","command":"ls"}'
# (挂起等待)
# → 桌面通知弹出 "Session test requests approval"（config.notifications.enabled=true 时）
# → tray 图标变橙

# 终端 2：
curl -X POST http://127.0.0.1:18456/approve/<id>/respond \
  -H "Content-Type: application/json" \
  -d '{"allowed":true}'
# 终端 1 立即返回 {"allowed":true}（<id> 为 enqueue 返回的 UUID）
# → 队列清空且无余额告警 → tray 回绿

# 端口占用：另起实例占住 18456 后启动 → 提示端口被占用并退出，不崩溃、不试其他端口
```

---

## 7. M6 — 数据服务 + 调度 + 余额联动

**输入**：M2（Config）+ M3（DB）+ M4（Tray）+ M5（approvalQueue，供扫描合并审批状态；颜色优先级协议）
**输出**：DeepSeek 余额查询 + Claude Code Session 扫描（v2.3 简化版）+ 定时调度 + 余额侧颜色联动
**依赖**：Node 内置 fetch / fs / child_process（无新 native 依赖）
**合并自**：旧 M6（DeepSeek）+ 旧 M7（Session 发现）+ 旧 M8（定时调度）+ 旧 M14 余额侧

### 任务
1. 实现 `src/main/deepseek.ts`：
   - `DeepSeekProvider` class
   - `constructor(config)`: 读 `process.env.DEEPSEEK_API_KEY` + balance_url
   - `async checkBalance()`:
     - fetch with `Authorization: Bearer $KEY` + `AbortSignal.timeout(15000)`
     - 解析 `balance_infos[0]`：`parseFloat(total_balance)`→balance、`currency`→currency；`is_available=false` 视为不可用（字段映射见 DESIGN §6.7）
     - 返回 `BalanceInfo {provider, balance, currency}` 或 null（key 缺失 / 网络错误 / 解析失败）
   - 错误处理：非 200 → log warning → return null；JSON 异常 → return null
2. 实现 `src/main/claude-sessions.ts`（**v2.3 简化版**）：
   - `ClaudeCodeSessionScanner` class
   - `constructor(config)`: 读 sessions 目录 + settings_path（仅 `config.harnesses['claude-code'].config_dirs` 列表，**不做自动发现**，见 DESIGN §6.8.1）
   - `async discoverSessions()`:
     - 扫描 config_dirs 各目录的 sessions/，`fs.readdir` + filter `*.json`
     - For each file:
       - `JSON.parse` → pid, sessionId, name(cwd basename), cwd, startedAt（字段清理见 DESIGN §6.8.2b）
       - `readFile(/proc/{pid}/stat)` → 第 22 字段 rss × page_size → memoryMB（进程死亡 → 0）
       - **状态判定（简化）**：`fs.existsSync(/proc/{pid})` → 存活="busy"（绿脉冲）；不存在="idle"（灰静止灯）+ memory=0。**不做 CPU 阈值 / 进程树遍历**
       - `readFile(~/.claude/settings.json)` → 提取 `ANTHROPIC_DEFAULT_*_MODEL_NAME` → apiProvider
       - Glob `~/.claude/projects/*/${sessionId}.jsonl` → 取末条 assistant 消息 usage → contextTokens = input+cache_read+cache_creation → ctxPct = min(100, contextTokens/context_window×100)；context_window：模型名含 `[1m]` → 1M，否则 200K（见 DESIGN §6.8.2e）
       - uptimeSec = (Date.now() - startedAt) / 1000
     - 错误处理：文件不可读 → skip；transcript 无 usage → ctxPct=0
     - 过滤：排除 pid == process.pid；按 startedAt 降序
     - 合并 approvalQueue.getAll() → hasPendingApproval
3. 实现 `src/main/services.ts`（调度胶水层）：
   - `startBalanceChecker(db, provider, config, window, tray)`:
     - 立即执行一次 → setInterval(intervalMin * 60 * 1000)，默认 intervalMin=1（FR-1.5）
     - 每次查询后 → db.recordUsage(provider, model, balance, currency) → push `usage:updated`
     - 检查余额阈值（¥ 绝对金额）→ 触发余额侧颜色联动（见任务 4）
   - `startSessionScanner(scanner, approvalQueue, config, window)`:
     - 立即执行一次 → setInterval(refreshIntervalSec * 1000)，默认 3
     - 每次扫描后 → push `sessions:updated`
   - 返回 `{stop()}` 清理函数
4. **余额侧颜色联动**（遵循 M5 颜色优先级协议：红 > 橙 > 绿）：
   - balanceChecker 中：余额 < 阈值 → `tray.setIconColor('red')` + `notifyBalanceLow(balance, currency)`
   - 余额恢复正常 → 若 approvalQueue 无待审批 → `tray.setIconColor('green')`；否则保持橙

### 验收标准
```bash
# 余额查询（需 DEEPSEEK_API_KEY）
DEEPSEEK_API_KEY=xxx node -e "
const {DeepSeekProvider} = require('./out/main/deepseek');
const p = new DeepSeekProvider({balance_url:'https://api.deepseek.com/user/balance'});
p.checkBalance().then(console.log);
"
# → {provider:'deepseek', balance: 342.18, currency:'CNY'}

# Session 发现（启动一个 claude code session 后）
node -e "
const {ClaudeCodeSessionScanner} = require('./out/main/claude-sessions');
const s = new ClaudeCodeSessionScanner({sessions_dirs:['~/.claude/sessions'], settings_path:'~/.claude/settings.json'});
s.discoverSessions().then(console.log);
"
# → [{name:'cury-6d', status:'busy', pid:31993, memoryMB:~446, apiProvider:'deepseek-v4-pro', ctxPct:..., ...}, ...]

# 调度 + 联动（npm run dev）
# → 用量数据每 1 分钟刷新一次；sessions 每 3 秒刷新
# → 临时把 balance_warn_threshold 调到高于当前余额 → tray 变红 + 桌面通知；调回 → tray 回绿（无待审批时）
```

---

## 8. M7 — IPC 通道 + 挂件壳

**输入**：M3~M6（所有主进程模块）
**输出**：渲染进程可调用所有主进程功能 + 完整挂件框架
**合并自**：旧 M9（IPC + Preload）+ 旧 M10（挂件壳）+ M1 review 延后项（sandbox/CSP）

### 任务
**A. IPC 通道 + Preload**
1. 实现 `src/main/ipc-handlers.ts`：
   - 注册所有 `ipcMain.handle` 通道（见 DESIGN §6.11）
   - 每种 handler 只做薄封装，委托给对应模块
2. 实现 `src/preload/index.ts`：
   - `contextBridge.exposeInMainWorld('electronAPI', { ... })`
   - 10 个 invoke 方法 + 5 个 on push listener 方法（见 DESIGN §7）
   - 类型声明文件 `src/renderer/types/electron.d.ts`（引用 `src/shared/types.ts`，见 DESIGN §6.12）

**B. 挂件壳（基准原型 `harness_monitor.html`，见 DESIGN §2/§4）**
3. `App.tsx`：根布局 `.widget-window`（340px 毛玻璃 `blur(25px) saturate(180%)`、圆角 16px、浅色主题），状态管理（activeView: sessions/usage/settings、pinned）
4. `WidgetHeader.tsx`（44px 拖拽区 `-webkit-app-region: drag`）：
   - `TrafficLights.tsx`：红/黄/绿 10px 圆点 → Close=win.hide() / Minimize / Maximize
   - 标题 "Harness Monitor" + 应用图标
   - `PinIcon`：toggle alwaysOnTop（`app:toggle-pin`）
5. `SegmentedControl.tsx`（分段导航，替代侧边栏）：
   - Sessions（含 pending badge，红色 9px 胶囊）/ API Usage / Settings（齿轮图标）
   - 激活段白底 + `0 1px 3px rgba(0,0,0,0.1)` 阴影
6. 内容区 `.content-area`（可滚动、4px 隐藏滚动条）+ 三个空视图占位
7. 无 Footer（状态信息由托盘与 badge 传达）

**C. M1 遗留收口**
8. `sandbox:false` 决策落定并记录理由；renderer index.html 补 CSP meta

### 验收标准
```bash
npm run dev
# DevTools Console:
> window.electronAPI.getConfig()
# → Promise {<fulfilled>: {server: {port: 18456}, ...}}
> window.electronAPI.getUsageData()
# → Promise {<fulfilled>: [...]}
```
- 弹出 340×650 浅色毛玻璃挂件；顶部可拖拽移动；红绿灯 Close → 隐藏（不退出）
- 三个 Segment 可切换，Sessions badge 显示 pending 数；📌 切换置顶

---

## 9. M8 — 用量视图

**输入**：M7（IPC + 壳）
**输出**：余额卡 + 30 天余额趋势线（v2.3 精简版）
**原编号**：旧 M11

### 任务（v2.3 裁剪后）
1. `useUsageData.ts` hook：
   - `useEffect` 中调用 `window.electronAPI.getUsageData()` 初始加载
   - 订阅 `onUsageUpdated` push 事件
   - 趋势数据经 `getBalanceHistory()`（IPC → db.get30DayBalance）获取
   - 返回 `{latest, daily, loading, error}`
2. 余额卡：
   - "Current API Balance" + "Live" 绿色徽章
   - 余额大数字 ¥xx.xx（28px，¥ 符号 16px 顶对齐）
   - 低余额警示：balance < 阈值时红色小字 "低于告警线 ¥N"（**不画进度条**——API 无总预算分母）
   - `EmptyState`（无数据 / 未配置 API Key）
3. `TrendSparkline.tsx`（**原生 SVG**，不引入图表库）：
   - `<svg viewBox>` + `<path>` 面积折线，60px 高，30 天**余额**快照
   - hover Tooltip 显示日期 + 余额；无坐标轴/图例
4. **依赖清理**：从 package.json 移除 recharts + 刷新 lockfile（M1 装过，本模块确认不再引用后删）

### 验收标准
- 用量视图展示余额卡 + 30 天余额趋势线
- 余额变化时卡片更新（push 事件）
- 余额低于阈值显示红色警示文字
- sparkline 渲染 30 天余额数据，hover 显示数值
- `npm ls recharts` 无该依赖

---

## 10. M9 — Sessions 视图

**输入**：M7（IPC + 壳）
**输出**：SessionCard + ApprovalBlock + ApprovalHistory 功能完整
**依赖**：无
**原编号**：旧 M12

### 任务（卡片结构以原型为准）
1. `useSessionsData.ts` hook（同 M8 模式）
2. `StatusDot.tsx`：CSS animation 脉冲灯（busy 绿脉冲 / idle 灰静止）
3. `ContextGauge.tsx`：cyan 细进度条（Ctx: NN%，高 3px）
4. `SessionCard.tsx`：
   - Header：StatusDot + name（13px）+ [Terminal] 图标按钮（跳转终端 FR-2.7）
   - 徽章行：provider 徽章 + "Model: xxx" 工具徽章
   - Meta 行：`Ctx: NN%` + ContextGauge … `Mem: NNM`（Uptime 作微文字补充，FR-2.5）
   - cwd 截断（hover tooltip 全路径）
   - 条件渲染 ApprovalBlock（有审批时为红边紧急卡片）
   - 终止会话（FR-2.8）放 hover 浮层/右键菜单，不占卡片版面
5. `ApprovalBlock.tsx`：
   - 红色警告头 "Wait Approval (NNs)" + 警告图标
   - 命令等宽黑底白字展示（横向滚动），危险关键字 `#ff6b6b` 高亮
   - [Reject] [Approve (primary)] 两按钮
   - 审批后 2 秒淡出动画（FR-3.6）
6. `ApprovalHistory.tsx`：
   - 折叠/展开 toggle
   - 最近 20 条审批记录列表
   - 每行：✓/✗ 图标 + 命令 + session + 相对时间

### 验收标准
- 活跃 session 以卡片展示
- busy/idle 状态灯正确
- 审批块在对应 session 卡片底部出现（红边）
- 点击 Approve/Deny 有效果
- 危险命令高亮
- 审批历史可展开查看

---

## 11. M10 — 设置视图

**输入**：M7（壳）+ M2（Config 读/写）
**输出**：Settings segment 内联设置视图（非 modal）
**依赖**：无
**原编号**：旧 M13

### 任务（v2.3 裁剪后）
1. `SettingsView.tsx`（内容区 Settings 分段）：
   - **General** 卡：Always on Top / Desktop Notifications（两个 checkbox；**开机自启已移入延后项 D1，不画**）
   - **Limits & Alerts** 卡：Balance Warning (¥) number 输入（绝对金额）；审批超时固定 60s 仅展示不可改（D3）
   - 查询间隔（分钟）输入（FR-1.5）
   - [Quit Harness Monitor] 红色全宽按钮
   - 修改即调用 `window.electronAPI.saveConfig(partial)` 保存
2. 主进程 `config:save` handler：deepMerge 写回 YAML → 重新调度定时器
3. **遗留收口**：saveConfig 成功反馈设计（M2 review 延后项）— 明确 saveConfig 返回值语义 + 保存失败时的 UI 提示方式，决策写入 PROGRESS.md

### 验收标准
- Settings 分段切换正常
- 修改阈值 → 保存 → config.yaml 更新
- 修改间隔 → 下次轮询按新间隔执行
- Always on Top 开关与窗口状态同步

---

## 12. M11 — 端到端测试 + approve.sh

**输入**：M1~M10
**输出**：approve.sh 脚本 + 验证清单全部通过
**依赖**：全部模块
**原编号**：旧 M16（approve.sh 开发任务在此落位，DESIGN §6.13）

### 任务
1. 创建 `resources/hooks/approve.sh`（DESIGN §6.13）：
   - stdin 读取 PreToolUse hook JSON → `jq` 解析 command/session/cwd
   - **固定端口 18456**（env `HARNESS_MONITOR_PORT` 可覆盖；v2.3 无端口文件协议）
   - `curl -m 65` POST /approve → 阻塞等待 respond
   - 响应 `allowed:true` → exit 0（放行）；`allowed:false` → exit 2（拦截，遵循 Claude Code hook 规范）
   - 连接拒绝 / 超时 → fail-open exit 0（stderr 提示 harness-monitor 未运行）
2. 逐项执行验证清单

### 验证清单

```
□ 启动验证
  □ npm run dev → tray 绿色圆点出现
  □ curl :18456/health → {"status":"ok"}

□ 用量视图
  □ 余额卡显示余额（DEEPSEEK_API_KEY 已设置）
  □ 余额 < 阈值 → tray 红点 + 桌面通知 + 卡内警示文字
  □ 30 天余额趋势线正确渲染（原生 SVG）

□ Sessions 视图
  □ 活跃 claude session 显示为卡片
  □ busy 状态灯脉冲绿（进程存活）/ 进程死亡灰灯
  □ context% (usage token 估算) / memory MB / api provider 数值正确
  □ 跳转终端功能正常（kgx/gnome-terminal，cwd 正确）
  □ 终止 session 功能正常

□ 审批流程
  □ curl POST /approve → 面板出现 ApprovalBlock
  □ 桌面通知弹出
  □ Tray 变橙
  □ 点击 Approve → HTTP 返回 allowed:true → 卡片淡出 → tray 变绿（无余额告警时）
  □ 点击 Deny → HTTP 返回 allowed:false → 卡片淡出
  □ 60s 超时 → 自动 deny + 历史记录
  □ 危险命令 (sudo rm) → 红色高亮
  □ approve.sh: stdin JSON → curl → exit 0(放行) / 2(拦截) 正确
  □ approve.sh: server 未启动 → fail-open exit 0

□ 审批历史
  □ 可折叠展开
  □ 最近 20 条正确
  □ 每条含 ✓/✗ + 命令 + session + 时间

□ 设置
  □ Settings 分段切换正常
  □ 修改阈值 → 保存 → config.yaml 更新
  □ 修改间隔 → 轮询间隔变化

□ 托盘交互
  □ 颜色联动正确 (绿/橙/红/灰，优先级 红>橙>绿)
  □ 右键菜单有效（Active Agents 动态列表）
  □ 左键 toggle 面板
  □ 失焦隐藏 + pin 常驻

□ 基础设施
  □ 第二次启动被拒绝（单实例锁）
  □ 端口被占 → 提示后退出（不崩溃）
  □ SIGTERM/Ctrl+C → 优雅退出
  □ 数据库文件在 ~/.config/harness-monitor/monitor.db
  □ 用户配置在 ~/.config/harness-monitor/config.yaml
  □ 时间戳全链路本地时间（DB / IPC / 渲染展示一致）
```

---

## 13. 延后项（主体功能验收后另行评估）

| ID | 内容 | 原需求 | 备注 |
|----|------|--------|------|
| D1 | 打包（.deb / AppImage）+ 开机自启 + chrome-sandbox SUID 固化 | FR-6.6 / 旧 M15 / M1 遗留 | 前期直接 `npm run dev` / electron 跑源码自用 |
| D2 | 终端并行审批：hook 输出提示到终端，Ctrl+C 拒绝 / 另开窗口 curl 响应 | FR-3.9 | 面板批准/拒绝已覆盖主路径 |
| D3 | 审批超时时间可配置 | FR-5.4 | v1 固定 60 秒 |

---

## 14. 开发约束

1. **每个模块提交一次 git commit**，message 格式：`feat(Mx): 描述`
2. **TypeScript strict mode** 全栈开启
3. **主进程代码不放 node_modules 依赖的 async 操作到渲染进程** — 所有异步在主进程完成，结果 push 给渲染
4. **错误处理**：每个 async 函数有 try/catch + log；API 错误不抛给用户，降级展示
5. **CSS 约束**：用 Tailwind utility class 优先，少量自定义 CSS 放在 `globals.css` 的 `@layer components` 中
6. **不可引入新的 native 依赖**（除 better-sqlite3 已批准外）
