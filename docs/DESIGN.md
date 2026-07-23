# harness-monitor — 设计文档

> 版本 v3.1 | 2026-07-23 | macOS 浅色毛玻璃 UI · 340px 桌面悬浮挂件
>
> **v3.1 变更**：① 按 `docs/REVIEW.md` 完成 13 项整改（共享类型 §6.12 / approve.sh §6.13 / DeepSeek 响应 §6.7 / Linux 适配 §2.10 等）；② UI 基准原型统一为 **`harness_monitor.html`（340px 悬浮挂件，无侧边栏，分段导航）**，§2/§4 已全面对齐，`AppPrototype.jsx` 弃用；③ 窗口尺寸以设计资料为准（340×650，见 §2.9）。
>
> **参考项目**: [abtop](https://github.com/graykode/abtop) — Rust TUI AI agent monitor，Claude Code session 发现 / 进程信息采集 / 终端跳转 / 多 profile 发现的核心实现模式已验证，本章后端模块设计直接复用其已验证方案。细节见 §11 参考实现对照。

---

## 1. 架构总览

### 1.1 进程模型

```
┌────────────────────────────────────────────────────┐
│                   Electron Main                     │
│                                                    │
│  ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │   Tray   │ │  Window  │ │  Express Server    │  │
│  │ (SVG 圆点)│ │ (可缩放) │ │  (127.0.0.1:18456)│  │
│  └──────────┘ └────┬─────┘ └────────┬──────────┘  │
│                    │                │              │
│  ┌─────────────────┴────────────────┴───────────┐  │
│  │              IPC Handlers                     │  │
│  └─────────────────┬────────────────────────────┘  │
│  ┌─────────────────┴────────────────────────────┐  │
│  │            Services & Providers               │  │
│  │  ┌───────────────┐  ┌──────────────────────┐ │  │
│  │  │ BalanceChecker│  │  SessionScanner      │ │  │
│  │  │ (DeepSeek)    │  │  (Claude Code)       │ │  │
│  │  └───────────────┘  └──────────────────────┘ │  │
│  │  ┌───────────────┐  ┌──────────────────────┐ │  │
│  │  │ ApprovalQueue │  │  NotificationMgr     │ │  │
│  │  └───────────────┘  └──────────────────────┘ │  │
│  └─────────────────┬────────────────────────────┘  │
│  ┌─────────────────┴────────────────────────────┐  │
│  │         better-sqlite3 + YAML Config          │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐
    │Preload  │    │Renderer │    │Bash Hook│
    │(bridge) │    │(React)  │    │(curl)   │
    └─────────┘    └─────────┘    └─────────┘
```

### 1.2 技术选型

| 层 | 选型 | 版本 | 理由 |
|----|------|------|------|
| 桌面运行时 | Electron | ^32.x | tray、notification、跨平台 |
| 构建工具 | electron-vite | ^2.x | 主进程/preload/渲染统一 Vite 构建 |
| 前端框架 | React | ^19.x | 生态成熟、组件化 |
| 类型系统 | TypeScript | ^5.x | 全栈类型安全 |
| CSS | Tailwind CSS | ^3.x | utility-first，配合自定义 CSS 变量 |
| 图表 | Recharts | ^2.x | React 原生、声明式 API |
| HTTP 服务 | Express | ^4.x | 路由参数提取、JSON 中间件 |
| SQLite | better-sqlite3 | ^11.x | 同步 API、Node.js 原生绑定 |
| 配置解析 | yaml | ^2.x | 与旧版 config.yaml 兼容 |
| 打包 | electron-builder | ^25.x | .deb / AppImage |

### 1.3 审批机制选型：阻塞 HTTP + Promise

**方案**：Express handler 中创建 Promise 存储在 ApprovalQueue 的 Map 里，用 `Promise.race(promise, timeout)` 等待。UI 通过 IPC resolve。这是旧版 Python `asyncio.Future` 的直接 Node.js 等价物，也是 Hook 脚本（curl 阻塞 + 等待 HTTP 返回）的唯一兼容方案。

**不选 WebSocket/SSE** 的原因：Hook 脚本是简单的 bash + curl，WebSocket 需要额外依赖（websocat 等），增加复杂度。阻塞 HTTP 更可靠且实现简单。

---

## 2. 视觉设计规范

> 来源：**基准原型 `harness_monitor.html`**（340px 悬浮挂件，最终确认）+ `Design Specification.txt`。旧侧边栏全窗原型 `AppPrototype.jsx` 与 `appprototype.js` 已弃用并从仓库移除。

### 2.1 设计语言

深度仿照 **macOS Human Interface Guidelines (HIG)** 的**桌面悬浮挂件（Desktop Widget）**形态：浅色毛玻璃（Acrylic/Vibrancy）、340px 窄窗、习惯挂靠屏幕右侧。**无侧边栏**，顶部用**分段控制器（Segmented Control）**切换 Sessions / API Usage / Settings 三个视图，内容区垂直滚动、卡片堆叠。

### 2.2 配色方案（CSS 变量）

```css
:root {
  /* 悬浮窗透明主题（widget 毛玻璃基底，原型 harness_monitor.html） */
  --widget-bg: rgba(245, 245, 250, 0.45);
  --widget-border: rgba(255, 255, 255, 0.4);
  --card-bg: rgba(255, 255, 255, 0.55);
  --card-border: rgba(255, 255, 255, 0.6);

  /* 语义色 */
  --accent-blue: #007aff;
  --accent-cyan: #32ade6;
  --danger-red: #ff3b30;
  --warning-yellow: #ffcc00;
  --success-green: #34c759;

  /* 文字 */
  --text-main: rgba(0, 0, 0, 0.85);
  --text-muted: rgba(0, 0, 0, 0.55);

  /* 托盘下拉菜单 */
  --menu-bg: rgba(245, 245, 250, 0.85);
  --menu-border: rgba(255, 255, 255, 0.5);
  --menu-hover: #007aff;
  --menu-danger-hover: #ff3b30;
  --menu-text-hover: #ffffff;
  --menu-divider: rgba(0, 0, 0, 0.08);
  --menu-shadow: 0 8px 24px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.1);
}
```

> **配色来源说明（REVIEW #13，已按最终原型修正）**：基准原型 `harness_monitor.html` 的卡片底色为**半透明 `rgba(255, 255, 255, 0.55)`**，与 `Design Specification.txt` 完全一致；`AppPrototype.jsx` 的纯白 `#ffffff` 不再作为依据。**卡片采用半透明 0.55**，依托窗口级 `backdrop-filter` 呈现毛玻璃层次；X11 无合成器时的不透明回退色见 §2.10。

### 2.3 字体排版

| 用途 | 规格 |
|------|------|
| 字体族 | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif` |
| 窗口标题 | 13px Semi-bold |
| 分段导航（segment） | 12px Medium |
| 卡片标题 | 12–13px Semi-bold |
| Session 名称 | 13px Semi-bold |
| 正文/标签 | 12px Regular |
| 小徽章/微文字 | 10–11px（徽章 10px；Ctx/Mem 微文字 10px） |
| 通知徽章数字 | 9px Bold |
| 大数字（余额） | 28px Bold（货币符号 ¥ 16px，顶对齐） |
| 菜单项 | 13px Regular（快捷键 11px） |
| 命令块等宽字体 | monospace 11px（黑底白字） |

### 2.4 圆角与间距

| 元素 | 圆角 | 说明 |
|------|------|------|
| 窗口外框 | `16px` (`rounded-2xl`) | 整体悬浮窗（设计资料 Window Form Factor，见 §2.9） |
| 卡片 | `12px` (`rounded-xl`) | 半透明卡片，padding 12px、margin-bottom 12px |
| 按钮 | `6px` (`rounded-md`) | 标准按钮（padding 4px 10px） |
| 分段控制器 | `8px`（外框）/ `6px`（单段） | 顶部分段导航 |
| 托盘下拉菜单 | `8px` | macOS 风格下拉 |
| 徽章 | `4px`（标签）/ `8px`（计数胶囊） | 标签/计数 |
| 输入框 | `4px` | 设置面板 |
| 进度条 | `2px` | Ctx 细进度条（高度 3px） |
| 内容区留白 | `0 16px 16px` | 滚动内容区 padding；分段导航外边距 12px 16px |

### 2.5 阴影与边框

- **窗口**：`0 10px 30px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.5)` + `1px` 边框 `rgba(255,255,255,0.4)`
- **卡片**：`0 2px 6px rgba(0,0,0,0.02)` + `1px` 边框 `rgba(255,255,255,0.6)`
- **紧急审批卡片**：边框 `rgba(255,59,48,0.4)` + `0 4px 12px rgba(255,59,48,0.1)`
- **按钮**：`1px` 边框 `rgba(0,0,0,0.1)`；Primary 按钮无边框（纯蓝底白字）
- **分段激活态**：白底 + `0 1px 3px rgba(0,0,0,0.1)`
- **命令块**：黑底 `rgba(0,0,0,0.8)` + 白字 + `6px` 圆角，危险关键字 `#ff6b6b` 高亮

### 2.6 毛玻璃效果

- **悬浮窗体**：`backdrop-filter: blur(25px) saturate(180%)` + 半透明底 `rgba(245, 245, 250, 0.45)`
- **托盘菜单**：`backdrop-filter: blur(30px) saturate(200%)` + `rgba(245, 245, 250, 0.85)`
- X11 无合成器时不生效，降级为不透明近似色，见 §2.10

### 2.7 交互动画

| 动画 | 规格 |
|------|------|
| 状态脉冲灯 | `@keyframes pulse`: scale(0.95)↔(1) + 同色阴影环扩散，2s 无限循环 |
| 视图切换（segment） | fadeIn: opacity 0→1 + translateY(5px)→0，0.2s ease-in-out |
| 托盘菜单出现 | menuFadeIn: opacity 0→1 + translateY(-5px)→0 + scale(0.98)→1，0.15s ease-out |
| 按钮 hover | `background` 0.1s |
| 分段状态切换 | `all` 0.2s |
| 托盘图标 hover | `background` 0.15s |

### 2.8 滚动条

内容区使用隐藏式细滚动条（保持挂件清爽）：
- 宽度：4px
- Track：透明
- 滑块：`rgba(0,0,0,0.1)`，`border-radius: 4px`

### 2.9 窗口尺寸

> **唯一真源**：窗口宽高以设计资料为准 —— `Design Specification.txt` §Window Form Factor + 基准原型 `harness_monitor.html`（`.widget-window { width: 340px; height: 80vh; max-height: 650px; border-radius: 16px }`）。代码侧由 `config.yaml` 的 `window.*` 承载（见 §8.1）；§6.4 `window.ts` 直接读取该配置，不再各自给值。

| 属性 | 值 | 说明 |
|------|-----|------|
| 宽度 | `340px`（固定） | 设计资料 Window Form Factor |
| 高度 | `80vh`，max `650px` | Electron 以 `config.yaml` 的 `height: 650` 作默认像素值 |
| 圆角 | `16px` (`rounded-2xl`) | 设计资料 Window Form Factor（见 §2.4） |
| frame | `false` | 无边框（自定义红绿灯） |
| resizable | `true` | 允许缩放 |
| transparent | — | 无需透明（非 Widget 形态） |
| skipTaskbar | `false` | 正常显示在任务栏 |
| alwaysOnTop | `false`（默认） | 可通过 Pin 切换 |

### 2.10 Linux 平台适配

> 首目标平台为 **Ubuntu 24.04**（见 REQUIREMENTS §1.3）。设计语言虽仿 macOS HIG，但以下平台差异必须在开发时降级处理，不能假设 macOS 行为可用。

| 问题 | 影响 | 降级方案 |
|------|------|---------|
| `backdrop-filter: blur()` 在 X11 无合成器时不生效 | 窗体/托盘菜单毛玻璃消失，露出半透明底色 | 检测渲染是否生效（或按 `XDG_SESSION_TYPE` 判断）；失效时回退到**不透明**近似色：窗体 `#f5f5fa`、卡片 `#ffffff`、托盘菜单 `#f5f5fa` |
| Electron `Tray` 在 GNOME(Wayland) 默认不显示 | 托盘图标消失 | 文档注明需安装 `gnome-shell-extension-appindicator`（Ubuntu 24.04 可 `apt install gnome-shell-extension-appindicator`）；应用启动时检测托盘是否可用，不可用则回退到普通任务栏窗口 + 桌面通知 |
| 红绿灯按钮在 Linux 无原生对应 | Close/Minimize/Maximize 语义缺失 | 完全自绘（`TrafficLights.tsx`），Close → `win.hide()`（不 quit）、Minimize → `win.minimize()`、Maximize → `win.isMaximized()` toggle；`frame:false` 下自行处理 `-webkit-app-region: drag` 拖拽区 |
| `~/.claude/sessions/*.json` 路径 | Linux 下路径正确 | 已确认：Claude Code 在 Linux 使用 `~/.claude/`（等价 `$HOME/.claude`），与 macOS 一致；多 profile 发现见 §6.8.1 |
| 终端跳转 | macOS 的 iTerm2 不存在 | 使用 Linux 终端链：cmux → tmux → kgx → gnome-terminal → xterm（见 §6.8.4） |
| 开机自启 | 无 LaunchAgent | 写 `~/.config/autostart/harness-monitor.desktop`（FR-6.6），而非 macOS 的 Login Items |

---

## 3. 目录结构

```
harness-monitor/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── tailwind.config.ts
├── postcss.config.js
├── config.yaml                       # 默认配置（packaged）

├── src/
│   ├── main/                         # 主进程
│   │   ├── index.ts                  # 入口：单实例 + 生命周期 + 启动全部服务
│   │   ├── tray.ts                   # Tray 管理（SVG 圆点 + 颜色状态机）
│   │   ├── window.ts                 # BrowserWindow 创建/显示/隐藏/pin
│   │   ├── server.ts                 # Express HTTP server
│   │   ├── approval-queue.ts         # Promise 阻塞审批队列
│   │   ├── db.ts                     # better-sqlite3 封装
│   │   ├── config.ts                 # YAML 配置加载
│   │   ├── deepseek.ts               # DeepSeek 余额 API
│   │   ├── claude-sessions.ts        # Claude Code session 发现
│   │   ├── services.ts               # 定时任务（余额轮询 + session 扫描）
│   │   ├── notifications.ts          # Electron Notification 封装
│   │   └── ipc-handlers.ts           # ipcMain.handle 集中注册
│   │
│   ├── preload/
│   │   └── index.ts                  # contextBridge
│   │
│   └── renderer/                     # 渲染进程 (React)
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx                   # 根布局：widget-window（340px 挂件，无侧边栏）
│       ├── globals.css               # Tailwind 指令 + CSS 变量 + 全局样式
│       ├── components/
│       │   ├── WidgetHeader.tsx       # 顶部拖拽区（红绿灯 + 标题 + Pin）
│       │   ├── TrafficLights.tsx      # 红绿灯窗口控制按钮
│       │   ├── SegmentedControl.tsx   # 分段导航（Sessions/Usage/Settings）
│       │   ├── usage/
│       │   │   ├── UsageView.tsx      # API 用量页（余额 + 统计 + 趋势）
│       │   │   └── TrendSparkline.tsx # 30 天迷你面积趋势图
│       │   ├── sessions/
│       │   │   ├── SessionsView.tsx   # Sessions 监控页
│       │   │   ├── SessionCard.tsx    # 单 session 卡片
│       │   │   ├── StatusDot.tsx      # 状态指示灯（脉冲/静止）
│       │   │   ├── ContextGauge.tsx   # 上下文消耗进度条
│       │   │   ├── ApprovalBlock.tsx  # 命令审批块
│       │   │   └── ApprovalHistory.tsx # 审批历史（可折叠）
│       │   ├── settings/
│       │   │   └── SettingsView.tsx   # 设置页
│       │   └── shared/
│       │       ├── Card.tsx           # 通用卡片（半透明 0.55）
│       │       ├── Button.tsx         # 通用按钮
│       │       └── Badge.tsx          # 通用标签
│       ├── hooks/
│       │   ├── useUsageData.ts
│       │   ├── useSessionsData.ts
│       │   └── useApprovals.ts
│       └── lib/
│           ├── formatters.ts
│           └── danger-words.ts

├── resources/
│   └── hooks/
│       └── approve.sh               # Bash hook 脚本

└── docs/
    ├── REQUIREMENTS.md
    ├── DESIGN.md                    # 本文件
    └── TASKS.md
```

---

## 4. 渲染进程组件树

> 基准原型 `harness_monitor.html`：**340px 悬浮挂件，无侧边栏**，顶部分段控制器切换视图。托盘下拉菜单是 Electron 原生 `Menu`（在 `tray.ts` 构建），**不是**渲染进程组件。

```
<App>                                        // 340px 悬浮挂件根
└── <div.widget-window>                      // 悬浮窗体（毛玻璃 + 圆角 16px）
    ├── <WidgetHeader>                       // 44px 顶部拖拽区（-webkit-app-region: drag）
    │   ├── <TrafficLights>                  // 红绿灯 10px 圆点
    │   │   ├── Close (red)    → win.hide()（不 quit）
    │   │   ├── Minimize (yellow) → win.minimize()
    │   │   └── Maximize (green)  → toggle maximize
    │   ├── 标题 "Harness Monitor" + 应用图标
    │   └── <PinIcon />                      // Keep on top 切换（alwaysOnTop）
    │
    ├── <SegmentedControl>                   // 分段导航（替代侧边栏）
    │   ├── <Segment id="sessions" label="Sessions" badge={pendingCount} />
    │   ├── <Segment id="usage"    label="API Usage" />
    │   └── <Segment id="settings" icon="gear" />
    │
    └── <div.content-area>                   // 可滚动内容区（4px 隐藏滚动条）
        └── {activeView === 'sessions' && <SessionsView />}
            {activeView === 'usage'    && <UsageView />}
            {activeView === 'settings' && <SettingsView />}

// ─── 视图内部展开 ───

<SessionsView>
├── <SessionCard> × N
│   ├── Header: <StatusDot /> (脉冲/静止) + name + [Terminal] 图标按钮
│   ├── Badges: provider 徽章 + "Model: xxx" 工具徽章
│   ├── <ContextGauge /> (Ctx: NN% + cyan 进度条)  …  Mem: NNM
│   └── <ApprovalBlock /> (条件渲染: 有 pending 审批时展开, 红边紧急卡片)
│       ├── "Wait Approval (45s)" 红色警告头 + 警告图标
│       ├── 命令文本 (等宽黑底白字, 危险关键字 #ff6b6b 高亮)
│       └── [Reject] [Approve (primary)]
└── <ApprovalHistory /> (可折叠, 最近 20 条, FR-3.7)

<UsageView>
├── <Card> (余额卡)
│   ├── "Current API Balance" + "Live" 绿色徽章
│   └── 余额大数字 ¥14.25 (28px, ¥ 符号 16px)
├── <Card> (统计卡, 竖线分隔左右)
│   ├── Today's Tokens
│   └── Monthly Spent
└── <Card> (趋势卡)
    └── <TrendSparkline /> (60px 迷你面积折线, 30 天, hover 显示数值)

<SettingsView>
├── <Card> General
│   ├── Start at Login (checkbox)
│   ├── Always on Top (checkbox)
│   └── Desktop Notifications (checkbox)
├── <Card> Limits & Alerts
│   └── Balance Warning (¥) (number input)
└── [Quit Harness Monitor] (红色全宽按钮)
```

**原型未覆盖的需求项（实现约定，防止返工）**：

| 需求 | 原型现状 | 实现约定 |
|------|---------|---------|
| FR-2.5 运行时长 Uptime | 卡片未画 | 作为第二行微文字补充，或并入 Mem 行右侧 |
| FR-2.8 Stop 按钮 | 卡片未画 | 不占卡片版面，放卡片 hover 浮层/右键菜单 |
| FR-1.2 千 token 均价 | 未画 | 并入统计卡第三列（需放宽竖线布局）或与产品确认后取舍 |
| FR-1.3 趋势图例/网格/坐标轴 | 仅 sparkline | widget 宽度限制，用 sparkline + hover Tooltip，不画完整坐标系 |
| FR-1.4 余额进度条（绿/黄/红） | 未画 | 余额卡底部补 3px 进度条，颜色随阈值切换 |
| FR-3.7 审批历史 | 未画 | SessionsView 底部可折叠块 |
| FR-5.4 审批超时设置 | 未画 | Limits & Alerts 卡片追加一行 |

---

## 5. 数据流

### 5.1 用量数据

```
services.ts (定时器触发，默认每 1 分钟)
  → deepseek.checkBalance()
    → fetch("https://api.deepseek.com/user/balance",
            {headers: {Authorization: "Bearer $KEY"}})
    → 解析 JSON → BalanceInfo
  → db.recordUsage(balanceInfo)
  → win.webContents.send("usage:updated", db.getLatestUsage())

renderer:
  preload.onUsageUpdated → useUsageData hook
    → UsageView:
        余额卡片 {balance, todayTokens, monthUsed, avgPrice}
        TrendSparkline {dailyUsage[] → <AreaChart mini>}
```

### 5.2 Session 扫描

```
services.ts (每 3 秒定时器)
  → claudeSessions.discoverSessions()
    → fs.readdirSync("~/.claude/sessions").filter(f => f.endsWith(".json"))
      (与 §6.8.2 扫描方式一致，不引入 fastGlob 依赖)
    → for each file:
        JSON.parse → pid, sessionId, name, cwd, status, startedAt
        fs.readFile("/proc/{pid}/status") → parse VmRSS
        glob("~/.claude/projects/*/{sessionId}.jsonl") → 取末条 usage → ctxPct（见 §6.8.2e）
        fs.readFile("~/.claude/settings.json") → env → modelMapping
  → 合并 approvalQueue.getAll() → 设置 hasApproval
  → win.webContents.send("sessions:updated", sessions)

renderer:
  preload.onSessionsUpdated → useSessionsData hook
    → SessionsView:
        SessionCard × N (每个 active session)
```

### 5.3 审批全流程

```
[Claude Code preToolUse hook fires]
  → approve.sh reads stdin JSON
  → curl -X POST http://127.0.0.1:18456/approve -d @- (阻塞)

[Express POST /approve]
  → parse body → {harness, session, command, cwd}
  → approvalQueue.enqueue(payload) → {id, promise}
  → win.webContents.send("approval:pending", {id, ...payload})
  → notifications.notifyApproval(payload)
  → tray.setIconColor('amber')
  → await Promise.race([promise, timeout(60s)])

[Renderer receives approval:pending]
  → useApprovals hook → setPendingApprovals
  → SegmentedControl Sessions 分段 badge 更新
  → SessionCard 展开 <ApprovalBlock>

[User clicks Approve]
  → window.electronAPI.respondApproval(id, true)
    → IPC → ipcMain.handle("approval:respond")
      → approvalQueue.respond(id, true)
        → promise resolves → Express returns {"allowed": true}
      → db.recordApproval(...)
      → win.webContents.send("approval:resolved", {id, allowed: true})
      → if queue empty: tray.setIconColor('green')

[approve.sh]
  → curl response {"allowed": true}
  → grep "allowed.*true" → exit 0 → command executes
```

### 5.4 设置保存

```
[User modifies settings in SettingsView]
  → window.electronAPI.saveConfig(partial)
    → IPC → ipcMain.handle("config:save")
      → deep merge partial into current config
      → fs.writeFile("~/.config/harness-monitor/config.yaml", yamlString)
      → restart affected services
```

---

## 6. 模块设计（主进程）

以下模块设计与 UI 无关，保持稳定：

### 6.1 config.ts — 配置管理

```
Search paths (优先级从高到低):
  1. --config CLI 参数（预留）
  2. ~/.config/harness-monitor/config.yaml
  3. ~/.config/claude-monitor/config.yaml   (向后兼容)
  4. <app>/config.yaml                      (打包内置默认值)

加载策略: deep merge — 用户文件只写需要覆盖的 key，其余从默认配置继承
```

**Config 类型定义**：

```typescript
interface AppConfig {
  server: { host: string; port: number }
  providers: {
    deepseek: {
      balance_url: string
      check_interval_min: number          // 默认 1（分钟）
      balance_warn_threshold: number      // 默认 0.15
    }
  }
  harnesses: {
    'claude-code': {
      sessions_glob: string
      settings_path: string
      refresh_interval_sec: number        // 默认 3
      config_dirs: string[]               // Claude config 目录（多 profile，默认 ["~/.claude"]，见 §6.8.1）
    }
  }
  notifications: {
    enabled: boolean
    approve_timeout_sec: number           // 默认 60
  }
  window: { width: number; height: number }
  autostart: { enabled: boolean }
}
```

### 6.2 db.ts — 数据库

**数据库路径**：`app.getPath('userData')/monitor.db`（Linux 下为 `~/.config/harness-monitor/monitor.db`）。

**Schema**：

```sql
CREATE TABLE api_usage (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    provider         TEXT    NOT NULL DEFAULT 'deepseek',
    model            TEXT    NOT NULL DEFAULT 'all',
    balance          REAL    NOT NULL DEFAULT 0,
    balance_currency TEXT    NOT NULL DEFAULT 'CNY',
    today_tokens     INTEGER NOT NULL DEFAULT 0,
    month_used       REAL    NOT NULL DEFAULT 0,
    total_budget     REAL    NOT NULL DEFAULT 0,
    timestamp        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_usage_provider_time ON api_usage(provider, model, timestamp);

CREATE TABLE approval_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    harness      TEXT    NOT NULL,
    session_name TEXT,
    command      TEXT    NOT NULL,
    cwd          TEXT,
    tool         TEXT    DEFAULT 'Bash',
    allowed      INTEGER NOT NULL DEFAULT 0,
    timestamp    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_approval_time ON approval_history(timestamp DESC);
```

**DAO 方法**：

| 方法 | SQL | 用途 |
|------|-----|------|
| `recordUsage(provider, model, balance, currency, tokens, used, budget)` | INSERT | 余额快照入库 |
| `getLatestUsage()` | SELECT MAX(id) GROUP BY provider, model | 用量 View 展示 |
| `get30DayUsage(provider, model)` | SELECT DATE(timestamp) as day, SUM(today_tokens) as tokens GROUP BY day | 趋势图数据 |
| `recordApproval(harness, session, cmd, cwd, allowed)` | INSERT | 审批历史入库 |
| `getRecentApprovals(limit=20)` | SELECT ORDER BY timestamp DESC LIMIT ? | 历史列表 |

### 6.3 tray.ts — 系统托盘

**图标**：代码生成 SVG data URL（22×22 圆点 + 外发光），无需外部图片资源。

**颜色状态机**（优先级从高到低）：

| 优先级 | 颜色 | 条件 |
|--------|------|------|
| 0 (最高) | 红 `#ff5252` | 余额 < totalBudget × warn_threshold |
| 1 | 橙 `#ffab00` | approvalQueue.size > 0 |
| 2 (默认) | 绿 `#00e676` | 一切正常 |
| 特殊 | 灰 `#5a6d82` | HTTP server 未启动 / 致命错误 |

**菜单**（右键，原生 `Menu.buildFromTemplate`，结构对齐原型 `harness_monitor.html` 的托盘下拉）：

```
Harness Monitor            (label, disabled)
Show Dashboard   ⌘O        → win.show() + focus
Hide Dashboard   ⌘H        → win.hide()
──────────────
Active Agents              (label)
  ●  <session.name>  <project>   × N   (动态：状态点颜色 + 名称 + 项目名)
──────────────
Preferences...   ⌘,        → 打开 Settings 视图
──────────────
Quit Harness Monitor  ⌘Q   (danger 标红)
```

> Active Agents 为动态列表，需在 `right-click` 事件中用最新 session 快照重建菜单。Linux appindicator 支持该结构（见 §2.10）。

**左键**：toggle 面板显示/隐藏

### 6.4 window.ts — 窗口管理

```
BrowserWindow 配置:
  width: config.window.width    (默认 340，来自 config.yaml，见 §2.9/§8.1)
  height: config.window.height  (默认 650，来自 config.yaml；设计资料为 80vh/max 650px)
  frame: false               (无边框，自定义红绿灯)
  resizable: true
  skipTaskbar: false
  show: false                (初始隐藏，ready 后 show)
  webPreferences:
    preload: <preload script>
    contextIsolation: true
    nodeIntegration: false

行为:
  - tray 左键 → win.show() + win.focus() / win.hide()
  - 红绿灯: Close → win.hide() (不 quit)
  - Pin 切换 → alwaysOnTop toggle
```

### 6.5 server.ts — HTTP API

| Method | Path | Handler | 描述 |
|--------|------|---------|------|
| GET | `/health` | `handleHealth` | `{"status":"ok"}` |
| GET | `/api/usage` | `handleGetUsage` | 最新用量记录 |
| GET | `/api/sessions` | `handleGetSessions` | 活跃 session 数组 |
| GET | `/api/approvals` | `handleGetApprovals` | 当前 pending 审批 |
| POST | `/approve` | `handleApprove` | **阻塞式**审批 |
| POST | `/approve/:id/respond` | `handleRespond` | 解析指定审批 |

**端口冲突处理（REVIEW #7）**：`config.server.port` 硬编码 `18456` 可能被占用（如旧版 Python 进程未退出），`server.listen()` 会抛 `EADDRINUSE` 导致主进程 crash。处理策略：

```
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // 1. 探测是否为"自己的旧实例"：GET http://127.0.0.1:{port}/health
    //    若返回 {"status":"ok"} → 说明已有 harness-monitor 在跑，
    //    配合单实例锁(FR-6.1)本不应走到这里；记录日志后正常退出(0)，不重复起服务
    // 2. 否则为外部占用 → 顺序尝试 port+1..port+N（默认 N=10）
    // 3. 全部占用 → 记 error 日志 + 桌面通知 + tray 置灰，应用继续运行
    //    （余额/session 监控不依赖 HTTP，仅审批链路不可用）
  }
})
```

> 说明：审批 hook（approve.sh）需知道实际端口。实际监听端口写入 `app.getPath('userData')/server.port` 运行时文件，approve.sh 优先读该文件，回退到默认 18456（见 §6.13）。

### 6.6 approval-queue.ts — 审批队列

```typescript
class ApprovalQueue {
  private pending: Map<string, {
    resolve: (allowed: boolean) => void
    timeout: NodeJS.Timeout
    payload: ApprovalPayload
  }>

  enqueue(payload): { id: string; promise: Promise<boolean> }
  respond(id: string, allowed: boolean): boolean
  getAll(): PendingApproval[]
  get size(): number
}
```

超时：60s `setTimeout` → 自动 `.resolve(false)`（deny）。

**id 生成策略（REVIEW #12）**：`enqueue()` 中的 `id` 使用 **`crypto.randomUUID()`**（Node.js 内置，无需依赖），生成 RFC 4122 v4 UUID 字符串。

- 类型：`string`（与 §6.12 `PendingApproval.id`、§7 `respondApproval(id: string)`、§6.11 `approval:respond` payload 一致）
- 选择理由：HTTP 端（approve.sh 无需感知 id，只等响应）与 IPC/UI 端共用同一 id 定位审批项；UUID 无状态、无需持久化自增计数器、重启不冲突、并发安全，优于自增整数（需跨重启持久化）和时间戳（同毫秒并发会碰撞）。
- UUID 仅存在于内存 Map 与运行时 IPC，不落库；`approval_history` 表用自身的 `INTEGER AUTOINCREMENT id`（见 §6.2）。

### 6.7 deepseek.ts — 余额查询

```
API: GET https://api.deepseek.com/user/balance
Auth: Authorization: Bearer $DEEPSEEK_API_KEY
Timeout: 15s (AbortSignal.timeout)
间隔: config.providers.deepseek.check_interval_min 分钟（默认 1）
```

**响应结构（REVIEW #4 补回）**：`GET /user/balance` 返回：

```json
{
  "is_available": true,
  "balance_infos": [
    {
      "currency": "CNY",
      "total_balance": "14.25",
      "granted_balance": "4.25",
      "topped_up_balance": "10.00"
    }
  ]
}
```

> 注意：金额字段是**字符串**，需 `parseFloat()`；`balance_infos` 是数组，v3.0 取 `[0]`（单账户单币种）。

**字段映射**（DeepSeek 响应 → 内部 `BalanceInfo`（§6.12）→ `api_usage` 表列（§6.2））：

| DeepSeek 响应字段 | 内部字段 (`BalanceInfo`) | db 列 (`api_usage`) | 处理 |
|-------------------|-------------------------|---------------------|------|
| `is_available` | — | — | `false` → 视为服务不可用，按错误态保留上次数据（NFR-3） |
| `balance_infos[0].total_balance` | `balance` | `balance` | `parseFloat`，字符串 → REAL |
| `balance_infos[0].currency` | `currency` | `balance_currency` | 默认 `"CNY"` |
| `balance_infos[0].granted_balance` | （预留） | — | 赠送余额，v3.0 不展示 |
| `balance_infos[0].topped_up_balance` | （预留） | — | 充值余额，v3.0 不展示 |
| —（该接口不返回） | `todayTokens` | `today_tokens` | v3.0 置 0；token 消耗统计为后续扩展 |
| —（该接口不返回） | `monthUsed` | `month_used` | 由相邻快照余额差值估算（余额下降额），无历史置 0 |
| `topped_up + granted` 或配置预算 | `totalBudget` | `total_budget` | 余额百分比 = `balance / totalBudget`，用于 §6.3 告警阈值判定 |

> HTTP 非 200 / 超时 / JSON 解析失败 → 抛错，由 services.ts 捕获后保留上次快照（T-1.3 / NFR-3）。

### 6.8 claude-sessions.ts — Session 发现

> **参考 abtop** `src/collector/claude.rs` — ClaudeCollector::collect_sessions() 的完整实现已验证，本节直接复用其核心流程。关键差异：abtop 是 Rust 实现，harness-monitor 用 Node.js 重写同逻辑。

#### 6.8.1 Config 目录发现（参考 abtop `ConfigDir` / `refresh_config_dirs`）

```
发现策略（多 profile 支持）:
1. 始终扫描默认 ~/.claude/
2. glob ~/.claude-* → 过滤含 sessions/ + projects/ 子目录的
3. 读取**自身** config.yaml 的 `harnesses.claude-code.config_dirs` 字段
   （见 §6.1 / §8.1；不依赖 abtop 的 ~/.config/abtop/config.toml）
4. 从 CLAUDE_CONFIG_DIR 环境变量发现
5. 从运行中 claude 进程的 /proc/<pid>/environ 发现 CLAUDE_CONFIG_DIR
```

> 注意：当前 v3.0 默认只扫描 `~/.claude/`，上述 2-5 步为后续扩展预留。

#### 6.8.2 Session 扫描流程（参考 abtop `ClaudeCollector::collect_sessions`）

```
扫描流程:
1. 扫描 config_dirs 中每个 sessions/ 目录下的 *.json 文件
   （abtop 使用 BTreeSet 去重，确保相同 session_id 只加载一次）

2. For each session JSON file:
   a. JSON.parse → 提取字段:
      - pid: number          (进程 ID)
      - sessionId: string    (唯一标识)
      - cwd: string          (工作目录)
      - startedAt: number    (Unix ms)
      - name: string         (项目名，从 cwd basename 取)
   
   b. 字段清理 (参考 abtop SessionFile::sanitize):
      - sessionId 截断到 256 字符
      - cwd 截断到 4096 字符
      - pid 为 0 则跳过

   c. 进程内存 (参考 abtop process.rs::get_process_info):
      Linux:   fs.readFile("/proc/{pid}/stat") → 解析第 22 字段 (rss) × page_size / 1024 → rss_kb
               转换为 MB
      macOS:   child_process.execSync("ps -o rss= -p {pid}") → KB
      Windows: sysinfo 库
      注意: AI 进程 ID 获取到内存，可能不包含子进程

   d. Session 状态判定 (参考 abtop SessionStatus 枚举):
      - 检查进程是否存在:
        Linux:   fs.existsSync("/proc/{pid}")
        macOS:   child_process.execSync("kill -0 {pid}") 成功
        Windows: process.kill(pid, 0)
      - 进程存在但 CPU < 阈值 → "idle" (Waiting)
      - 进程存在且 CPU > 阈值 → "busy" (Thinking/Executing)
      - 进程不存在 → "idle" + memory=0
        (abtop 中对应的判断逻辑见 process.rs::has_active_descendant)

   e. 上下文百分比估算（与 Claude Code 终端底部上下文指示条同源）:
      glob("~/.claude/projects/*/{sessionId}.jsonl")
      → 逐行解析，取**最后一条 assistant 消息**的 usage:
        contextTokens = input_tokens
                      + cache_read_input_tokens
                      + cache_creation_input_tokens
      → context_window: 200K (默认) 或 1M (1M上下文模型)
        参考 abtop collector::context_window_for_model() / §11.2 contextWindowForModel()
      → ctxPct = min(100, round(contextTokens / context_window × 100))
      说明: 与本机 `~/.claude/statusline.py` 状态栏的算法一致，直接反映真实上下文占用；
            早期"行数 × 5"的粗估已弃用（误差大且与终端指示条不符）。
            transcript 无 usage 字段时回退为 0。

   f. API Provider 解析 (参考 abtop ClaudeCollector):
      读取 ~/.claude/settings.json
      → 提取 ANTHROPIC_DEFAULT_*_MODEL_NAME 环境变量
      → 映射到 apiProvider 名称 (如 "deepseek-v4-pro")
      (abtop 中从 /proc/<pid>/environ 读取，更可靠)

   g. uptime = (Date.now() - startedAt) / 1000

3. 过滤:
   - 排除 pid == process.pid 的自身进程 (abtop 实现)
   - 排除 status == "done" 的 session (abtop 实现)
   - 按 startedAt 降序排列 (abtop 实现)

4. 合并:
   - 将 approvalQueue.getAll() 中的 pending 审批合并到对应 session
   - session.hasPendingApproval = approvalQueue 中存在匹配项
```

#### 6.8.3 与实际原型图的对应

abtop `collect_sessions` 返回的 `AgentSession` 结构包含字段远多于 harness-monitor 需求（token history、chat messages、tool calls、file access audit、subagents、git status、orphan ports 等），这些为后续扩展预留。当前 v3.0 仅采集原型图中展示的核心字段：name、status、uptime、memoryMB、apiProvider、ctxPct、cwd。

#### 6.8.4 终端跳转（参考 abtop jump 模块）

> abtop `src/jump/` 支持 cmux → tmux → iTerm2 的适配器链模式，harness-monitor 简化为此流程：

```
终端打开优先级 (Linux):
1. 检查是否在 cmux 环境中 → 调用 cmux API 跳转到对应窗格
2. 检查 TMUX 环境变量 → tmux split-window / new-window
3. 检查 WAYLAND_DISPLAY → kgx (gnome-console)
4. 检查 DISPLAY → gnome-terminal
5. 回退 → xterm
```

> abtop 的适配器模式（`TerminalJumper` trait + `resolve` 链式遍历）可以直接在 Node.js 中用策略模式复现：
> ```typescript
> interface TerminalJumper {
>   name: string
>   tryJump(pid: number, cwd: string): JumpResult // NotApplicable | Jumped | Failed
> }
> // 按优先级排列: cmux → tmux → kgx → gnome-terminal → xterm
> ```

### 6.9 services.ts — 定时任务

| 任务 | 间隔 | 逻辑 |
|------|------|------|
| balanceCheck | `check_interval_min` 分钟（默认 1） | checkBalance → db.recordUsage → push → 阈值检查 |
| sessionScan | `refresh_interval_sec` 秒（默认 3） | discoverSessions → push → update tray color |

### 6.10 notifications.ts — 桌面通知

```typescript
function notifyApproval(payload): void  // 审批到达通知
function notifyBalanceLow(balance, currency): void  // 余额告警通知
```

- 通知点击 → `win.show()` 弹窗

### 6.11 ipc-handlers.ts — IPC 通道

| Channel | 方向 | Payload | 返回 |
|---------|------|---------|------|
| `usage:get` | renderer→main | 无 | `UsageRecord[]` |
| `sessions:get` | renderer→main | 无 | `SessionInfo[]` |
| `history:get` | renderer→main | `limit?: number` | `ApprovalRecord[]` |
| `config:get` | renderer→main | 无 | `AppConfig` |
| `config:save` | renderer→main | `Partial<AppConfig>` | `void` |
| `app:refresh` | renderer→main | 无 | `void` |
| `session:jump-terminal` | renderer→main | `cwd: string` | `boolean` |
| `session:terminate` | renderer→main | `pid: number` | `boolean` |
| `approval:respond` | renderer→main | `{id, allowed}` | `boolean` |
| `app:toggle-pin` | renderer→main | `pinned: boolean` | `void` |
| `usage:updated` | main→renderer | `UsageRecord[]` | (push) |
| `sessions:updated` | main→renderer | `SessionInfo[]` | (push) |
| `approval:pending` | main→renderer | `ApprovalPayload` | (push) |
| `approval:resolved` | main→renderer | `{id, allowed}` | (push) |
| `tray:color-changed` | main→renderer | `string` | (push) |

### 6.12 共享类型定义（REVIEW #1）

> IPC 两端（主进程 ↔ 渲染进程）与 HTTP 端共用的核心类型。统一放置于 `src/shared/types.ts`，主进程、preload、渲染进程均从此 import，**避免各端字段名漂移**。`AppConfig` 见 §6.1。

```typescript
// ─── Session 监控 ───

/** Session 状态：busy=Working（脉冲灯）/ idle=Waiting（静止灯） */
export type SessionStatus = 'busy' | 'idle'

/** claude-sessions.ts 产出 → SessionCard 渲染（§6.8 / §4） */
export interface SessionInfo {
  sessionId: string           // Claude session 唯一 id（截断 256，§6.8.2b）
  pid: number                 // 进程 id
  name: string                // 项目名（cwd basename）
  status: SessionStatus
  tool: string                // 当前工具，如 "Bash"（卡片 tool badge）
  apiProvider: string         // 解析后的 provider 名（§6.8.2f）
  uptimeSec: number           // 运行时长（秒）= (now - startedAt)/1000
  memoryMB: number            // 物理内存 MB（进程死亡为 0）
  ctxPct: number              // 上下文消耗百分比 0-100（§6.8.2e）
  cwd: string                 // 工作目录（截断 4096，§6.8.2b）
  startedAt: number           // Unix ms
  hasPendingApproval: boolean // approvalQueue 中存在匹配项
}

// ─── API 用量 ───

/** DeepSeek GET /user/balance 原始响应（§6.7） */
export interface DeepSeekBalanceResponse {
  is_available: boolean
  balance_infos: {
    currency: string          // "CNY"
    total_balance: string     // 字符串金额，需 parseFloat
    granted_balance: string
    topped_up_balance: string
  }[]
}

/** deepseek.ts 解析后的内部余额模型（§5.1 / §6.7） */
export interface BalanceInfo {
  provider: string            // "deepseek"
  balance: number             // total_balance parseFloat
  currency: string            // "CNY"
  todayTokens: number         // v3.0 置 0（§6.7）
  monthUsed: number           // 相邻快照余额差值估算
  totalBudget: number         // 余额百分比基准（告警阈值判定）
}

/** api_usage 表行（§6.2）→ UsageView 渲染；db INTEGER/REAL → TS 映射 */
export interface UsageRecord {
  provider: string            // "deepseek"
  model: string               // "all"
  balance: number
  balanceCurrency: string     // "CNY"
  todayTokens: number
  monthUsed: number
  totalBudget: number
  timestamp: string           // ISO 8601（db datetime('now')）
}

// ─── 审批流程 ───

/** approve.sh POST /approve 的请求体 / IPC approval:pending 的负载（§5.3） */
export interface ApprovalPayload {
  harness: string             // "claude-code"
  session: string             // session 名 / id
  command: string             // 待审批命令全文
  cwd: string                 // 工作目录
  tool: string                // "Bash"
}

/** 队列内审批项 = payload + 运行时字段（§6.6 getAll()） */
export interface PendingApproval extends ApprovalPayload {
  id: string                  // crypto.randomUUID()（§6.6 id 策略）
  createdAt: number           // Unix ms
  timeoutSec: number          // 配置超时，默认 60（§6.6）
}

/** approval_history 表行（§6.2）→ ApprovalHistory 渲染；db allowed INTEGER → boolean */
export interface ApprovalRecord {
  id: number                  // db AUTOINCREMENT
  harness: string
  sessionName: string | null
  command: string
  cwd: string | null
  tool: string
  allowed: boolean
  timestamp: string           // ISO 8601
}

/** approval:respond / respondApproval 的负载 */
export interface ApprovalResponse {
  id: string
  allowed: boolean
}
```

> 序列化约定：主进程经 `structuredClone` / IPC 传递纯 JSON，不含 Date/Map；时间一律 `number`(Unix ms) 或 ISO `string`，渲染侧用 `lib/formatters.ts` 格式化。

### 6.13 approve.sh — Hook 脚本设计（REVIEW #2）

> 对应 **FR-3.1（P0）**。脚本位于 `resources/hooks/approve.sh`，作为 Claude Code 的 **PreToolUse** hook（匹配 `tool_name == "Bash"`）注册到 `~/.claude/settings.json` 的 `hooks.PreToolUse`。

#### 6.13.1 Claude Code hook 传入的 stdin JSON schema

Claude Code 触发 PreToolUse hook 时，向脚本 **stdin** 写入如下 JSON：

```json
{
  "session_id": "9f8a...c2",
  "transcript_path": "/home/cury/.claude/projects/-home-cury-app/9f8a.jsonl",
  "cwd": "/home/cury/app",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "sudo rm -rf ./dist",
    "description": "清理构建产物"
  }
}
```

#### 6.13.2 字段提取（command / cwd）

用 `jq` 从 stdin 提取（需声明 `jq` 依赖）：

| 目标 | jq 表达式 | 回退 |
|------|-----------|------|
| command | `.tool_input.command` | 空 → 非 Bash 或无命令，直接放行 |
| cwd | `.cwd` // `.tool_input.path` 所在目录 | 空 → `.` |
| session | `.session_id` | 空 → `"unknown"` |

#### 6.13.3 请求与超时处理

```bash
#!/usr/bin/env bash
# Claude Code PreToolUse hook — Bash 命令阻塞式审批
set -uo pipefail   # 不用 -e：curl 失败需自行兜底，不能直接中断

# 实际端口：优先读运行时文件（§6.5 端口冲突时会变），回退默认
PORT_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/harness-monitor/server.port"
PORT="$(cat "$PORT_FILE" 2>/dev/null || echo 18456)"
SERVER="http://127.0.0.1:${PORT}"
# 客户端超时要 > 服务端 approve_timeout_sec(60s)，否则客户端先超时误判
CURL_MAX=65

input="$(cat)"
command=$(jq -r '.tool_input.command // empty' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
session=$(jq -r '.session_id // "unknown"' <<<"$input")

# 非 Bash / 无 command → 放行
[[ -z "$command" ]] && exit 0

# 阻塞式 POST；-m 总超时，-sS 静默但保留错误
response=$(curl -sS -m "$CURL_MAX" \
  -X POST "$SERVER/approve" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg h claude-code --arg s "$session" \
            --arg c "$command" --arg w "$cwd" \
            '{harness:$h, session:$s, command:$c, cwd:$w, tool:"Bash"}')" \
  2>/dev/null)
curl_status=$?
```

**server 未启动 / 超时 / 网络错误处理**（`curl_status != 0`）：

| 情况 | 处理 | 理由 |
|------|------|------|
| 连接拒绝（server 未启动） | **fail-open：exit 0 放行**，stderr 提示 "harness-monitor 未运行" | 监控应用不应成为用户开发的硬阻塞；用户未开面板即视为放弃审批 |
| `-m 65` 超时（server hang） | 同上 fail-open exit 0 | 服务端 60s 已先 deny，客户端超时属异常兜底 |
| 需强制审批的场景 | 可配 `HARNESS_MONITOR_FAIL_CLOSE=1` → 改 exit 2 拦截 | 预留严格模式开关 |

> fail-open vs fail-close 是安全权衡：默认 fail-open 保证可用性（REQUIREMENTS 定位为日常生产力工具），严格模式通过环境变量切换到 fail-close。

#### 6.13.4 响应解析与 exit code 约定

```bash
# 服务端返回 {"allowed": true} 或 {"allowed": false}
if grep -q '"allowed"[[:space:]]*:[[:space:]]*true' <<<"$response"; then
  exit 0        # approve → 命令执行
else
  echo "harness-monitor 已拒绝该命令: $command" >&2
  exit 2        # deny → Claude Code 拦截此工具调用
fi
```

**exit code 约定**（遵循 **Claude Code PreToolUse hook 规范**，而非朴素 0/1/2）：

| exit code | 含义 | Claude Code 行为 |
|-----------|------|-----------------|
| `0` | approve（放行） | 执行该 Bash 命令 |
| `2` | deny（拦截） | **阻断工具调用**，stderr 内容回传给 Claude |
| 其他非零 | error（非阻塞错误） | 命令**仍会执行**，stderr 写入 transcript |

> ⚠️ 关键点：Claude Code 的 PreToolUse hook 中**只有 exit 2 能真正拦截命令**；exit 1 被视为"非阻塞错误"，命令照常执行。因此拒绝必须用 `exit 2`（配合 stderr 说明原因），这也是 §5.3 数据流 "deny → 命令不执行" 的唯一正确实现。本节约定与 REVIEW #2 建议的 `0/1/2` 的差异正源于此。

#### 6.13.5 注册方式

安装时写入 `~/.claude/settings.json`（harness-monitor 提供一键注册，或用户手动）：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "/path/to/resources/hooks/approve.sh" }
        ]
      }
    ]
  }
}
```

---

## 7. Preload API

```typescript
interface ElectronAPI {
  // Request/Response
  getUsageData(): Promise<UsageRecord[]>
  getSessionsData(): Promise<SessionInfo[]>
  getApprovalHistory(): Promise<ApprovalRecord[]>
  getConfig(): Promise<AppConfig>
  saveConfig(partial: Partial<AppConfig>): Promise<void>
  manualRefresh(): Promise<void>
  jumpToTerminal(cwd: string): Promise<boolean>
  terminateSession(pid: number): Promise<boolean>
  respondApproval(id: string, allowed: boolean): Promise<boolean>
  togglePin(pinned: boolean): Promise<void>

  // Push events → 返回 unsubscribe 函数
  onUsageUpdated(cb: (data: UsageRecord[]) => void): () => void
  onSessionsUpdated(cb: (sessions: SessionInfo[]) => void): () => void
  onApprovalPending(cb: (data: ApprovalPayload) => void): () => void
  onApprovalResolved(cb: (data: {id: string; allowed: boolean}) => void): () => void
  onTrayColorChanged(cb: (color: string) => void): () => void
}
```

---

## 8. 配置设计

### 8.1 config.yaml schema

```yaml
server:
  host: "127.0.0.1"
  port: 18456

providers:
  deepseek:
    balance_url: "https://api.deepseek.com/user/balance"
    check_interval_min: 1
    balance_warn_threshold: 0.15

harnesses:
  claude-code:
    sessions_glob: "~/.claude/sessions/*.json"
    settings_path: "~/.claude/settings.json"
    refresh_interval_sec: 3
    config_dirs:                      # 额外的 Claude config 目录（多 profile，见 §6.8.1）
      - "~/.claude"                   # 默认始终包含

notifications:
  enabled: true
  approve_timeout_sec: 60

window:                               # 尺寸以设计资料为准，见 §2.9
  width: 340
  height: 650

autostart:
  enabled: false
```

### 8.2 加载策略

```
优先级：用户 custom > 内置 default

algorithm:
  defaults = parse(<app>/config.yaml)
  user_paths = [
    ~/.config/harness-monitor/config.yaml,
    ~/.config/claude-monitor/config.yaml,   // backward compat
  ]
  for path in user_paths:
    if path.exists:
      user_config = parse(path)
      defaults = deepMerge(defaults, user_config)
  return defaults
```

---

## 9. 测试用例

### 9.1 余额监控

| ID | 场景 | 预期结果 | 覆盖需求 |
|----|------|---------|---------|
| T-1.1 | `DEEPSEEK_API_KEY` 已设置 | UsageView 展示余额、货币、统计行 | FR-1.2 |
| T-1.2 | `DEEPSEEK_API_KEY` 未设置 | 卡片显示 "未配置 API Key" 空状态 | FR-1.1 |
| T-1.3 | API 返回非 200 | 保留上次数据，上次无数据则显示错误态 | NFR-3 |
| T-1.4 | 余额低于阈值 | Tray 红点 + 桌面通知 | FR-1.4 |
| T-1.5 | 30 天趋势图渲染 | LineChart 正确展示数据 | FR-1.3 |

### 9.2 Session 监控

| ID | 场景 | 预期结果 | 覆盖需求 |
|----|------|---------|---------|
| T-2.1 | 有活跃 Claude Code session | SessionCard 展示，busy 灯脉冲绿 | FR-2.5 |
| T-2.2 | Session 进程已死 | memory=0, status="idle" | NFR-3 |
| T-2.3 | 无 session 文件 | 显示 EmptyState "无活跃 Session" | NFR-4 |
| T-2.4 | 点击 Terminal 按钮 | 在 session cwd 打开终端 | FR-2.7 |
| T-2.5 | 点击 Stop 按钮 | SIGTERM 发送，卡片消失 | FR-2.8 |

### 9.3 审批

| ID | 场景 | 预期结果 | 覆盖需求 |
|----|------|---------|---------|
| T-3.1 | `curl POST /approve` | 桌面通知 + ApprovalBlock + Tray 橙色 | FR-3.3 / FR-3.8 |
| T-3.2 | 点击 Approve | HTTP 返回 allowed:true, Tray 变绿 | FR-3.5 |
| T-3.3 | 点击 Deny | HTTP 返回 allowed:false | FR-3.5 |
| T-3.4 | 60s 无人操作 | 自动 deny + 历史记录 | FR-3.2 |
| T-3.5 | 命令含 `sudo rm` | 危险关键字红色高亮 | FR-3.4 |
| T-3.6 | 展开审批历史 | 最近 20 条记录 + 时间戳 | FR-3.7 |

### 9.4 设置

| ID | 场景 | 预期结果 | 覆盖需求 |
|----|------|---------|---------|
| T-4.1 | 修改查询间隔 | config.yaml 更新，下次轮询按新间隔 | FR-5.3 |
| T-4.2 | 修改告警阈值 | 下次余额检查按新阈值判断 | FR-5.3 |
| T-4.3 | 关闭通知 | 后续审批不再弹桌面通知 | FR-5.2 |

### 9.5 托盘与窗口

| ID | 场景 | 预期结果 | 覆盖需求 |
|----|------|---------|---------|
| T-5.1 | Tray 颜色状态机 | 绿→橙（审批）→红（余额告警）正确切换 | FR-4.2 |
| T-5.2 | 右键菜单 | Show Panel / Quit 有效 | FR-4.3 |
| T-5.3 | 左键 toggle | 窗口显示/隐藏切换 | FR-4.4 |
| T-5.4 | 红绿灯 Close | 窗口隐藏（不退出） | FR-6.5 |

### 9.6 approve.sh Hook 脚本（REVIEW #10）

| ID | 场景 | 预期结果 | 覆盖需求 |
|----|------|---------|---------|
| T-6.1 | stdin 传入 Bash PreToolUse JSON，server 放行 | curl 收 `allowed:true`，exit 0，命令执行 | FR-3.1 / FR-3.5 |
| T-6.2 | server 返回 `allowed:false` | exit 2，stderr 含拒绝原因，命令被 Claude Code 拦截 | FR-3.1 / FR-3.5 |
| T-6.3 | server 未启动（连接拒绝） | fail-open exit 0，stderr 提示未运行，命令不阻塞 | FR-3.1 |
| T-6.4 | server 超时无响应（> 65s） | curl `-m` 超时，fail-open exit 0 | FR-3.1 |
| T-6.5 | `tool_name` 非 Bash / `tool_input.command` 为空 | 直接 exit 0，不发起请求 | FR-3.1 |
| T-6.6 | 命令含危险关键字且 60s 无人操作 | 服务端自动 deny → `allowed:false` → exit 2 | FR-3.2 / FR-3.4 |
| T-6.7 | `server.port` 运行时文件指向非默认端口 | 脚本读取该端口并正确连接 | FR-6.2 |

---

## 10. 需求-设计追溯矩阵

| 需求 ID | 设计章节 | 模块/组件 |
|---------|---------|----------|
| FR-1.1 余额查询 | 6.7, 6.9 | deepseek.ts + services.ts |
| FR-1.2 余额卡片 | 4, 5.1 | UsageView.tsx |
| FR-1.3 30天趋势图 | 4, 5.1 | TrendSparkline.tsx (Recharts AreaChart mini) |
| FR-1.4 余额告警 | 6.3, 6.10 | tray.ts + notifications.ts |
| FR-1.5 定时/手动刷新 | 6.9, 8.1 | services.ts |
| FR-1.6 用量持久化 | 6.2 | db.ts (SQLite) |
| FR-2.1 Session 发现 | 6.8, 6.9 | claude-sessions.ts + services.ts |
| FR-2.2 进程内存 | 6.8 | claude-sessions.ts (VmRSS) |
| FR-2.3 上下文估算 | 6.8 | claude-sessions.ts (history.jsonl) |
| FR-2.4 API Provider 解析 | 6.8 | claude-sessions.ts (settings.json) |
| FR-2.5 Session 卡片 | 4 | SessionCard.tsx + StatusDot.tsx |
| FR-2.6 上下文进度条 | 4 | ContextGauge.tsx |
| FR-2.7 跳转终端 | 6.11, 4 | IPC + SessionCard |
| FR-2.8 终止 Session | 6.11, 4 | IPC + SessionCard |
| FR-3.1 Hook 脚本 | 6.13 | resources/hooks/approve.sh |
| FR-3.2 审批阻塞 | 6.6 | approval-queue.ts |
| FR-3.3 审批卡片 | 4 | ApprovalBlock.tsx |
| FR-3.4 危险检测 | 4, renderer/lib | danger-words.ts |
| FR-3.5 双向响应 | 6.6, 5.3 | approval-queue + IPC + approve.sh |
| FR-3.6 结果动画 | 2.7 | ApprovalBlock.tsx |
| FR-3.7 审批历史 | 6.2, 4 | ApprovalHistory.tsx + db.ts |
| FR-3.8 桌面通知 | 6.10 | notifications.ts |
| FR-4.x 系统托盘 | 6.3 | tray.ts |
| FR-5.1~5.4 设置 | 4, 8.1 | SettingsView.tsx |
| FR-6.1 单实例锁 | — | index.ts |
| FR-6.2 HTTP API | 6.5 | server.ts |
| FR-6.3 健康检查 | 6.5 | GET /health |
| FR-6.4 YAML 配置 | 6.1, 8.2 | config.ts |
| FR-6.5 优雅退出 | — | index.ts |
| FR-6.6 开机自启 | 4, 8.1 | SettingsView + config |

---

## 11. 参考实现对照（abtop → harness-monitor）

> [abtop](https://github.com/graykode/abtop) 是一个 Rust TUI AI agent monitor，与 harness-monitor 有大量功能重叠。以下是已验证的核心实现对照：

### 11.1 模块映射

| abtop 模块 (Rust) | harness-monitor 模块 (Node.js/TS) | 功能 | 复用度 |
|-------------------|----------------------------------|------|--------|
| `collector/claude.rs` — ClaudeCollector | `claude-sessions.ts` — ClaudeSessionScanner | Session JSON 解析、进程状态、模型发现 | 完整复用（Node.js 重写） |
| `collector/process.rs` — get_process_info() | 内嵌在 claude-sessions.ts | /proc 文件系统解析（Linux） | 完整复用 |
| `collector/process.rs` — cmd_has_binary() | 内嵌在 claude-sessions.ts | 进程命令行匹配（含 autoupdater 布局） | 后续扩展 |
| `collector/process.rs` — is_descendant_of() | 内嵌在 claude-sessions.ts | 进程树遍历 | 后续扩展 |
| `collector/process.rs` — get_listening_ports() | 内嵌在 claude-sessions.ts | 孤儿端口检测（/proc/net/tcp） | 后续扩展 |
| `collector/process.rs` — collect_git_stats() | 内嵌在 claude-sessions.ts | git status 统计 | 后续扩展 |
| `jump/mod.rs` — jumpers() | 内嵌在 claude-sessions.ts | 终端跳转适配器链 | 复用（简化） |
| `jump/cmux.rs` / `jump/tmux.rs` | 内嵌在 claude-sessions.ts | cmux / tmux 窗格跳转 | 完整复用 |
| `config.rs` — load_config() | `config.ts` | TOML/YAML 配置加载（多路径回退） | 模式复用 |
| `config.rs` — rewrite_kv_lines() | `config.ts` — saveConfig() | 配置文件原地编辑（保留注释和未知 key） | 模式复用 |
| `model/session.rs` — AgentSession | 内嵌在 claude-sessions.ts | Session 数据模型 | 部分复用 |
| `model/session.rs` — SessionStatus | StatusDot.tsx 的状态判定逻辑 | Thinking/Executing/Waiting/Done 状态机 | 完整复用 |
| `snapshot.rs` — Snapshot / SessionView | IPC push payload 结构 | 数据序列化 + 前端绑定 | 模式复用 |
| `collector/rate_limit.rs` | 后续扩展 | Rate Limit 信息采集 | 后续扩展 |
| `locale.rs` | 后续扩展 | 中英文 i18n | 后续扩展 |

### 11.2 关键复用模式

**1. ProcessTree 遍历（abtop `is_descendant_of`）**

```
// abtop Rust → harness-monitor TS
function isDescendantOf(pid: number, ancestor: number, procInfo: Map<number, ProcInfo>): boolean {
  let current = pid;
  const visited = new Set<number>();
  while (visited.has(current) === false) {
    visited.add(current);
    const info = procInfo.get(current);
    if (!info) return false;
    if (info.ppid === ancestor) return true;
    if (info.ppid === 0 || info.ppid === 1) return false;
    current = info.ppid;
  }
  return false;
}
```

**2. 终端跳转适配器链（abtop `jump::resolve`）**

abtop 的适配器注册表模式（`Vec<Box<dyn TerminalJumper>>` → 链式 try_jump）直接映射到 harness-monitor 的 Terminal 打开优先级链：

```
cmux → tmux → kgx → gnome-terminal → xterm
```

每个适配器返回 `NotApplicable`（不在该终端中）→ 链继续；`Jumped` → 成功停止；`Failed` → 报告错误停止。

**3. Session 状态机（abtop `SessionStatus`）**

```
Thinking   → 上一轮 user 消息后还没有 assistant 响应（thinking_since_ms > 0）
Executing  → 进程树后代 CPU > 阈值 或 current_tasks 非空
Waiting    → 进程存活但 CPU 低于阈值
Done       → 进程已死 / JSON 标记为结束
RateLimited → 检测到 rate limit 信号
Unknown    → session 文件存在但进程归属未确认
```

当前 v3.0 只用双态 busy/idle（对应用户视角的 Working/Waiting），后续可扩展。

**4. 上下文窗口检测（abtop `context_window_for_model`）**

```typescript
function contextWindowForModel(transcriptModel: string, configuredModel: string, maxContextTokens: number): number {
  if (transcriptModel.includes('[1m]') || configuredModel.includes('[1m]') || maxContextTokens > 200_000) {
    return 1_000_000; // 1M context window
  }
  return 200_000; // default
}
```

### 11.3 abtop 已验证但 harness-monitor v3.0 暂不实现的功能

以下功能 abtop 已完整实现，但 harness-monitor v3.0 排除，后续版本可参考：

| abtop 功能 | 对应模块 | v3.0 不做的原因 |
|-----------|---------|----------------|
| Token 消耗追踪 + 历史 sparkline | collector/claude.rs → token_history | 需解析 transcript JSONL 增量读取，复杂度高 |
| Rate Limit 检测与展示 | collector/rate_limit.rs | 仅 DeepSeek API 场景暂不需要 |
| Git 状态显示 (added/modified) | process.rs → collect_git_stats | Session 卡片空间有限 |
| 孤儿端口检测与清理 | collector/mod.rs → orphan_ports | 非当前优先需求 |
| 子进程/子 agent 树 | collector/claude.rs → children/subagents | Session 卡片空间有限 |
| Chat 消息尾 | collector/claude.rs → chat_messages | 非 UI 核心功能 |
| Tool call 时间线 | collector/claude.rs → tool_calls | 需解析 transcript，复杂度高 |
| File access audit | collector/claude.rs → file_accesses | 安全审计功能，后续可加 |
| Multi-agent 支持 (Codex/OpenCode) | collector/codex.rs, collector/opencode.rs | v3.0 仅 Claude Code |
| Demo mode | demo.rs → populate_demo | 原型图已包含 mock 数据，无需 demo 模式 |
| 多主题 (12 themes) | theme.rs | 当前仅 macOS 浅色，后续扩展暗色 |
| i18n (中/英) | locale.rs | v3.0 只做中文 |
