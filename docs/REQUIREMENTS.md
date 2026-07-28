# harness-monitor — 需求文档

> 版本 v2.2 | 2026-07-27 | Electron 全量重写
>
> **v2.2 变更**（蓝图裁剪，用户逐项确认）：FR-1.2 移除今日 token/本月用量/千 token 均价（DeepSeek API 不返回 token 消耗，原为假数据）；FR-1.3 改 30 天**余额**趋势线；FR-1.4 阈值改绝对金额（默认 ¥10）；FR-5.2 移除开机自启开关；FR-3.9 / FR-5.4 / FR-6.6 移入「延后项」；NFR-1 删除数值型性能指标。
>
> **v2.1 变更**（按 REVIEW.md 整改）：FR-1.x 重编号（FR-1.4→1.3 … FR-1.7→1.6）；FR-4.1/4.2 占位符实化（SVG 圆点 + 四色状态机）；FR-2.3 上下文估算改 usage token 方案；FR-3.1 exit code 明确为 0/2。

---

## 1. 产品概述

### 1.1 产品定位

一个 **Electron 桌面系统托盘应用**，为日常使用 Claude Code 并通过本地代理接入 DeepSeek API 的程序员提供：

- 实时 API 余额和用量追踪
- 多 Session 统一状态监控
- Bash 命令审批集中管理

不是 demo，是日常可用的生产力工具。

### 1.2 用户画像

| 角色 | 描述 |
|------|------|
| 主要用户 | 使用 Claude Code 做日常开发的程序员 |
| 使用场景 | 通过本地 HTTP 代理（如 one-api）接入 DeepSeek 等第三方 API |
| 代表性操作 | 同时开 2-5 个 Claude Code session，需要知道还剩多少余额、哪些 session 在跑、哪个在等审批 |

### 1.3 运行环境

- **OS**: Ubuntu 24.04+（首目标），macOS/Windows 后续兼容
- **运行时**: Electron 32 + Node.js 22
- **网络**: 本地 127.0.0.1，不对外暴露

---

## 2. 功能需求

### FR-1: API 余额与用量监控

| ID | 功能 | 详细描述 | 优先级 |
|----|------|---------|--------|
| FR-1.1 | 余额查询 | 定时调用 DeepSeek `/user/balance` API，需要 `DEEPSEEK_API_KEY` 环境变量 | P0 |
| FR-1.2 | 余额卡片 | 每 provider 一张信息卡片，展示：剩余余额、货币单位、低余额警示（低于阈值时卡片显示警示文字）。DeepSeek API 仅返回余额与币种，token 消耗统计接口不提供，v1 不做 | P0 |
| FR-1.3 | 30天余额趋势 | 迷你折线展示近 30 天每日余额快照趋势（原生 SVG，不画坐标轴，hover 显示数值） | P1 |
| FR-1.4 | 余额告警 | 当余额低于可配阈值（默认 ¥10 绝对金额），托盘图标变红，同时发送桌面通知 | P0 |
| FR-1.5 | 定时刷新 | 查询间隔可配置（默认 1 分钟），亦支持手动刷新 | P1 |
| FR-1.6 | 用量持久化 | 所有余额快照存入 SQLite，支持历史回溯和趋势分析 | P0 |

### FR-2: Claude Code Session 监控

| ID | 功能 | 详细描述 | 优先级 |
|----|------|---------|--------|
| FR-2.1 | Session 发现 | 扫描 `~/.claude/sessions/*.json`，每 3 秒自动刷新 | P0 |
| FR-2.2 | 进程内存 | 读取 `/proc/<pid>/status` 的 VmRSS 字段获取物理内存占用 | P0 |
| FR-2.3 | 上下文估算 | 解析 session 对应 transcript（`~/.claude/projects/*/<sessionId>.jsonl`）最后一条含 usage 的记录（不按 role 过滤），按（input + cache_read + cache_creation）tokens ÷ 上下文窗口（200K/1M）得上下文消耗百分比（上限 100%）；与 Claude Code 终端底部上下文指示条同源 | P0 |
| FR-2.4 | API Provider 解析 | 读取 `~/.claude/settings.json` 中 `ANTHROPIC_DEFAULT_*_MODEL_NAME` 环境变量，还原真实 API provider 名称 | P0 |
| FR-2.5 | Session 卡片 | 每 session 一张卡片：脉冲状态灯（忙碌/空闲）、名称、运行时长、API provider、上下文百分比、内存 MB、工作目录、任务状态 | P0 |
| FR-2.6 | 上下文进度条 | Cyan 色细进度条展示上下文消耗百分比 | P1 |
| FR-2.7 | 跳转终端 | 在 session 的 cwd 目录打开系统终端（kgx → gnome-terminal → xterm 回退） | P1 |
| FR-2.8 | 终止 Session | `SIGTERM` 信号终止对应进程 | P1 |

### FR-3: Bash 命令审批

| ID | 功能 | 详细描述 | 优先级 |
|----|------|---------|--------|
| FR-3.1 | Hook 脚本 | Bash 脚本 `approve.sh`：从 stdin 读 JSON → `POST /approve` → 阻塞等待 → 解析响应决定 exit 0（放行）/ 2（拦截，遵循 Claude Code PreToolUse hook 规范） | P0 |
| FR-3.2 | 审批阻塞 | 服务端创建 Promise/Future 挂起 HTTP 请求，超时 60 秒自动 deny | P0 |
| FR-3.3 | 审批卡片 | 对应 session 卡片底部展开审批块：完整命令文本、危险命令警告标签、批准/拒绝/复制按钮 | P0 |
| FR-3.4 | 危险检测 | 命令中含 `sudo`/`rm`/`chmod`/`chown`/`dd`/`mkfs`/`>` 时高亮警告 | P0 |
| FR-3.5 | 双向响应 | UI 批准/拒绝 → IPC → HTTP Promise resolve → hook 收到 `{"allowed": true/false}` | P0 |
| FR-3.6 | 结果动画 | 批准/拒绝后审批块 2 秒淡出消失 | P1 |
| FR-3.7 | 审批历史 | SQLite 持久化每条审批决议，面板底部可折叠展示最近 20 条（含时间戳） | P1 |
| FR-3.8 | 桌面通知 | 新审批到达时发送 Electron 桌面通知，内容包含 session 名和命令预览 | P1 |

> FR-3.9 终端并行审批（Ctrl+C 拒绝 / 另开窗口 curl 响应）→ 移入「延后项」，见 §5。

### FR-4: 系统托盘

| ID | 功能 | 详细描述 | 优先级 |
|----|------|---------|--------|
| FR-4.1 | 托盘图标 | 代码生成的 SVG 圆点图标（22×22 圆点 + 外发光 data URL，无需外部图片资源） | P0 |
| FR-4.2 | 颜色状态 | 四色状态机按优先级切换：红（余额 < 阈值）> 橙（存在待审批）> 绿（一切正常）> 灰（HTTP server 未启动/致命错误） | P0 |
| FR-4.3 | 右键菜单 | Show Panel / Quit 两个菜单项 | P0 |
| FR-4.4 | 左键交互 | 左键点击 → 切换面板显示/隐藏 | P0 |

### FR-5: 设置页面

| ID | 功能 | 详细描述 | 优先级 |
|----|------|---------|--------|
| FR-5.1 | 设置入口 | Header 区域齿轮图标 ⚙ → 打开设置面板 | P1 |
| FR-5.2 | 通用设置 | 通知开关、窗口常驻置顶开关（开机自启移入延后项，见 §5） | P1 |
| FR-5.3 | Provider 设置 | 余额告警阈值（¥ 绝对金额） | P1 |

> FR-5.4 审批超时可配置 → 移入「延后项」，v1 固定 60 秒，见 §5。


### FR-6: 基础设施

| ID | 功能 | 详细描述 | 优先级 |
|----|------|---------|--------|
| FR-6.1 | 单实例锁 | `app.requestSingleInstanceLock()` 防止多开 | P0 |
| FR-6.2 | HTTP API | Express 服务绑定 `127.0.0.1:18456` | P0 |
| FR-6.3 | 健康检查 | `GET /health` → `{"status":"ok"}` | P0 |
| FR-6.4 | YAML 配置 | 三路径回退：项目内置 → `~/.config/harness-monitor/` → `~/.config/claude-monitor/`（向后兼容） | P0 |
| FR-6.5 | 优雅退出 | `SIGTERM`/`SIGINT` → 停止 server → 关闭 DB → 移除 tray → 退出 | P0 |

> FR-6.6 开机自启 → 移入「延后项」，见 §5。

---

## 3. 非功能需求

### NFR-1: 性能
- Session 扫描不阻塞 UI（主进程异步处理）

### NFR-2: 安全
- HTTP 服务仅监听 `127.0.0.1`，不接受外部连接
- 审批命令文本不在日志中持久化（仅存 SQLite，可清空）
- contextBridge + contextIsolation 隔离渲染进程，禁用 nodeIntegration

### NFR-3: 可靠性
- DeepSeek API 调用失败不影响 UI（保留上次数据，显示灰色状态）
- Session 进程意外退出时，卡片优雅降级（显示 0 MB、灰色状态灯）
- 数据库文件损坏时自动重建

### NFR-4: 可用性
- 所有异步操作有加载态 / 空数据态 / 错误态

---

## 4. 用户故事

| ID | 故事 | 验收标准 |
|----|------|---------|
| US-1 | 作为开发者，我打开托盘面板就能看到 DeepSeek 还剩多少钱，不用每次 curl API | 用量 Tab 显示余额卡和 30 天余额趋势线 |
| US-2 | 作为开发者，我一眼就能知道哪几个 Claude Code 在跑、各自消耗多少上下文 | Sessions Tab 列出所有活跃 session 及其状态 |
| US-3 | 作为开发者，当 Claude Code 要执行 `sudo rm -rf` 时，我需要主动确认才能放行 | 审批卡片弹出、按钮亮起、命令高亮 |
| US-4 | 作为开发者，我希望审批历史可查，方便回顾哪些命令被批准/拒绝 | 折叠历史列表最近 20 条 |
| US-5 | 作为开发者，余额快用完时我希望被主动提醒，而不是 API 调不通报错才发现 | 余额 < 15% 时图标变红 + 桌面通知 |
| US-6 | 作为开发者，我可以修改配置（轮询间隔、告警阈值）而不需要改代码 | 设置面板可编辑各项参数并实时生效 |

---

## 5. 明确排除（本次不做）

- 智谱 AI / OpenAI / Anthropic 等其他 Provider
- Codex CLI / Cursor / Cline / Aider 等其他 Harness
- 移动端 / Web 端
- 多机同步 / 云端存储
- 用量账单导出
- 审批规则白名单
- 多语言 i18n
- 今日 token 消耗 / 本月已用金额 / 千 token 均价统计（DeepSeek API 不返回 token 消耗，无真实数据源）
- 余额百分比进度条（API 不返回总预算，无分母）

### 延后项（主体功能验收后另行评估）

- 打包安装包（.deb / AppImage）+ 开机自启（原 FR-6.6 / FR-5.2 自启开关）
- 终端并行审批：hook 同时输出提示到终端，Ctrl+C 拒绝 / 另开窗口 curl 响应（原 FR-3.9）
- 审批超时时间可配置（原 FR-5.4，v1 固定 60 秒）
