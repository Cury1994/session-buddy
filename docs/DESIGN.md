# harness-monitor — 设计文档

> 版本 v3.3 | 2026-08-03 | macOS 浅色毛玻璃 UI · 340px 桌面悬浮挂件
>
> **v3.3 变更**（2026-08-03 审批镜像轮，实测驱动）：① §5.3 审批流重绘——POST /approve 前置镜像过滤（passthrough/ask 二分）+ 批准输出权限 JSON 压制终端二问；② 新 §6.14 permission-mirror（四层规则合并求值 + 命令摘要单一真源）；③ §6.13 approve.sh 改全工具薄中继 + 快速通道 + hook 输入 schema 两路兼容（2.1.207 顶层 tool_input 实测勘误）；④ §6.12 ApprovalPayload + toolInput/permissionMode、tool 改实际工具名。决策依据：2026-08-03 01:26 零干扰实测（会话全新命令 sha256sum）确认 hook stdout `hookSpecificOutput.permissionDecision:"allow"` **生效**——此前"三格式全被忽略"的实测结论被每轮紧随的复原命令之原生弹窗污染；故采 **Plan A**（工具批准 → 输出权限 JSON，settings 文件零侵入，一次性批准语义；永久化见 TASKS §13 D4）。
>
> **v3.2 变更**（蓝图裁剪，用户逐项确认）：
> ① 用量视图删统计卡（今日 token / 本月用量 / 千 token 均价 — DeepSeek API 不返回，原为假数据）与余额进度条（API 不返回总预算，无分母），趋势线改画 30 天**余额**走势、原生 SVG 实现（删 Recharts 依赖）；
> ② 告警阈值改 ¥ 绝对金额（默认 10），`api_usage` 表删 `today_tokens` / `month_used` / `total_budget` 三列；
> ③ 删「想象的规模」：端口冲突改"提示退出"（删 port+1..+10 重试与 server.port 文件协议，approve.sh 用固定端口）；终端跳转只留 kgx → gnome-terminal → xterm（删 cmux/tmux 适配器链）；Session 发现只扫默认 `~/.claude/`（删多 profile 五路发现）；busy/idle 改进程存活判定（删 CPU 阈值 / 进程树遍历）；
> ④ 时间戳统一本地时间（`datetime('now','localtime')`），无时区决策点；
> ⑤ §11 abtop 对照压缩为参考说明（删未实现功能清单与示例代码）；打包 / 开机自启 / 审批超时配置移入 REQUIREMENTS §5 延后项。
>
> **v3.1 变更**：① 按 `docs/REVIEW.md` 完成 13 项整改（共享类型 §6.12 / approve.sh §6.13 / DeepSeek 响应 §6.7 / Linux 适配 §2.10 等）；② UI 基准原型统一为 **`harness_monitor.html`（340px 悬浮挂件，无侧边栏，分段导航）**，§2/§4 已全面对齐，`AppPrototype.jsx` 弃用；③ 窗口尺寸以设计资料为准（340×650，见 §2.9）。
>
> **参考项目**: [abtop](https://github.com/graykode/abtop) — Rust TUI AI agent monitor，Claude Code session 发现 / 进程信息采集的核心实现模式已验证，§6.8 设计参考其已验证方案（v3.2 裁剪后仅保留核心扫描模式，见 §11 参考实现说明）。

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
| 图表 | 原生 SVG | — | 30 点余额 sparkline，无需引入图表库（M1 已装的 recharts 在 M8 前移除） |
| HTTP 服务 | Express | ^4.x | 路由参数提取、JSON 中间件 |
| SQLite | better-sqlite3 | ^11.x | 同步 API、Node.js 原生绑定 |
| 配置解析 | yaml | ^2.x | 与旧版 config.yaml 兼容 |
| 打包 | electron-builder | ^25.x | .deb / AppImage（移入延后项 D1，本轮不实现） |

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
| 终端跳转 | macOS 的 iTerm2 不存在 | 使用 Linux 终端链：kgx → gnome-terminal → xterm（见 §6.8.4） |
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
│   ├── Badges: provider 徽章 + "Tool: xxx" 工具徽章（SessionInfo 无 model 字段，据实显示 tool，M9 实现校正）
│   ├── <ContextGauge /> (Ctx: NN% + cyan 进度条)  …  Mem: NNM
│   └── <ApprovalBlock /> (条件渲染: 有 pending 审批时展开, 红边紧急卡片)
│       ├── "Wait Approval (45s)" 红色警告头 + 警告图标
│       ├── 命令文本 (等宽黑底白字, 危险关键字 #ff6b6b 高亮)
│       └── [Reject] [Approve (primary)]
└── <ApprovalHistory /> (可折叠, 最近 20 条, FR-3.7)

<UsageView>
├── <Card> (余额卡)
│   ├── "Current API Balance" + "Live" 绿色徽章
│   ├── 余额大数字 ¥14.25 (28px, ¥ 符号 16px)
│   └── 低余额警示文字 (balance < 阈值时显示红色小字 "低于告警线 ¥10"，无进度条)
└── <Card> (趋势卡)
    └── <TrendSparkline /> (60px 原生 SVG 面积折线, 30 天**余额**走势, hover 显示数值)

// v3.2 裁剪：统计卡（Today's Tokens / Monthly Spent）已删除——
// DeepSeek API 不返回 token 消耗，这些数据只能是 0 或估算假值

<SettingsView>
├── <Card> General
│   ├── Always on Top (checkbox)
│   └── Desktop Notifications (checkbox)
│   （v3.2 裁剪：Start at Login 已删——autostart/FR-6.6 延后，M3r 已从 AppConfig 删 autostart 字段）
├── <Card> Limits & Alerts
│   └── Balance Warning (¥) (number input)
└── [Quit Harness Monitor] (红色全宽按钮)
```

**原型未覆盖的需求项（实现约定，防止返工）**：

| 需求 | 原型现状 | 实现约定 |
|------|---------|---------|
| FR-2.5 运行时长 Uptime | 卡片未画 | 作为第二行微文字补充，或并入 Mem 行右侧 |
| FR-2.8 Stop 按钮 | 卡片未画 | 不占卡片版面，放卡片 hover 浮层/右键菜单 |
| FR-1.3 趋势图 | 仅 sparkline | widget 宽度限制，用 sparkline + hover Tooltip，不画完整坐标系；数据为 30 天余额快照 |
| FR-1.4 低余额提示 | 未画 | 余额卡底部红色小字警示（不画进度条，API 无总预算分母）；主要告警走 tray 红点 + 桌面通知 |
| FR-3.7 审批历史 | 未画 | SessionsView 底部可折叠块 |

---

## 5. 数据流

### 5.1 用量数据

```
services.ts (定时器触发，默认每 1 分钟)
  → deepseek.checkBalance()
    → fetch("https://api.deepseek.com/user/balance",
            {headers: {Authorization: "Bearer $KEY"}})
    → 解析 JSON → BalanceInfo {provider, balance, currency}
  → db.recordUsage(provider, model, balance, currency)
  → win.webContents.send("usage:updated", db.getLatestUsage())

renderer:
  preload.onUsageUpdated → useUsageData hook
    → UsageView:
        余额卡片 {balance, currency}（低于阈值显示警示文字）
        TrendSparkline {dailyBalance[] → 原生 SVG area path}
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
[Claude Code PreToolUse hook 触发（matcher "" = 全工具，2026-08-03 审批镜像轮）]
  → approve.sh 读 stdin JSON（两路兼容：顶层 tool_input（2.1.207+ 实测格式）
    // 旧版 tool_use.input；含 permission_mode / tool_name / 原始 tool_input，§6.13.1）
  → 【快速通道】tool_name ∈ {Glob,Grep,LS,Task,TodoWrite}（永不询问工具）→ 直接 exit 0
    （不解析其余字段、不 curl——结构性免疫 server 故障对高频只读工具的影响，§6.13.2）
  → 其余工具 → curl -X POST http://127.0.0.1:18456/approve -d @-（阻塞）
    BODY: {harness, tool, session, cwd, description, toolInput(原始对象), permissionMode}

[Express POST /approve]
  → parse body（command 由 server 从 toolInput 按工具构建，§6.5 前置管线）
  → 【镜像过滤前置，2026-08-03 增】mirrorFilter(tool, toolInput, cwd, permissionMode)（§6.14）
      判定"终端此刻会不会弹原生询问"：
      ├─ passthrough（不会弹：permission_mode 短路 / allow 规则命中 / deny 规则命中
      │    交还引擎原生拦截 / Read 在项目内）→ 立即返回 {"action":"passthrough"}
      │    → 不入队 / 不落库 / 不通知 / 不置橙 / 不 push（工具完全静默）
      └─ ask（会弹）→ 进入审批流（下）
  → 【F3 自动审批早退，2026-07-31 增】若模块级 autoApprove flag 为 true：
      db.recordApproval(..., true)（复用唯一落库点记 allowed=1）
      → 返回 {"allowed":true}（不入队 / 不通知 / 不置橙 / 不 push）。开关见 §6.11
  → approvalQueue.enqueue(payload) → {id, promise}
  → win.webContents.send("approval:pending", {id, ...payload})
  → notifications.notifyApproval(payload)
  → tray.setIconColor('amber')
  → await Promise.race([promise, timeout(60s)])

[Renderer receives approval:pending]
  → useApprovals hook → setPendingApprovals
  → SegmentedControl Sessions 分段 badge 更新
  → SessionCard 展开 <ApprovalBlock>

[用户在工具里批准]
  → window.electronAPI.respondApproval(id, true)
    → IPC → ipcMain.handle("approval:respond")
      → approvalQueue.respond(id, true)
        → promise resolves
      → win.webContents.send("approval:resolved", {id, allowed: true})

[POST /approve 的 await 恢复处（唯一落库点，M5 勘误）]
  → db.recordApproval(harness, session, command, cwd, allowed)
      // 单一落库点：approve / deny / 超时 auto-deny 三路径都经此；passthrough 不经此（不落库）
  → refreshTrayColor()   // 优先级协议 红>橙>绿（computeTrayColor），非字面置绿
  → Express returns {"id", "allowed"}

[approve.sh]
  → {"action":"passthrough"} → exit 0（不输出 JSON）→ 权限引擎接管：
      allow 规则命中 → 静默执行；deny 规则命中 → 原生拦截（保持终端语义）
  → {"allowed":true} → stdout 输出 {"hookSpecificOutput":{"hookEventName":"PreToolUse",
      "permissionDecision":"allow",...}} + exit 0 → 引擎跳过原生询问 → 命令执行
      （JSON 解析失败降级为正常流程 → 终端再问一次，无害）
  → {"allowed":false} → exit 2 拦截（拦截不托付 JSON：解析失败会 fail-open 出安全洞；
      exit 2 的拦截语义不依赖 JSON 解析，fail-safe）

设计依据（2026-08-03 实测）：早先三轮"hook 权限 JSON 全被忽略"的结论确认为**污染**——
每轮实测后紧跟一条未覆盖规则的复原命令（终端必弹一次），其原生询问被误认为标记命令的。
01:26 零干扰复测（标记命令含会话全新、规则表未覆盖的 `sha256sum`，无后续命令，用户全程
目视）：输出 `hookSpecificOutput.permissionDecision:"allow"` 后**没弹、直接执行** → JSON 生效
（与研究 agent 的 2.1.207 二进制静态分析一致：Zod schema 非严格、新旧格式皆支持、新格式
覆盖旧格式）。故 Plan A：批准 = 输出权限 JSON，不写 settings 规则（Plan B 及其
persistAllowRule 作废；永久化见 TASKS §13 D4）。镜像过滤的兜底不变：误判 passthrough
而终端实际会问时引擎仍弹原生询问——失败模式恒无害。另：JSON allow 不能覆盖 deny/ask
规则（任意 settings 作用域），与镜像过滤的 deny→passthrough 语义恰好自洽。
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
      balance_warn_threshold: number      // 默认 10（CNY 绝对金额，v3.2 由比例改绝对值）
    }
  }
  harnesses: {
    'claude-code': {
      sessions_glob: string
      settings_path: string
      refresh_interval_sec: number        // 默认 3
      config_dirs: string[]               // Claude config 目录（默认 ["~/.claude"]；v3.2 仅扫此列表，不做自动发现）
    }
  }
  notifications: {
    enabled: boolean
    approve_timeout_sec: number           // 默认 60（v1 不在 UI 暴露，见 REQUIREMENTS §5 延后项）
  }
  window: { width: number; height: number }
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
    timestamp        TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
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
    timestamp    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_approval_time ON approval_history(timestamp DESC);
```

> v3.2 裁剪：`api_usage` 删除 `today_tokens` / `month_used` / `total_budget` 三列——DeepSeek API 不返回 token 消耗，这三列只能存 0 或估算假值。时间戳统一 `datetime('now','localtime')` 本地时间（单机工具，无跨时区需求；渲染端按字面本地时间展示，不做 Date 时区转换）。

**DAO 方法**：

| 方法 | SQL | 用途 |
|------|-----|------|
| `recordUsage(provider, model, balance, currency)` | INSERT | 余额快照入库 |
| `getLatestUsage()` | SELECT MAX(id) GROUP BY provider, model | 用量 View 展示 |
| `get30DayBalance(provider, model)` | 每日取 MAX(id) 那条快照的 balance + DATE(timestamp) as day | 余额趋势图数据 |
| `recordApproval(harness, session, cmd, cwd, tool, allowed)` | INSERT | 审批历史入库（tool = payload 实际工具名；2026-08-06 M12 勘误——原签名缺 tool 参，INSERT 恒走 schema DEFAULT 'Bash'，非 Bash 审批工具列错记） |
| `getRecentApprovals(limit=20)` | SELECT ORDER BY timestamp DESC, id DESC LIMIT ? | 历史列表 |

### 6.3 tray.ts — 系统托盘

**图标**：代码生成 22×22 PNG 像素数据（圆点 + 高斯外发光，四色 hex 见下），`nativeImage.createFromBuffer()` 载入，无需外部图片资源。~~SVG data URL~~ 不可行：Electron nativeImage 不做 SVG 光栅化（Chromium 位图解码器不含 SVG），M4 实测经 appindicator 送达的 IconPixmap 为空图 → 改程序化 PNG 编码（zlib + CRC32）。

**颜色状态机**（优先级从高到低）：

| 优先级 | 颜色 | 条件 |
|--------|------|------|
| 0 (最高) | 红 `#ff5252` | 余额 < warn_threshold（¥ 绝对金额，默认 10） |
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

**POST /approve 前置管线（2026-08-03 审批镜像轮）**：请求解析后**先过 §6.14 `mirrorFilter()`**——判定 `passthrough` 立即返回 `{"action":"passthrough"}`（不入队 / 不落库 / 不通知 / 不置橙 / 不 push）；判定 `ask` 才进入 F3 早退检查 → 入队 → 阻塞等待。批准路径响应 `{"allowed":true}`，由 approve.sh 输出权限 JSON 压制终端二问（§6.13.4）；唯一落库点 `recordApproval` 位置不动（三路径不变量不破）。`command` 字段由 server 的 `buildCommandSummary(tool, toolInput)` 构建（Bash: `.command`；Edit/Write/Read: 文件路径；WebFetch: URL；WebSearch: query；其余: 截断 JSON 摘要）——审批卡内容单一真源，修复旧版 approve.sh 字段错位（读 `.tool_use.input`、实际发 `tool_input`）导致的**空卡 bug**。

**端口冲突处理（v3.2 简化）**：`config.server.port` 默认 `18456`。单机单用户工具，端口被占几乎必然是旧版进程（Python 版或本应用）未退出：

```
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // 1. 探测 http://127.0.0.1:{port}/health：
    //    返回 {"status":"ok"} → 本应用旧实例在跑（单实例锁失效的极端情况），
    //    记日志后正常退出(0)
    // 2. 否则 → 桌面通知/对话框提示"端口 18456 被占用，请关闭占用程序后重启"，
    //    退出(1)。不做端口重试，不写端口文件——approve.sh 直接用固定端口
  }
})
```

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
| `balance_infos[0].granted_balance` | — | — | 赠送余额，v1 不使用 |
| `balance_infos[0].topped_up_balance` | — | — | 充值余额，v1 不使用 |

> HTTP 非 200 / 超时 / JSON 解析失败 → 抛错，由 services.ts 捕获后保留上次快照（T-1.3 / NFR-3）。
> 余额告警判定：`balance < config.providers.deepseek.balance_warn_threshold`（¥ 绝对金额，默认 10）。

### 6.8 claude-sessions.ts — Session 发现

> **参考 abtop** `src/collector/claude.rs` — ClaudeCollector::collect_sessions() 的完整实现已验证，本节直接复用其核心流程。关键差异：abtop 是 Rust 实现，harness-monitor 用 Node.js 重写同逻辑。

#### 6.8.1 Config 目录发现

```
v3.2（简化）: 仅扫描 config.harnesses['claude-code'].config_dirs
列表中的目录（默认 ["~/.claude"]）。
不做自动发现（~/.claude-* 扫描、CLAUDE_CONFIG_DIR 环境变量、
/proc 进程 environ 探测均已删除——单机单用户无需多 profile）。
```

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
      - name: string         (显示名，优先级链：transcript 首条可读用户消息【头部限读 64KB，
                              剥 system-reminder / local-command-caveat 整段与斜杠命令标签、
                              取首个非空行、超 60 字符截断】→ 本 json name 字段 → cwd basename → 'unknown'。
                              2026-07-31 勘误：原"恒取 cwd basename"在所有会话同 cwd 时全显 "cury"，无区分度)
   
   b. 字段清理 (参考 abtop SessionFile::sanitize):
      - sessionId 截断到 256 字符
      - cwd 截断到 4096 字符
      - 【2026-07-31 勘误】kind 过滤：字段存在且 !== 'interactive'（如 "bg" 后台任务
        会话，常带 jobId 长期驻留 sessions 目录）→ 整条跳过不展示；kind 缺失按
        interactive 放行（兼容旧版 Claude Code，宁多显示不误杀）
      - 【2026-07-31 勘误】显示 cwd 真源改为 transcript 尾读的最后一条 cwd 记录
        （Claude Code 随实际工作目录动态更新，如 cd 进项目后的真实路径）；
        session json 的 cwd 为启动目录，仅作降级。两者统一 4096 截断
      - pid 为 0 则跳过

   c. 进程内存 (参考 abtop process.rs::get_process_info):
      Linux:   fs.readFile("/proc/{pid}/stat") → 解析第 24 字段 (rss) × page_size → 字节
               转换为 MB（page_size 取 `getconf PAGE_SIZE`，回退 4096）
               ⚠ M6 勘误：proc(5) 中 rss 为第 **24** 字段（v3.2 原写 22，22 是 starttime，误用会得荒谬值）
      macOS:   child_process.execSync("ps -o rss= -p {pid}") → KB
      Windows: sysinfo 库
      注意: AI 进程 ID 获取到内存，可能不包含子进程

   d. Session 状态判定（v3.2 简化：进程存活判定，无 CPU 阈值 / 进程树遍历）:
      - 检查进程是否存在: fs.existsSync("/proc/{pid}")
        （macOS 回退: child_process.execSync("kill -0 {pid}")）
      - 进程存在 → "busy"（绿色脉冲灯）
      - 进程不存在 → "idle"（灰色静止灯）+ memory=0

   e. 上下文百分比估算（与 Claude Code 终端底部上下文指示条同源）:
      glob("~/.claude/projects/*/{sessionId}.jsonl")
      → 逐行解析，取**最后一条含 usage 的记录**（不按 role 过滤，与 statusline.py 真源一致；M6 实现为尾部 256KB 增量读，审查整改后）:
        contextTokens = input_tokens
                      + cache_read_input_tokens
                      + cache_creation_input_tokens
      → context_window: 200K (默认) 或 1M (1M上下文模型)
        参考 abtop collector::context_window_for_model() / §11.2 contextWindowForModel()
      → ctxPct = min(100, round(contextTokens / context_window × 100))
      说明: 与本机 `~/.claude/statusline.py` 状态栏的算法一致，直接反映真实上下文占用；
            早期"行数 × 5"的粗估已弃用（误差大且与终端指示条不符）。
            transcript 无 usage 字段时回退为 0。
      【F2 增，2026-07-31】同一次 256KB 尾部逆扫（tailFacts）并列提取第四事 lastActivity：
            首条（逆序=最近）message.content 清洗非空的可读文本（剥 system-reminder /
            local-command-caveat 整段与斜杠命令标签、空白折叠为单行、截断 120+"…"；
            tool_result 无 text 块跳过）。**尽力而为**：不参与早退门槛（门槛仍为
            usedTokens/lastCwd/lastModel 三事，扫不到随窗口扫尽为 null），usedTokens 提取
            逻辑逐字不动 → ctxPct 不回归。供 SessionCard 单行 ellipsis 展示"最近在做什么"。

   f. API Provider 解析 (参考 abtop ClaudeCollector):
      【2026-07-31 勘误】真源改为 transcript 尾读的末条 message.model（API 实际
      返回的模型 id，如经本地代理 cc-switch 转发时返回 "qwen3.8-max-preview"）；
      settings 解析降为 fallback。⚠ ctxPct 窗口判定（200K/1M）仍由 settings 的
      ANTHROPIC_DEFAULT_*_MODEL id 驱动——transcript 模型 id 经代理改写后不含
      [1m] 标记，不可用于窗口判定。
      （fallback 路径）读取 ~/.claude/settings.json
      → 提取 ANTHROPIC_DEFAULT_*_MODEL_NAME 环境变量
      → 映射到 apiProvider 名称 (如 "deepseek-v4-pro")
      ⚠ *_MODEL_NAME 可能陈旧或为代理别名（实测 SONNET_NAME="glm-5.2" 而实际
      调用 qwen3.8-max-preview），故仅作降级
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

#### 6.8.3 采集字段范围

v3.2 仅采集原型图中展示的核心字段：name、status、uptime、memoryMB、apiProvider、ctxPct、cwd、pid、sessionId。token 历史、tool call 时间线、git 状态、子 agent 树等均不采集。

#### 6.8.4 终端跳转（v3.2 简化）

```
终端打开顺序 (Linux / GNOME):
1. 检查 WAYLAND_DISPLAY / DISPLAY → kgx (gnome-console)
2. 回退 → gnome-terminal
3. 最终回退 → xterm
```

**【2026-07-31 勘误】聚焦优先 + 开窗降级**（用户反馈 #5）：

1. **聚焦优先**：pid → ppid 上行（≤10 跳）找终端祖先（comm ∈ TERMINAL_COMMS 白名单：
   gnome-terminal- / gnome-terminal-server / kgx / gnome-console / xterm / konsole /
   xfce4-terminal / tilix / terminator / wezterm / wezterm-gui / alacritty / kitty /
   foot / st；⚠ Linux comm 受 TASK_COMM_LEN 限 15 字符，须含截断形 "gnome-terminal-"）
   → `xdotool search --pid` 取窗口（多窗口按标题含 basename(cwd) 大小写不敏感筛选）
   → `windowactivate --sync` 精确聚焦，**不开新窗**
2. **降级开窗**：聚焦失败（原生 Wayland 窗口对 xdotool 不可见 / 未装 xdotool /
   无终端祖先 / 无窗口）→ 上述 spawn 回退链开新窗，cwd 落会话真实项目路径
   （§6.8.2b 尾读真值）。Wayland 环境下本分支为主路径
3. xdotool 为**可选依赖**（运行时 `command -v` 检测，不强制安装）；IPC 签名相应
   扩展为 `(cwd: string, pid?: number)`

直接 `spawn(terminal, [cwd 参数])`（kgx/gnome-terminal 用 `--working-directory`），
无适配器链架构。cmux / tmux 窗格跳转已删除（当前环境用不到）。

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
| `usage:history` | renderer→main | 无 | `BalanceDailySnapshot[]`（db.get30DayBalance，v2.3 裁剪后补入，供 TrendSparkline） |
| `sessions:get` | renderer→main | 无 | `SessionInfo[]` |
| `history:get` | renderer→main | `limit?: number` | `ApprovalRecord[]` |
| `approval:get` | renderer→main | 无 | `PendingApproval[]`（approvalQueue.getAll 只读快照；前端批量审 P1-3 整改补入，供 useSessionsData 挂载 seed，覆盖离标签页/启动前到达的审批） |
| `config:get` | renderer→main | 无 | `AppConfig` |
| `config:save` | renderer→main | `DeepPartial<AppConfig>` | `AppConfig`（M10 决策：返回合并后完整配置 + 触发重调度；写失败抛出 → invoke reject，不再静默降级） |
| `app:refresh` | renderer→main | 无 | `void` |
| `session:jump-terminal` | renderer→main | `cwd: string, pid?: number` | `boolean`（2026-07-31：pid 供聚焦已有窗口，§6.8.4） |
| `session:terminate` | renderer→main | `pid: number` | `boolean`（2026-07-31 语义变更：关闭会话所在终端窗口＝SIGTERM tty 根 shell，非直杀 claude 进程） |
| `approval:respond` | renderer→main | `{id, allowed}` | `boolean` |
| `approval:set-auto-approve` | renderer→main | `boolean` | `void`（F3，2026-07-31：置 server.ts 模块级 autoApprove flag；非 boolean 归一 false。开启后 POST /approve 立即放行，会话级、重启复位） |
| `approval:get-auto-approve` | renderer→main | 无 | `boolean`（F3：SessionsView 挂载播种真源，避免 key={activeView} 重挂载后前端 state 与主进程 flag 失配） |
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
  name: string                // 显示名（transcript 首条用户消息 → json name → cwd basename，§6.8.2a）
  status: SessionStatus
  tool: string                // harness 身份，固定 "Claude Code"（卡片 badge；2026-07-31 勘误，原固定 "Bash" 误导）
  apiProvider: string         // API 实际返回的模型 id（transcript 尾读 message.model → settings 降级，§6.8.2f，2026-07-31 勘误）
  uptimeSec: number           // 运行时长（秒）= (now - startedAt)/1000
  memoryMB: number            // 物理内存 MB（进程死亡为 0）
  ctxPct: number              // 上下文消耗百分比 0-100（§6.8.2e）
  cwd: string                 // 实际工作目录（transcript 尾读 → json cwd 降级，截断 4096，§6.8.2b，2026-07-31 勘误）
  startedAt: number           // Unix ms
  hasPendingApproval: boolean // approvalQueue 中存在匹配项
  lastActivity: string        // 最近一条可读对话/任务内容（transcript 尾读，截断 120，无则空串；F2，2026-07-31 增）
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
}

/** api_usage 表行（§6.2）→ UsageView 渲染；db REAL → TS 映射 */
export interface UsageRecord {
  provider: string            // "deepseek"
  model: string               // "all"
  balance: number
  balanceCurrency: string     // "CNY"
  timestamp: string           // 本地时间 "YYYY-MM-DD HH:MM:SS"（db datetime('now','localtime')），渲染端按字面展示
}

/** get30DayBalance 聚合行 → TrendSparkline */
export interface BalanceDailySnapshot {
  day: string                 // "YYYY-MM-DD"（本地日期）
  balance: number             // 当日最后一次快照余额
}

// ─── 审批流程 ───

/** approve.sh POST /approve 的请求体 / IPC approval:pending 的负载（§5.3） */
export interface ApprovalPayload {
  harness: string             // "claude-code"
  session: string             // session 名 / id
  command: string             // 待审批内容摘要（server buildCommandSummary 从 toolInput 按工具构建，§6.5 前置管线；Bash 为命令全文）
  cwd: string                 // 工作目录
  tool: string                // 实际工具名（hook 输入 tool_name：Bash/Edit/Write/WebFetch/Skill/mcp__*…；2026-08-03 勘误，原固定 "Bash"）
  description: string         // 命令的人类可读摘要（Bash hook 输入自带 description；approve.sh 透传，仅实时展示不落库，可空；F1，2026-07-31 增）
  toolInput: Record<string, unknown>  // hook 输入原始 tool_input 对象（§6.14 规则求值 + 批准写规则用；2026-08-03 审批镜像轮增）
  permissionMode: string      // hook 输入 permission_mode（default/acceptEdits/bypassPermissions/plan，空按 default；2026-08-03 审批镜像轮增）
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
  timestamp: string           // 本地时间（同 UsageRecord.timestamp 约定）
}

/** approval:respond / respondApproval 的负载 */
export interface ApprovalResponse {
  id: string
  allowed: boolean
}
```

> 序列化约定：主进程经 `structuredClone` / IPC 传递纯 JSON，不含 Date/Map；时间戳统一为本地时间 ISO `string`（db `datetime('now','localtime')`），渲染端按字面展示、用 `lib/formatters.ts` 格式化相对时间（相对时间计算以本地时间为基准，无时区转换）。

### 6.13 approve.sh — Hook 脚本设计（REVIEW #2）

> 对应 **FR-3.1 / FR-3.10（P0）**。脚本位于 `resources/hooks/approve.sh`，作为 Claude Code 的 **PreToolUse** hook 注册到 `~/.claude/settings.json` 的 `hooks.PreToolUse`。**matcher 为空串 = 匹配所有工具**（2026-08-03 审批镜像轮）：脚本对"永不询问"工具（Glob/Grep/LS/Task/TodoWrite）走快速通道立即 exit 0，其余工具原样薄中继到 server，由 §6.14 镜像过滤判定弹卡与否——mirror 逻辑集中在 server（TS 可测），脚本保持薄、版本漂移隔离在脚本的字段兼容层。

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

**2026-08-03 实测补全**：
- 顶层含 `permission_mode`（`default` / `acceptEdits` / `bypassPermissions` / `plan`），透传给 §6.14 模式短路；
- 非 Bash 工具的 `tool_input` 形态各异（Edit: `{file_path, old_string, new_string}`；WebFetch: `{url, prompt}`；Read: `{file_path, …}`）——脚本整体透传原始对象，不按工具拆字段；
- **版本漂移**：旧版 Claude Code 曾把输入嵌套在 `tool_use.input` 下（本机 2026-07-30 前实现期可用，2026-08-03 捕获实锤顶层 `tool_input`；旧版 approve.sh 只读嵌套路径 → 审批卡 command/description 恒空，F1 stub 自测用旧格式掩盖了漂移）。脚本两路兼容读取（`.tool_input.* // .tool_use.input.*`）。

#### 6.13.2 字段提取与快速通道

用 `jq` 从 stdin 提取（需声明 `jq` 依赖）：

| 目标 | jq 表达式 | 回退 |
|------|-----------|------|
| tool_name | `.tool_name` | 空 → 异常输入，exit 0 放行 |
| tool_input（原始对象） | `.tool_input // .tool_use.input`（`jq -c` 整体透传） | `{}` |
| description | `(.tool_input // .tool_use.input).description` | 空串（仅 Bash 自带） |
| permission_mode | `.permission_mode` | 空 → server 按 `default` 处理 |
| cwd | `.cwd` | 空 → `.` |
| session | `.session_id` | 空 → `"unknown"` |

**快速通道**（`case "$tool" in Glob|Grep|LS|Task|TodoWrite) exit 0;; esac`）：这五个工具在任何权限模式下终端都不弹询问，提前退出——不解析其余字段、不 curl，结构性免疫 server 故障/延迟对高频只读工具的影响。**不得**把会弹询问的工具（Read 越界 / Bash / Edit / Write / WebFetch / WebSearch / Skill / mcp__*）放入此列表。

#### 6.13.3 请求与超时处理

```bash
#!/usr/bin/env bash
# Claude Code PreToolUse hook — Bash 命令阻塞式审批
set -uo pipefail   # 不用 -e：curl 失败需自行兜底，不能直接中断

# 固定端口（v3.2：无端口重试、无运行时端口文件，见 §6.5）
PORT="${HARNESS_MONITOR_PORT:-18456}"
SERVER="http://127.0.0.1:${PORT}"
# 客户端超时要 > 服务端 approve_timeout_sec(60s)，否则客户端先超时误判
CURL_MAX=65

input="$(cat)"
tool=$(jq -r '.tool_name // empty' <<<"$input")

# 快速通道：永不询问工具直接放行（§6.13.2）
case "$tool" in Glob|Grep|LS|Task|TodoWrite) exit 0 ;; esac

tool_input=$(jq -c '(.tool_input // .tool_use.input // {})' <<<"$input")
description=$(jq -r '(.tool_input // .tool_use.input).description // empty' <<<"$input")
permission_mode=$(jq -r '.permission_mode // empty' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
session=$(jq -r '.session_id // "unknown"' <<<"$input")

# 阻塞式 POST；command 由 server 从 tool_input 构建（单一真源，§6.5/§6.14）
response=$(curl -sS -m "$CURL_MAX" \
  -X POST "$SERVER/approve" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg h claude-code --arg t "$tool" --arg s "$session" \
            --arg w "$cwd" --arg d "$description" --arg m "$permission_mode" \
            --argjson ti "$tool_input" \
            '{harness:$h, tool:$t, session:$s, cwd:$w, description:$d,
              permissionMode:$m, toolInput:$ti}')" \
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
# 服务端响应三种（§5.3 / §6.14）：
#   {"action":"passthrough"}  镜像过滤判定终端不会弹 → exit 0（不输出 JSON，引擎按规则走）
#   {"allowed": true}         用户在工具批准 → 输出 permissionDecision allow + exit 0 → 引擎跳过询问
#   {"allowed": false}        拒绝 / 超时 auto-deny → exit 2 拦截（拦截不托付 JSON，fail-safe）
action=$(jq -r '.action // empty' <<<"$response")
# ⚠️ 此处不可用 `.allowed // empty`：jq 的 `//` 把 false 当 falsy 吞成空串，
#    将无法区分"拒绝"与"垃圾响应"（0a6cff7 勘误）
allowed=$(jq -r '.allowed' <<<"$response")
if [[ "$action" == "passthrough" ]]; then
  exit 0
elif [[ "$allowed" == "true" ]]; then
  # 压制终端原生二问：2026-08-03 01:26 零干扰实测确认本格式被 2.1.207 尊重（§6.14.1）
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Approved in harness-monitor"}}\n'
  exit 0
elif [[ "$allowed" == "false" ]]; then
  echo "harness-monitor 已拒绝: $tool 调用" >&2
  exit 2
else
  # 垃圾 / 无法解析的响应 → fail-open（0a6cff7 勘误：原稿此态归 exit 2 拦截分支，
  # 回退了"宁可漏审，不可误杀工作流"的 fail-open 语义；拦截仅限显式 allowed:false）
  echo "harness-monitor 异常响应，放行: $tool 调用" >&2
  exit 0
fi
```

**exit code 约定**（遵循 **Claude Code PreToolUse hook 规范**，而非朴素 0/1/2）：

| exit code | 含义 | Claude Code 行为 |
|-----------|------|-----------------|
| `0` | approve（放行） | 执行该 Bash 命令 |
| `2` | deny（拦截） | **阻断工具调用**，stderr 内容回传给 Claude |
| 其他非零 | error（非阻塞错误） | 命令**仍会执行**，stderr 写入 transcript |

> ⚠️ 关键点：Claude Code 的 PreToolUse hook 中**只有 exit 2 能真正拦截命令**；exit 1 被视为"非阻塞错误"，命令照常执行。因此拒绝必须用 `exit 2`（配合 stderr 说明原因），这也是 §5.3 数据流 "deny → 命令不执行" 的唯一正确实现。本节约定与 REVIEW #2 建议的 `0/1/2` 的差异正源于此。
>
> **放行/拦截的不对称设计**：放行输出 `hookSpecificOutput.permissionDecision:"allow"`（2026-08-03 01:26 零干扰实测确认 2.1.207 尊重本格式，见 §6.14.1）以压制终端原生二问；其解析失败降级为正常流程（终端再问一次，无害）。拦截不托付 JSON 而用 exit 2——JSON deny 若解析失败会 fail-open（命令照跑），是安全洞；exit 2 的拦截语义不依赖 JSON 解析，fail-safe。

#### 6.13.5 注册方式

安装时写入 `~/.claude/settings.json`（harness-monitor 提供一键注册，或用户手动）：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "/path/to/resources/hooks/approve.sh", "timeout": 70000 }
        ]
      }
    ]
  }
}
```

> **【2026-07-31 补全】`timeout` 单位为毫秒**（2.1.207 二进制实测日志 `with timeout ${c}ms`）：
> 写 `70` 会被 70ms 即杀（实测 hook error 无 stderr，极易误判为脚本故障）。取
> **70000**（70s）＞ curl -m 65 ＞ server 60s auto-deny，确保正常情况下 server 先
> 返回 `allowed:false` 而非 hook 先超时。本机实际注册路径为
> `/home/cury/harness-monitor/resources/hooks/approve.sh`（D1 打包后改为安装路径）。
> **matcher 空串 = 匹配所有工具**（审批镜像轮起；永不询问工具由脚本快速通道过滤，§6.13.2）。

---

### 6.14 permission-mirror.ts — 权限镜像模块（2026-08-03 审批镜像轮）

> 对应 **FR-3.10 / FR-3.11**。目标：**工具审批面 ≡ 终端原生询问面**（⊆ 且 ⊇）。核心职责：`mirrorFilter()` 判定"终端此刻会不会弹原生询问"（不会 → passthrough 静默；会 → ask 弹卡）。终端二问的压制由 approve.sh 放行时输出权限 JSON 完成（§6.13.4，Plan A，见 §6.14.1）。

#### 6.14.1 决策背景（实测驱动）

2026-08-03 实测（Claude Code 2.1.207，hook 输入捕获 + 三轮标记命令 + 用户终端肉眼确认）：
- hook 输入字段为**顶层 `tool_input`**（approve.sh 旧读 `.tool_use.input` → 审批卡命令内容恒空，本轮修，§6.13.1）；
- 输入含 `permission_mode`（default/acceptEdits/bypassPermissions/plan）；
- hook stdout 的三种权限 JSON（`hookSpecificOutput.permissionDecision:"allow"` / 顶层 `permissionDecision` / legacy `{"decision":"approve"}`）**均被忽略**，终端照常弹原生询问。

结论**翻转**（2026-08-03 01:26）：早先三轮"忽略"实测均被污染——每轮之后紧跟一条未覆盖规则的复原命令（终端必弹一次），其原生询问被误认为标记命令的。零干扰复测（标记命令含会话全新、规则表未覆盖的 `sha256sum`，无后续命令，用户全程目视）：输出 `hookSpecificOutput.permissionDecision:"allow"` 后**没弹、直接执行** → JSON 生效，与二进制静态分析一致（2.1.207 Zod schema 非严格，新旧格式皆支持，新格式覆盖旧格式；JSON allow 不覆盖任意作用域的 deny/ask 规则）。故采 **Plan A**：批准 = 输出权限 JSON，**不写 settings 规则**（Plan B 的 persistAllowRule 作废；永久化需求登记 TASKS §13 D4，届时 Plan B 机制可作为勾选实现原装备用）。

#### 6.14.2 mirrorFilter(tool, toolInput, cwd, permissionMode) → 'passthrough' | 'ask'

求值顺序（短路）：
1. `permissionMode === 'bypassPermissions'` → passthrough（该模式终端从不询问）
2. `permissionMode === 'acceptEdits'` 且 tool ∈ 编辑类（Edit/Write/NotebookEdit）→ passthrough
2.5. **`NEVER_PROMPT_TOOLS` 元工具集** → passthrough（98308da 勘误增：AskUserQuestion / Task* / Cron* / Monitor / plan 模式切换 / SendMessage / Workflow / ReportFindings / DesignSync 等 21 个 harness 元工具终端从不弹询问；2026-08-03 E2E 实测发现 AskUserQuestion 被拦成审批卡、阻塞主对话提问链路。正确性唯一真源在此，与 approve.sh 快速通道（高频工具性能层）互补不重叠）
3. 命中合并后 **deny** 规则 → passthrough（交还引擎原生拦截，保持终端语义）
4. 命中合并后 **allow** 规则 → passthrough
5. 工具默认表：Read 且解析后路径在 cwd 内 → passthrough；Glob/Grep/LS/Task/TodoWrite 由 approve.sh 快速通道处理（不到此）；其余（Bash/Edit/Write/WebFetch/WebSearch/Skill/mcp__*/Read 越界/未知工具）→ 无规则命中即 **ask**
6. `plan` 模式按 default 处理（宁可多弹卡，失败模式无害）

> 失败模式分析：passthrough 误判（终端实际会问）→ 引擎仍弹原生询问，用户在终端决定——无害；ask 误判（终端实际不问）→ 工具多弹一张卡——本模块的质量指标就是消除它，规则求值精度即质量。

#### 6.14.3 规则来源与合并

读取四层 settings 的 `permissions.allow` / `permissions.deny` 取**并集**（与 Claude Code 权限合并语义一致）：① `~/.claude/settings.json`　② `~/.claude/settings.local.json`　③ `<cwd>/.claude/settings.json`　④ `<cwd>/.claude/settings.local.json`

- 按文件 mtime 缓存解析结果（statSync 廉价重校验，无需 fs.watch）；项目层（③④）以请求 cwd 为键缓存（不同会话 cwd 不同，不可全局缓存）
- 明确不求值的规则源（已知缺口，登记备查）：enterprise managed settings、CLI `--allowedTools`、**会话内临时授权**（内存态不可观测 → 工具可能多弹一次卡，点批准等价放行，无害）
- 文件缺失/损坏 → 该层视为空（不抛）

#### 6.14.4 规则匹配语义（子集实现，偏差恒无害）

| 规则形式 | 匹配 |
|---|---|
| `Tool`（无括号） | 该工具所有调用（如 `WebSearch`） |
| `Bash(cmd)` | 精确相等 |
| `Bash(cmd *)` / `Bash(cmd:*)` | 前缀匹配（剥尾部 `*` 与可选 `:`） |
| `Read/Edit/Write(path)` | 路径 glob：首部 `//` 视作绝对路径（与终端写入形式一致，如 `Read(//sys/**)`）、`~` 展开、相对路径按 cwd 解析、`**`→`.*`、`*`→`[^/]*` |
| `WebFetch(domain:host)` | 请求 URL hostname === host 或以 `.host` 结尾 |
| `Skill(name)` / `mcp__server__tool` | 名称相等（支持尾部 `*` 前缀） |

复合 Bash 命令（顶层 `;` `&&` `||` `|` 与换行分隔）：引擎按子命令逐一校验，mirrorFilter 同语义（**全部**子命令被覆盖才算命中）。**heredoc（`<<DELIM`…`DELIM`，含 `<<-` tab 收尾 / 单引号 / 部分引号）按单个子命令切分**（43cb535 修复：避免正体被换行拆段导致 `python3 - <<'EOF'` 命中不了 `Bash(python3 *)` 而误弹卡）。引号内分隔符/更深的命令替换嵌套误切属已知边界 → 偏差方向为多弹卡（无害）。

#### 6.14.5 可测性

`electron.vite.config.ts` 增 `permission-mirror` 独立入口（同 deepseek/claude-sessions 模式），裸 node 验收：规则求值用例（取用户 settings.local.json 真实样本）+ 规则写入（HOME 隔离沙箱，见 TASKS §15）。

---

## 7. Preload API

```typescript
interface ElectronAPI {
  // Request/Response
  getUsageData(): Promise<UsageRecord[]>
  getBalanceHistory(): Promise<BalanceDailySnapshot[]>
  getSessionsData(): Promise<SessionInfo[]>
  getApprovalHistory(): Promise<ApprovalRecord[]>
  getPendingApprovals(): Promise<PendingApproval[]>  // P1-3 整改补入：approval:get，挂载 seed
  setAutoApprove(v: boolean): Promise<void>          // F3，2026-07-31 增：approval:set-auto-approve
  getAutoApprove(): Promise<boolean>                 // F3，2026-07-31 增：approval:get-auto-approve，挂载播种真源
  getConfig(): Promise<AppConfig>
  saveConfig(partial: DeepPartial<AppConfig>): Promise<AppConfig>  // M10：返回合并后配置 + 重调度，写失败 reject
  manualRefresh(): Promise<void>
  jumpToTerminal(cwd: string, pid?: number): Promise<boolean>  // 2026-07-31：pid 供聚焦已有窗口（§6.8.4）
  terminateSession(pid: number): Promise<boolean>  // 2026-07-31 语义：关闭会话所在终端窗口（非直杀进程）
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
    balance_warn_threshold: 10            # ¥ 绝对金额（v3.2：原比例 0.15 改绝对值，API 不返回总预算）

harnesses:
  claude-code:
    sessions_glob: "~/.claude/sessions/*.json"
    settings_path: "~/.claude/settings.json"
    refresh_interval_sec: 3
    config_dirs:                      # Claude config 目录（v3.2 仅扫此列表，无自动发现）
      - "~/.claude"

notifications:
  enabled: true
  approve_timeout_sec: 60             # v1 固定，不在 UI 暴露（REQUIREMENTS §5 延后项）

window:                               # 尺寸以设计资料为准，见 §2.9
  width: 340
  height: 650
```

> v3.2：删除 `autostart` 段（开机自启移入 REQUIREMENTS §5 延后项）。M2 已实现的 `autostart` 字段读取在返工中一并移除。

### 8.2 加载策略

```
优先级：用户 custom > 内置 default

algorithm:
  defaults = parse(<app>/config.yaml)
  user_paths = [                               // 按优先级【从低到高】排列依次合并，
    ~/.config/claude-monitor/config.yaml,      // backward compat（低，先合并）
    ~/.config/harness-monitor/config.yaml,     // 主配置（高，后合并可覆盖 compat）
  ]
  for path in user_paths:
    if path.exists:
      user_config = parse(path)
      defaults = deepMerge(defaults, user_config)
  return defaults
```

> v3.1.1 勘误：原版 user_paths 顺序为 harness-monitor 在前、claude-monitor 在后，
> 循环合并会让向后兼容路径覆盖主配置，与 §6.1 优先级表矛盾。已按 §6.1 修正合并顺序。

---

## 9. 测试用例

### 9.1 余额监控

| ID | 场景 | 预期结果 | 覆盖需求 |
|----|------|---------|---------|
| T-1.1 | `DEEPSEEK_API_KEY` 已设置 | UsageView 展示余额卡（余额 + 币种）与 30 天余额趋势线 | FR-1.2 / FR-1.3 |
| T-1.2 | `DEEPSEEK_API_KEY` 未设置 | 卡片显示 "未配置 API Key" 空状态 | FR-1.1 |
| T-1.3 | API 返回非 200 | 保留上次数据，上次无数据则显示错误态 | NFR-3 |
| T-1.4 | 余额低于阈值（¥ 绝对金额） | Tray 红点 + 桌面通知 + 余额卡警示文字 | FR-1.4 |
| T-1.5 | 30 天余额趋势线渲染 | 原生 SVG 折线正确展示每日余额快照 | FR-1.3 |

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

> v3.2：删除 T-6.7（server.port 运行时文件用例——端口文件协议已随 §6.5 简化删除）。

---

## 10. 需求-设计追溯矩阵

| 需求 ID | 设计章节 | 模块/组件 |
|---------|---------|----------|
| FR-1.1 余额查询 | 6.7, 6.9 | deepseek.ts + services.ts |
| FR-1.2 余额卡片 | 4, 5.1 | UsageView.tsx（余额 + 币种 + 低余额警示） |
| FR-1.3 30天余额趋势 | 4, 5.1 | TrendSparkline.tsx（原生 SVG，db.get30DayBalance） |
| FR-1.4 余额告警 | 6.3, 6.10 | tray.ts + notifications.ts（¥ 绝对金额阈值） |
| FR-1.5 定时/手动刷新 | 6.9, 8.1 | services.ts |
| FR-1.6 用量持久化 | 6.2 | db.ts (SQLite 余额快照) |
| FR-2.1 Session 发现 | 6.8, 6.9 | claude-sessions.ts + services.ts（仅默认目录） |
| FR-2.2 进程内存 | 6.8 | claude-sessions.ts (VmRSS) |
| FR-2.3 上下文估算 | 6.8 | claude-sessions.ts (transcript usage) |
| FR-2.4 API Provider 解析 | 6.8 | claude-sessions.ts (settings.json) |
| FR-2.5 Session 卡片 | 4 | SessionCard.tsx + StatusDot.tsx（进程存活判定） |
| FR-2.6 上下文进度条 | 4 | ContextGauge.tsx |
| FR-2.7 跳转终端 | 6.11, 6.8.4 | IPC + kgx/gnome-terminal 直起 |
| FR-2.8 终止 Session | 6.11, 4 | IPC + SessionCard |
| FR-3.1 Hook 脚本 | 6.13 | resources/hooks/approve.sh（固定端口） |
| FR-3.2 审批阻塞 | 6.6 | approval-queue.ts |
| FR-3.3 审批卡片 | 4 | ApprovalBlock.tsx |
| FR-3.4 危险检测 | 4, renderer/lib | danger-words.ts |
| FR-3.5 双向响应 | 6.6, 5.3 | approval-queue + IPC + approve.sh |
| FR-3.6 结果动画 | 2.7 | ApprovalBlock.tsx |
| FR-3.7 审批历史 | 6.2, 4 | ApprovalHistory.tsx + db.ts |
| FR-3.8 桌面通知 | 6.10 | notifications.ts |
| FR-4.x 系统托盘 | 6.3 | tray.ts |
| FR-5.1~5.3 设置 | 4, 8.1 | SettingsView.tsx（无开机自启项） |
| FR-6.1 单实例锁 | — | index.ts |
| FR-6.2 HTTP API | 6.5 | server.ts（固定端口，占用即退出） |
| FR-6.3 健康检查 | 6.5 | GET /health |
| FR-6.4 YAML 配置 | 6.1, 8.2 | config.ts |
| FR-6.5 优雅退出 | — | index.ts |

> 延后项（REQUIREMENTS §5）：FR-3.9 终端并行 / FR-5.4 审批超时配置 / FR-6.6 开机自启 + 打包。

---

## 11. 参考实现说明

> [abtop](https://github.com/graykode/abtop)（Rust TUI AI agent monitor）为本项目 Session 发现部分提供了实现参照。已采纳的核心模式：
>
> - `~/.claude/sessions/*.json` 扫描 → 解析 pid / sessionId / cwd / startedAt，读 `/proc/{pid}/stat` 得内存（§6.8.2a-c）
> - transcript jsonl（`~/.claude/projects/*/{sessionId}.jsonl`）末条 assistant 消息 usage → input + cache_read + cache_creation = 上下文占用（§6.8.2e，与终端状态栏同源）
> - 模型名含 `[1m]` → 上下文窗口按 1M 计，否则 200K（§6.8.2e）
> - settings.json 的 `ANTHROPIC_DEFAULT_*_MODEL_NAME` → 还原 API provider 名（§6.8.2f）
>
> v3.2 裁剪后**不采纳**的 abtop 模式：进程树遍历与 CPU 阈值 busy/idle 判定（改进程存活判定）、cmux/tmux 终端跳转适配器链（只留 kgx/gnome-terminal 直起）、多 profile 目录自动发现（只扫配置列表）。其余未实现功能（token 历史、rate limit、git 状态、子 agent 树等）如需扩展直接参考 abtop 源码，本文档不再逐一列表。
