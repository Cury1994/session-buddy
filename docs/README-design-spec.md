# SessionBuddy README — 设计 Spec

> huashu-design 三方向流程的 Phase 3 产物。三版 README 的共同输入。

## 产品是什么

SessionBuddy（原 harness-monitor）— Electron 桌面托盘应用，为使用 Claude Code + 本地代理接入第三方 API 的程序员提供实时监控。三块核心能力：

1. **多卡 API 余量/用量追踪** — DeepSeek、阿里云百炼等，可插拔 `usage_sources`；30 天余额趋势线（原生 SVG）；低余额告警（托盘变红 + 桌面通知）
2. **多 Session 统一监控** — 3s 轮询扫描 `~/.claude/sessions/`，每张卡片含：脉冲状态灯（忙/闲）、名称、运行时长、API provider、上下文消耗 ctx%（与终端指示条同源）、内存 MB、工作目录、任务清单、子 Agent 协作、动态消息
3. **Bash 命令集中审批** — PreToolUse hook → approve.sh → 托盘弹卡；危险命令高亮（sudo/rm/chmod/dd…）；镜像过滤（终端不会弹的静默放行）；审批历史 SQLite 持久化；桌面通知

## 目标受众

- 主：用 Claude Code 日常开发、走本地代理（one-api/cc-switch）接第三方 API 的程序员
- 场景：同时开 2-5 个 session，想知道还剩多少余额、哪个 session 在跑、谁在等审批
- 具备命令行基础，熟悉 Claude Code 概念（session/transcript/hook）

## 核心信息点（按重要性排序）

1. 一句话定位：托盘里的 Claude Code 驾驶舱（余额 + 会话 + 审批）
2. 三块核心功能（余额/会话/审批）各配截图
3. 安装/运行方式（npm install + dev/build + dist 打包）
4. 配置方式（环境变量 API key + config.yaml）
5. 审批 hook 机制说明（自动注册 + 手动安装 + 超时链）
6. 平台支持（Linux 生产可用 / macOS 实验性）
7. 技术架构（Electron + electron-vite + React + better-sqlite3；127.0.0.1:18456 本地服务）
8. 安全说明（仅本地监听、数据不出本机、contextIsolation）
9. 许可证（ISC）

## 平台/版本事实（三版必须一致，不得编造）

- Linux 生产可用；macOS 已做代码适配，**未经 macOS 设备实测**（实验性）
- 端口 `127.0.0.1:18456`，GET `/health` 健康检查
- 配置路径 Linux `~/.config/harness-monitor/config.yaml`（历史路径保留）
- 技术栈：Electron 32 / electron-vite 2 / React 19 / TS 5.9 / Tailwind 3.4 / better-sqlite3 11 / Express 4 / yaml
- API key 走环境变量注入（DEEPSEEK_API_KEY / ALIYUN_BAILIAN_API_KEY），不入代码不入配置
- hook 超时链：hook timeout 70000ms > curl -m 65 > server 60s auto-deny
- 托盘四色状态机：红（余额低）> 橙（待审批）> 绿（正常）> 灰（服务未起）
- 仓库名 session-buddy，GitHub 地址 Cury1994/session-buddy

## 三方向的差异化维度

README 是 markdown 文档，视觉差异通过**信息架构 + 叙事结构 + 语气调性 + 排版手法**实现。三版必须骨架互异、同内容、都用于 GitHub 渲染。

- **方向 A · 开发者工具极简**：类 GitHub 主流 dev tool README。徽章横幅 → 一句话定位 → 功能列表（紧凑）→ 快速开始 → 配置 → 架构 → 许可。语气中性精炼，表格密集，少修饰。
- **方向 B · 痛点叙事**：类 FanBox。开头用场景金句制造共鸣（"又切到浏览器看余额了？"）→ 痛点 → 解决方案 → 功能详述（每个带小标题）→ 截图占位 → 安装 → 安全。语气有温度，带用户视角叙事。
- **方向 C · 文档手册**：类生产工具 reference。标题即功能模块，每块给字段级说明（config 字段表、API 端点表、hook 响应约定），接近内部 DESIGN.md 的可读化压缩版。语气严谨，重结构层次，适合当文档查。

## 输出格式

- 最终交付 `README.md`（GitHub Flavored Markdown，含徽章/表格/代码块/适当 emoji）
- 预览：本地用 `marked` + `highlight.js` 渲染成 HTML，浏览器打开截图对比
- 截图占位：项目尚无真实 UI 截图，用诚实 placeholder（`![Usage](./docs/screenshots/usage.png "待补")` + 说明），不编造

## 母题

三版共用母题：**「托盘里的驾驶舱」** — 一个悬浮在系统托盘、随时可见的 Claude Code 控制面板。这是本产品独有的视觉/结构隐喻（别的工具没有），贯穿「一眼看余额、看会话、看审批」的叙事。
