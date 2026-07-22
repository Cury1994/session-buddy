# harness-monitor — Implementation Plan

## Context

用户使用 Claude Code 和 Codex CLI 时遇到两个痛点：
1. 接入外部 API（DeepSeek、智谱等）时不知道剩余额度/余额
2. 多个 sessions 时 bash command 审批分散在各个终端，管理不便

需要一个系统托盘工具统一管理这些问题。参考 abtop 的设计理念。

## Tech Stack

- **Python 3** + **GTK4** (PyGObject) + **LibAdwaita**
- 本地 HTTP API (aiohttp, 端口 18456, 仅绑定 127.0.0.1)
- **SQLite** 存储用量历史
- 系统托盘: `libappindicator3` (兼容 GNOME/Ubuntu 24.04)

## Architecture

```
harness-monitor/
├── main.py                 # 入口，单实例锁 + 启动 HTTP + GTK
├── server.py               # aiohttp HTTP API server (端口 18456)
├── tray.py                 # 系统托盘图标 + 面板窗口管理
├── panels/
│   ├── __init__.py
│   ├── usage_panel.py      # Tab 1: API 用量/余额面板
│   └── sessions_panel.py   # Tab 2: Sessions + 待审批内嵌
├── providers/
│   ├── __init__.py
│   ├── base.py             # 余额查询基类
│   ├── deepseek.py         # DeepSeek 余额 API 适配器
│   └── zhipu.py            # 智谱余额 API 适配器
├── harnesses/
│   ├── __init__.py
│   ├── base.py             # Harness 发现基类
│   ├── claude_code.py      # Claude Code session 发现 + 内存/上下文采集
│   └── codex.py            # Codex CLI session 发现
├── db.py                   # SQLite: 用量历史、审批历史
├── config.yaml             # 默认配置
├── hooks/
│   └── approve.sh          # harness 端 hook 脚本模板
└── requirements.txt        # pygobject, aiohttp, pyyaml, psutil
```

## Data Flow

### API 用量 (Tab 1)
1. 托盘工具定时（可配置）通过 provider 适配器直接调用余额 API
2. 每次 Claude Code/Codex 完成 API 调用后，hook 脚本上报 token 消耗到本地 HTTP API
3. 数据存入 SQLite → 面板展示余额 + 今日 token 消耗 + 30 天趋势
4. 阈值告警：余额低于 15% → 图标变红 + 桌面通知

### Sessions (Tab 2)
1. 定期扫描 `~/.claude/sessions/*.json` 和 `~/.codex/sessions/` 目录
2. 通过 `psutil` 获取每个 session 进程的内存占用
3. 解析 settings.json 中的 `ANTHROPIC_DEFAULT_*_MODEL_NAME` 映射，展示真实 API provider（非本地路由地址）
4. 每个 session 卡片展示：名称、状态（busy/idle）、目录、任务描述、真实 API、token 消耗进度、上下文消耗百分比、内存占用
5. 操作按钮：跳转终端、终止 session

### Bash 审批 (内嵌 Tab 2)
1. Harness hook 脚本: `curl -X POST http://127.0.0.1:18456/approve -d '{...}'`
2. HTTP 请求阻塞等待用户响应（超时 60 秒可配）
3. 有审批请求时：桌面通知 + 托盘图标变橙 + 对应 session 卡片展开审批项
4. 用户可在托盘面板或终端里确认（两者并行，谁先响应谁赢）
5. 敏感命令（sudo/rm/chmod 等）黄框高亮
6. 审批历史保留最近 20 条

## Configuration File

`~/.config/claude-monitor/config.yaml`:
```yaml
server:
  port: 18456
providers:
  # 每个 provider 一个适配器
harnesses:
  claude-code:
    sessions_glob: "~/.claude/sessions/*.json"
  codex:
    sessions_path: "~/.codex/sessions/"
notifications:
  balance_warn_threshold: 0.15
  approve_timeout_sec: 60
```

## Implementation Steps

### Step 1: 项目骨架
- 创建项目目录结构
- `requirements.txt`: pygobject, aiohttp, pyyaml, psutil, aiosqlite
- `main.py`: 单实例锁 + 启动 HTTP server + GTK app loop
- `db.py`: SQLite 初始化（用量表、审批历史表）

### Step 2: HTTP API Server (`server.py`)
- `POST /approve` — 接收审批请求，放入队列，阻塞等待结果
- `POST /token-usage` — harness hook 上报 token 消耗
- `GET /health` — 健康检查

### Step 3: Provider 适配器 (`providers/`)
- `base.py`: 抽象基类 `balance_url`, `headers`, `parse_response()`
- `deepseek.py`: `https://api.deepseek.com/user/balance`, Bearer token
- `zhipu.py`: `https://open.bigmodel.cn/api/biz/subscription/list`, Cookie
- 定时查询：config 中配置的 `check_interval_min`

### Step 4: Harness 发现器 (`harnesses/`)
- `base.py`: 抽象基类 `discover_sessions()`, `get_memory()`, `get_context_usage()`
- `claude_code.py`:
  - 读取 `~/.claude/sessions/*.json` 获取 session PID/名称/状态/目录/任务
  - 用 `psutil.Process(pid).memory_info().rss` 获取内存
  - 解析 `settings.json` 获取 `ANTHROPIC_DEFAULT_*_MODEL_NAME` → 真实 API provider
  - 上下文消耗：读取 history.jsonl 中的 token 统计
- `codex.py`: 类似，适配 Codex CLI 的数据格式

### Step 5: GTK UI — 托盘图标 (`tray.py`)
- `libappindicator3` 系统托盘
- 图标状态切换（绿/橙/红/灰）
- 点击托盘图标 → 弹出面板；钉住按钮 → 常驻侧边栏

### Step 6: GTK UI — Tab 1 用量面板 (`panels/usage_panel.py`)
- Provider 余额卡片 + 进度条（绿→黄→红）
- 今日/本周 token 消耗
- 30 天趋势小折线图（cairo 绘制）

### Step 7: GTK UI — Tab 2 Sessions 面板 (`panels/sessions_panel.py`)
- 各 session 卡片列表（名、状、录、务、API、token、ctx%、内存）
- 待审批项内嵌在对应 session 卡片下方
- "跳转终端"/"终止"按钮
- 审批历史折叠区域

### Step 8: Hook 脚本 (`hooks/approve.sh`)
- 被 harness 的 preToolUse hook 调用
- 将命令信息发送到 `POST /approve`
- 等待 HTTP 响应（阻塞），返回 allowed/denied
- 同时输出到终端，允许终端确认（双重审批）

### Step 9: 打包 & 自动启动
- 添加 `~/.config/autostart/harness-monitor.desktop` 实现开机自启
- `pip install -e .` 或直接 `python main.py`

## Verification

1. **启动验证**: `python main.py` → 托盘图标出现，HTTP API 可访问 (`curl http://127.0.0.1:18456/health`)
2. **用量验证**: 配置 DeepSeek API key → Tab 1 显示余额和 token 消耗
3. **Session 验证**: 开启 2 个 Claude Code sessions → Tab 2 展示两个 session 卡片及真实 API、内存、上下文消耗
4. **审批验证**: 在 Claude Code 中执行需要审批的 bash 命令 → 桌面通知 + 面板出现审批项 → 点击批准后命令执行
5. **钉住验证**: 点击图钉按钮 → 面板变为常驻侧边栏；再次点击取消 → 恢复弹出
