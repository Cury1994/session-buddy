# harness-monitor — 任务文档

> 版本 v2.1 | 2026-07-23 | Electron 全量重写 · 340px 悬浮挂件
>
> **v2.1 变更**（同步 DESIGN v3.1）：UI 基准原型统一为 `harness_monitor.html`（340px 挂件、无侧边栏、分段导航、浅色毛玻璃），Phase 3 模块重写；ctx% 改 usage token 估算（M7）；approve.sh 改 exit 0/2（M16）；窗口 340×650、托盘菜单扩展（M4）；审批 id 用 UUID + 端口冲突处理（M5）。

---

## 1. 模块总览与优先级

```
Phase 1 ──── 基础设施
  M1  项目骨骼                     [P0]  1.5h
  M2  配置管理                     [P0]  1h
  M3  数据库                       [P0]  1h
  M4  系统托盘 + 窗口管理           [P0]  2h
────────────────────────────────────────────
Phase 2 ──── 后端服务
  M5  HTTP Server + 审批队列       [P0]  2h
  M6  DeepSeek 余额查询            [P0]  1h
  M7  Claude Code Session 发现      [P0]  2h
  M8  定时任务调度                 [P0]  0.5h
  M9  IPC 通道 + Preload           [P0]  1.5h
────────────────────────────────────────────
Phase 3 ──── 前端 UI
  M10 挂件壳 (WidgetHeader/SegmentedControl) [P0] 2h
  M11 用量视图 (余额卡/统计卡/TrendSparkline) [P0] 2h
  M12 Sessions 视图 (SessionCard/ApprovalBlock/History) [P0] 3h
  M13 设置视图 (SettingsView)            [P1]  1.5h
────────────────────────────────────────────
Phase 4 ──── 集成与发布
  M14 通知集成 + 颜色联动          [P1]  1h
  M15 打包 + 开机自启              [P2]  1.5h
  M16 端到端测试                   [P0]  1h
────────────────────────────────────────────
                                合计 ~24h
```

### 优先级定义

| 级别 | 含义 |
|------|------|
| P0 | 核心功能，必须实现，否则产品不可用 |
| P1 | 重要功能，增强用户体验 |
| P2 | 锦上添花，可后续迭代 |

### 依赖关系

```
M1 (骨骼)
 ├─ M2 (配置)
 ├─ M3 (数据库)
 └─ M4 (Tray+Window)
      ├─ M5 (Server)
      │    └─ M9 (IPC)
      │         ├─ M10 (UI 壳)
      │         │    ├─ M11 (用量)
      │         │    ├─ M12 (Sessions)
      │         │    └─ M13 (设置)
      │         └─ M14 (通知)
      ├─ M6 (DeepSeek)
      └─ M7 (Session Scanner)
           └─ M8 (定时任务)
                └─ M15 (打包)
                     └─ M16 (测试)
```

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
echo "server:\n  port: 9999" > ~/.config/harness-monitor/config.yaml
# → port=9999，其他保持默认
```

---

## 4. M3 — 数据库

**输入**：M1 + M2（配置）
**输出**：SQLite 初始化 + DAO 方法
**依赖**：better-sqlite3 已安装

### 任务
1. 实现 `src/main/db.ts`：
   - `constructor(dbPath?)`: 默认路径 `app.getPath('userData')/monitor.db`（Linux 下 `~/.config/harness-monitor/monitor.db`）
   - `initDB()`: 建表（api_usage + approval_history + 索引），WAL 模式
   - `recordUsage(provider, model, balance, currency, todayTokens, monthUsed, totalBudget)`: INSERT
   - `getLatestUsage()`: SELECT MAX(id) GROUP BY provider, model
   - `get30DayUsage(provider, model)`: SELECT DATE(timestamp) as day, SUM(today_tokens) as tokens GROUP BY day
   - `recordApproval(harness, sessionName, command, cwd, allowed)`: INSERT
   - `getRecentApprovals(limit = 20)`: SELECT ORDER BY timestamp DESC LIMIT ?
   - `close()`: 关闭连接

### 验收标准
```bash
node -e "
const {AppDatabase} = require('./out/main/db');
const db = new AppDatabase('/tmp/test-monitor.db');
db.initDB();
db.recordUsage('deepseek', 'all', 342.18, 'CNY', 1850000, 157.82, 500);
console.log(db.getLatestUsage());  // [{provider:'deepseek', balance:342.18, ...}]
db.recordApproval('claude-code', 'cury-6d', 'sudo echo test', '/tmp', true);
console.log(db.getRecentApprovals(5));  // [{command:'sudo echo test', allowed:1, ...}]
db.close();
"
# → 两个表都有数据，SQLite 文件存在
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

## 6. M5 — HTTP Server + 审批队列

**输入**：M3（DB）+ M4（Window）
**输出**：Express HTTP API + 阻塞式审批机制
**依赖**：express 已安装

### 任务
1. 实现 `src/main/approval-queue.ts`：
   - `enqueue(payload)` → `{id, promise}` + 60s setTimeout auto-deny；`id = crypto.randomUUID()`（见 DESIGN §6.6）
   - `respond(id, allowed)` → resolve promise → 返回是否成功
   - `getAll()` → 所有 pending 列表
   - `size` → getter
2. 实现 `src/main/server.ts`：
   - `createServer(db, approvalQueue, window)`:
     - Express app + JSON 中间件
     - `GET /health` → `{status:"ok"}`
     - `GET /api/usage` → `db.getLatestUsage()`
     - `GET /api/sessions` → `sessionScanner.getSessions()`
     - `GET /api/approvals` → `approvalQueue.getAll()`
     - `POST /approve` → `approvalQueue.enqueue()` → `await promise` → 返回
     - `POST /approve/:id/respond` → `approvalQueue.respond()` → 返回
   - `start(port)` / `stop()` 生命周期
   - **EADDRINUSE 处理**（见 DESIGN §6.5）：先探测 `/health` 判断是否本应用旧实例（是则正常退出）；否则顺序尝试 port+1..+10；全占用则 log + 通知 + tray 置灰继续运行
   - 实际监听端口写入 `app.getPath('userData')/server.port` 运行时文件（供 approve.sh 读取，见 DESIGN §6.13）

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

# 终端 2：
curl -X POST http://127.0.0.1:18456/approve/<id>/respond \
  -H "Content-Type: application/json" \
  -d '{"allowed":true}'
# 终端 1 立即返回 {"allowed":true}（<id> 为 enqueue 返回的 UUID）
```

---

## 7. M6 — DeepSeek 余额查询

**输入**：M2（Config）+ M3（DB）
**输出**：余额查询模块
**依赖**：Node.js 内置 fetch

### 任务
1. 实现 `src/main/deepseek.ts`：
   - `DeepSeekProvider` class
   - `constructor(config)`: 读 `process.env.DEEPSEEK_API_KEY` + balance_url
   - `async checkBalance()`:
     - fetch with `Authorization: Bearer $KEY` + `AbortSignal.timeout(15000)`
     - 解析 `balance_infos[0]`：`parseFloat(total_balance)`→balance、`currency`→currency；`is_available=false` 视为不可用（字段映射见 DESIGN §6.7）
     - 返回 `BalanceInfo` 或 null（key 缺失 / 网络错误 / 解析失败）
   - 错误处理：非 200 → log warning → return null；JSON 异常 → return null

### 验收标准
```bash
DEEPSEEK_API_KEY=xxx node -e "
const {DeepSeekProvider} = require('./out/main/deepseek');
const p = new DeepSeekProvider({balance_url:'https://api.deepseek.com/user/balance'});
p.checkBalance().then(console.log);
"
# → {provider:'deepseek', balance: 342.18, currency:'CNY', ...}
```

---

## 8. M7 — Claude Code Session 发现

**输入**：M2（Config）
**输出**：Session 扫描模块
**依赖**：无外部依赖（使用 Node 内置 fs + child_process）

### 任务
1. 实现 `src/main/claude-sessions.ts`：
   - `ClaudeCodeSessionScanner` class
   - `constructor(config)`: 解析 sessions_glob + settings_path
   - `async discoverSessions()`:
     - 扫描 `config.harnesses['claude-code'].config_dirs` 各目录的 sessions/（默认 `["~/.claude"]`）；`fs.readdir` + filter `*.json`（见 DESIGN §6.8.1/§6.8.2）
     - For each file:
       - `JSON.parse` → pid, sessionId, name, cwd, status, startedAt（字段清理见 §6.8.2b）
       - `readFile(/proc/{pid}/status)` → parse `VmRSS:` line → memoryMB
       - `readFile(~/.claude/settings.json)` → extract `ANTHROPIC_DEFAULT_*_MODEL_NAME` → apiProvider
       - Glob `~/.claude/projects/*/${sessionId}.jsonl` → 取末条 assistant 消息 usage → contextTokens = input+cache_read+cache_creation → ctxPct = min(100, contextTokens/context_window×100)（与终端状态栏同源，见 DESIGN §6.8.2e）
       - uptime = (Date.now() - startedAt) / 1000
     - 错误处理：文件不可读 → skip；进程已死 → memory=0, status="idle"；transcript 无 usage → ctxPct=0
   - `_loadModelMappings()`: 从 settings.json 提取 provider 名称

### 验收标准
```bash
# 启动一个 claude code session 后
node -e "
const {ClaudeCodeSessionScanner} = require('./out/main/claude-sessions');
const s = new ClaudeCodeSessionScanner({sessions_glob:'~/.claude/sessions/*.json', settings_path:'~/.claude/settings.json'});
s.discoverSessions().then(console.log);
"
# → [{name:'cury-6d', status:'busy', pid:31993, memoryMB:~446, apiProvider:'deepseek-v4-pro', ctxPct:..., ...}, ...]
```

---

## 9. M8 — 定时任务调度

**输入**：M4 + M5 + M6 + M7
**输出**：balance checker + session scanner 定时运行
**依赖**：前面模块全部完成

### 任务
1. 实现 `src/main/services.ts`：
   - `startBalanceChecker(db, provider, config, window)`:
     - 立即执行一次 → setInterval(intervalMin * 60 * 1000)，默认 intervalMin=1（FR-1.5: 1 分钟）
     - 每次查询后 → db.recordUsage → push usage:updated
     - 检查余额阈值 → 触发 setIconColor + notification
   - `startSessionScanner(scanner, approvalQueue, config, window)`:
     - 立即执行一次 → setInterval(refreshIntervalSec * 1000)
     - 每次扫描后 → 合并审批状态 → push sessions:updated
   - 返回 `{stop()}` 清理函数

### 验收标准
- `npm run dev` 启动后，用量视图自动每 1 分钟更新
- Sessions 视图每 3 秒更新
- tray 图标根据状态变化

---

## 10. M9 — IPC 通道 + Preload

**输入**：M3~M8（所有主进程模块）
**输出**：渲染进程可调用所有主进程功能
**依赖**：前面模块的 API 接口已完成

### 任务
1. 实现 `src/main/ipc-handlers.ts`：
   - 注册所有 `ipcMain.handle` 通道（见 DESIGN §6.11）
   - 每种 handler 只做薄封装，委托给对应模块
2. 实现 `src/preload/index.ts`：
   - `contextBridge.exposeInMainWorld('electronAPI', { ... })`
   - 10 个 invoke 方法 + 5 个 on push listener 方法（见 DESIGN §7）
   - 类型声明文件 `src/renderer/types/electron.d.ts`（引用 `src/shared/types.ts`，见 DESIGN §6.12）

### 验收标准
```bash
npm run dev
# 打开 DevTools Console:
> window.electronAPI.getConfig()
# → Promise {<fulfilled>: {server: {port: 18456}, ...}}
> window.electronAPI.getUsageData()
# → Promise {<fulfilled>: [...]}
```

---

## 11. M10 — 渲染进程 UI 壳（widget）

**输入**：M9（IPC 可用）
**输出**：完整的挂件框架（WidgetHeader + SegmentedControl + 三视图占位）
**依赖**：React + Tailwind 就绪

### 任务（基准原型 `harness_monitor.html`，见 DESIGN §2/§4）
1. `App.tsx`：根布局 `.widget-window`（340px 毛玻璃 `blur(25px) saturate(180%)`、圆角 16px、浅色主题），状态管理（activeView: sessions/usage/settings、pinned）
2. `WidgetHeader.tsx`（44px 拖拽区 `-webkit-app-region: drag`）：
   - `TrafficLights.tsx`：红/黄/绿 10px 圆点 → Close=win.hide() / Minimize / Maximize
   - 标题 "Harness Monitor" + 应用图标
   - `PinIcon`：toggle alwaysOnTop（`app:toggle-pin`）
3. `SegmentedControl.tsx`（分段导航，替代侧边栏）：
   - Sessions（含 pending badge，红色 9px 胶囊）/ API Usage / Settings（齿轮图标）
   - 激活段白底 + `0 1px 3px rgba(0,0,0,0.1)` 阴影
4. 内容区 `.content-area`（可滚动、4px 隐藏滚动条）+ 三个空视图占位
5. 无 Footer（状态信息由托盘与 badge 传达）

### 验收标准
- `npm run dev` → 弹出 340×650 浅色毛玻璃挂件
- 顶部可拖拽移动窗口；红绿灯 Close → 隐藏（不退出）
- 三个 Segment 可切换，Sessions badge 显示 pending 数
- 📌 切换置顶

---

## 12. M11 — 用量视图

**输入**：M10（UI 壳）+ M9（IPC）
**输出**：余额卡 + 统计卡 + TrendSparkline 功能完整
**依赖**：recharts 已安装

### 任务
1. `useUsageData.ts` hook：
   - `useEffect` 中调用 `window.electronAPI.getUsageData()` 初始加载
   - 订阅 `onUsageUpdated` push 事件
   - 返回 `{records, dailyUsage, loading, error}`
2. 余额卡：
   - "Current API Balance" + "Live" 绿色徽章
   - 余额大数字 ¥xx.xx（28px，¥ 符号 16px 顶对齐）
   - 底部余额进度条（3px，绿/黄/红随阈值切换，FR-1.4）
   - `EmptyState`（无数据 / 未配置 API Key）
3. 统计卡（竖线分隔左右）：
   - Today's Tokens | Monthly Spent（FR-1.2 千 token 均价可作第三列，与产品确认后取舍）
4. `TrendSparkline.tsx`：
   - Recharts `<AreaChart>` mini 或原生 SVG，60px 高，30 天数据，蓝/青面积渐变
   - 不画完整坐标系/图例，hover Tooltip 显示数值（FR-1.3 widget 适配）

### 验收标准
- 用量视图展示余额卡 + 统计卡 + 趋势 sparkline
- 余额变化时卡片更新
- 进度条颜色随百分比变化
- sparkline 渲染 30 天数据

---

## 13. M12 — Sessions 视图

**输入**：M10（UI 壳）+ M9（IPC）
**输出**：SessionCard + ApprovalBlock + ApprovalHistory 功能完整
**依赖**：无

### 任务（卡片结构以原型为准）
1. `useSessionsData.ts` hook（同 M11 模式）
2. `StatusDot.tsx`：CSS animation 脉冲灯（busy 绿脉冲 / idle 黄或灰静止）
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

## 14. M13 — 设置视图

**输入**：M10 + M2（Config 读/写）
**输出**：Settings segment 内联设置视图（非 modal）
**依赖**：无

### 任务
1. `SettingsView.tsx`（内容区 Settings 分段）：
   - **General** 卡：Start at Login / Always on Top / Desktop Notifications（三个 checkbox）
   - **Limits & Alerts** 卡：Balance Warning (¥) number 输入 + 审批超时（秒）输入（FR-5.4）
   - 查询间隔（分钟）输入（FR-1.5）可追加
   - [Quit Harness Monitor] 红色全宽按钮
   - 修改即调用 `window.electronAPI.saveConfig(partial)` 保存
2. 主进程 `config:save` handler：deepMerge 写回 YAML → 重新调度定时器

### 验收标准
- Settings 分段切换正常
- 修改阈值 → 保存 → config.yaml 更新
- 修改间隔 → 下次轮询按新间隔执行
- Always on Top 开关与窗口状态同步

---

## 15. M14 — 通知集成 + 颜色联动

**输入**：M5 + M12（审批可用）
**输出**：桌面通知 + tray 颜色自动联动
**依赖**：notification API 在主进程可用

### 任务
1. `src/main/notifications.ts`：
   - `notifyApproval(payload)` → `new Notification(...)`
   - `notifyBalanceLow(balance, currency)` → `new Notification(...)`
   - 检查 `config.notifications.enabled` 开关
   - 通知点击 → `win.show()`
2. 在 `services.ts` 的 balanceChecker 中：余额 < 阈值 → tray.setIconColor('red') + notifyBalanceLow
3. 在 `server.ts` 的 POST /approve handler 中：有审批 → tray.setIconColor('amber') + notifyApproval
4. 在 approvalQueue.respond 中：队列空 → tray.setIconColor('green')
5. 在 balanceChecker 中：余额恢复正常 → tray 回到绿色（无审批时）

### 验收标准
- `curl POST /approve` → 桌面通知弹出 "Session X requests approval"
- 余额低于阈值 → 桌面通知 + tray 变红
- 审批队列清空 → tray 变色逻辑正确（有余额告警时保持红）

---

## 16. M15 — 打包 + 开机自启

**输入**：M1~M14 全部完成
**输出**：可分发的安装包 + 开机自启配置
**依赖**：electron-builder 已安装

### 任务
1. 配置 `electron-builder` 在 package.json：
   - Linux: .deb + .AppImage
   - 包含 resources/hooks/approve.sh
   - 包含 config.yaml
2. 创建 `resources/icon.png`（512×512）
3. 实现 `install-autostart` 逻辑（在 settings 中绑定）：
   - 写入 `~/.config/autostart/harness-monitor.desktop`
4. 测试打包产物

### 验收标准
```bash
npm run build
# → dist/ 目录下有 .deb 和 .AppImage
# 安装 .deb 后应用可正常运行
# 开机自启开关打开后 .desktop 文件存在
```

---

## 17. M16 — 端到端测试 + Code Review

**输入**：M1~M15
**输出**：验证清单全部通过
**依赖**：全部模块

### 验证清单

```
□ 启动验证
  □ npm run dev → tray 绿色圆点出现
  □ curl :18456/health → {"status":"ok"}

□ 用量视图
  □ 余额卡显示余额（DEEPSEEK_API_KEY 已设置）
  □ 进度条颜色随百分比变化
  □ 30天趋势 sparkline 正确渲染
  □ 余额 < 阈值 → tray 红点 + 桌面通知

□ Sessions 视图
  □ 活跃 claude session 显示为卡片
  □ busy 状态灯脉冲绿
  □ context% (usage token 估算) / memory MB / api provider 数值正确
  □ 跳转终端功能正常（打开 kgx/gnome-terminal）
  □ 终止 session 功能正常

□ 审批流程
  □ curl POST /approve → 面板出现 ApprovalBlock
  □ 桌面通知弹出
  □ Tray 变橙
  □ 点击 Approve → HTTP 返回 allowed:true → 卡片淡出 → tray 变绿
  □ 点击 Deny → HTTP 返回 allowed:false → 卡片淡出
  □ 60s 超时 → 自动 deny + 历史记录
  □ 危险命令 (sudo rm) → 橙色警告标签
  □ approve.sh 脚本: stdin JSON → curl → exit 0(放行) / 2(拦截) 正确

□ 审批历史
  □ 可折叠展开
  □ 最近 20 条正确
  □ 每条含 ✓/✗ + 命令 + session + 时间

□ 设置
  □ Settings 分段切换正常
  □ 修改阈值 → 保存 → config.yaml 更新
  □ 修改间隔 → 轮询间隔变化

□ 托盘交互
  □ 颜色联动正确 (绿/橙/红/灰)
  □ 右键菜单有效
  □ 左键 toggle 面板
  □ 失焦隐藏 + pin 常驻

□ 基础设施
  □ 第二次启动被拒绝（单实例锁）
  □ SIGTERM/Ctrl+C → 优雅退出
  □ 数据库文件在 ~/.config/harness-monitor/monitor.db
  □ 用户配置在 ~/.config/harness-monitor/config.yaml
```

---

## 18. 开发约束

1. **每个模块提交一次 git commit**，message 格式：`feat(Mx): 描述`
2. **TypeScript strict mode** 全栈开启
3. **主进程代码不放 node_modules 依赖的 async 操作到渲染进程** — 所有异步在主进程完成，结果 push 给渲染
4. **错误处理**：每个 async 函数有 try/catch + log；API 错误不抛给用户，降级展示
5. **CSS 约束**：用 Tailwind utility class 优先，少量自定义 CSS 放在 `globals.css` 的 `@layer components` 中
6. **不可引入新的 native 依赖**（除 better-sqlite3 已批准外）
