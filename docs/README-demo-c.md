# SessionBuddy

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-32-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![electron-vite](https://img.shields.io/badge/electron--vite-2-646CFF?logo=vite&logoColor=white)](https://electron-vite.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

SessionBuddy（曾用名 harness-monitor）是面向「Claude Code + 本地代理接入第三方 API」工作流的 Electron 桌面托盘应用。所有数据保存在本机：HTTP 服务仅监听回环地址，审批历史与配置全部本地持久化，API key 只经环境变量注入，不写入代码与配置文件。

## 功能

1. **多卡 API 余量追踪** — 可插拔的 `usage_sources` 适配多家供应商（DeepSeek、阿里云百炼等，`http-json` 端点零代码接入），30 天余额趋势线，低余额时托盘变红 + 桌面通知（告警线可配置）。
2. **多 Session 统一监控** — 每 3 秒轮询 `~/.claude/sessions/`，卡片呈现：脉冲状态灯、会话名称、运行时长、API provider、上下文消耗（ctx%）、内存占用（MB）、工作目录、任务清单与子 Agent 协作状态。
3. **Bash 命令集中审批** — PreToolUse hook 将待执行命令推送为托盘弹卡，危险命令（`sudo` / `rm` / `chmod` / `dd`）高亮，镜像过滤终端原本不会弹询的命令、静默放行不打断工作流，审批历史持久化于 SQLite 并附桌面通知。

## 平台支持

| 平台 | 状态 | 说明 |
|------|------|------|
| Linux | 生产可用 | 主开发与测试平台（GNOME 需 appindicator 扩展显示托盘图标） |
| macOS | 实验性 | 代码已适配但**未经 macOS 真机实测**；另需 `brew install jq curl` |

## 安装

```bash
git clone https://github.com/Cury1994/session-buddy.git
cd session-buddy
npm install      # 安装依赖
npm run dev      # 开发模式（electron-vite HMR）
npm run build    # 构建 + 类型检查（typecheck:node + typecheck:web）
npm run dist:linux   # 打包 deb / AppImage
npm run dist:mac     # 打包 dmg / zip（实验性）
```

## 配置参考

### 配置层级

低 → 高优先级合并，后者覆盖前者：

```
内置默认值（随应用分发的 config.yaml）
  → 用户配置 ~/.config/harness-monitor/config.yaml（Linux）
  → 兼容层 ~/.config/claude-monitor/config.yaml（旧 claude-monitor 配置）
```

Linux 用户配置路径 `~/.config/harness-monitor/config.yaml`（保留历史目录名，不打断既有数据）；macOS 为 `~/Library/Application Support/session-buddy/config.yaml`（实验性）。文件缺失 / 解析失败静默降级为默认值。

### 配置示例（带注释）

```yaml
# ~/.config/harness-monitor/config.yaml
server:
  host: "127.0.0.1"   # 监听地址；安全原因请勿改为 0.0.0.0
  port: 18456

usage_sources:                 # 余量源列表（可插拔）
  - id: deepseek               # kind: http-json / bss / subscription
    name: DeepSeek
    billing: payg              # payg=按量；subscription=订阅
    kind: http-json
    url: "https://api.deepseek.com/user/balance"
    auth:
      type: bearer
      key_env: "DEEPSEEK_API_KEY"   # API key 所在环境变量名，不写入本文件
    remaining:
      path: "balance_infos[0].total_balance"   # JSON 点号路径，支持数组下标
    unit: CNY
    warn_threshold: 10         # 低余量告警线；或填 limit 自动算 limit-usage
    # 阿里云百炼：billing: subscription, auth.type: none, 以 detect_ids（host）桥接 cc-switch 归并出卡

detection:                     # cc_switch 可选（本机未装自动跳过）
  cc_switch:
    enabled: true
    db_path: "~/.cc-switch/cc-switch.db"
  claude_sessions:
    enabled: true

usage_poll_interval_min: 1     # 全局余量轮询间隔（分钟）

harnesses:
  claude-code:
    sessions_glob: "~/.claude/sessions/*.json"
    settings_path: "~/.claude/settings.local.json"   # 审批 hook 主注册位
    refresh_interval_sec: 3    # Session 卡片刷新间隔
    config_dirs: ["~/.claude"]

notifications:
  enabled: true
  approve_timeout_sec: 60      # 审批超时自动拒绝（秒）

window: { width: 420, height: 650 }
context_lengths: {}            # 模型上下文长度表，空表 = 自动推导
```

### 字段说明

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `server.host` | string | `"127.0.0.1"` | HTTP 监听地址 |
| `server.port` | number | `18456` | HTTP 端口 |
| `usage_sources[]` | array | deepseek + aliyun-bailian | 余量源列表（可插拔） |
| `usage_sources[].kind` | string | — | `http-json` / `bss` / `subscription` |
| `usage_sources[].billing` | string | — | `payg`（余量=剩余金额）/ `subscription`（套餐额度） |
| `usage_sources[].auth` | object | — | `bearer` 用 `key_env` 指环境变量；`none` 免鉴权 |
| `usage_sources[].remaining` | object | — | `path` 点号路径取剩余；或 `limit` 自动 `limit - usage` |
| `usage_sources[].warn_threshold` | number | — | 低余量告警线（可选） |
| `usage_poll_interval_min` | number | `1` | 余量轮询间隔（分钟） |
| `harnesses.claude-code.sessions_glob` | string | `"~/.claude/sessions/*.json"` | Session 匹配模式 |
| `harnesses.claude-code.settings_path` | string | `"~/.claude/settings.local.json"` | 审批 hook 主注册位 |
| `harnesses.claude-code.refresh_interval_sec` | number | `3` | Session 轮询间隔（秒） |
| `notifications.approve_timeout_sec` | number | `60` | 审批超时秒数，超时自动拒绝 |
| `window.width` / `height` | number | `420` / `650` | 主窗口尺寸 |
| `context_lengths` | object | `{}` | 模型上下文长度表；`manual` 条目不被自动覆盖 |

### API key 注入

```bash
export DEEPSEEK_API_KEY="sk-..."      # DeepSeek
export ALIYUN_BAILIAN_API_KEY="..."   # 阿里云百炼
```

## HTTP API

本地服务监听 `http://127.0.0.1:18456`（仅回环地址）。

| Method | Path | 说明 |
|--------|------|------|
| GET | `/health` | 健康检查，返回 `{"status":"ok"}`；兼作启动时单实例探测 |
| POST | `/approve` | 审批 hook 回调入口（approve.sh 调用，含 passthrough / allowed 判定） |

## 审批机制

### Hook 注册

应用启动时自动将 PreToolUse hook 注册到 `~/.claude/settings.local.json`（主注册位，免疫 cc-switch 对 `settings.json` 的覆写），并监听两个 settings 文件的变化做幂等自修复。**正常使用无需手动配置。** 手动安装的等效配置：

```json
// ~/.claude/settings.local.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/session-buddy/resources/hooks/approve.sh",
            "timeout": 70000
          }
        ]
      }
    ]
  }
}
```

approve.sh 依赖 `jq`、`curl`（macOS 需 `brew install jq curl`）。

### Hook 响应协议

| 响应 | 行为 | 效果 |
|------|------|------|
| `passthrough` | 镜像过滤判定终端不会弹 → 不输出 JSON，exit 0 | 静默放行 |
| `allowed: true` | stdout 输出 `permissionDecision: allow` | 放行（exit 0） |
| `allowed: false` | 用户拒绝 / 超时 auto-deny → exit 2 | 拦截（stderr 回传 Claude） |
| 其余（空 / 垃圾响应） | 兜底 exit 0 | fail-open，不误杀工作流 |

拦截一律走 exit 2（Claude Code 规范中唯一真正拦截的退出码），拒绝不托付 JSON 解析，避免 fail-open 安全洞。

### 超时链（三层防御）

| 层 | 超时 | 行为 |
|----|------|------|
| Claude Code hook timeout | `70000` ms | hook 执行上限（实测单位是毫秒） |
| `curl -m` 客户端超时 | `65` s | 需大于服务端 60s，避免客户端先超时误判 |
| server 审批超时 | `60` s | `notifications.approve_timeout_sec`，无响应自动拒绝 |

### 快速通道

永不询问类工具（`Glob` / `Grep` / `LS` / `Task` / `TodoWrite` 等）在任何重解析与网络请求之前直接 exit 0 放行。

## 托盘状态

四色状态机，高优先级覆盖低优先级：

| 优先级 | 颜色 | 含义 | 触发条件 |
|--------|------|------|----------|
| 1 | 红 | 低余额 | 任一 usage source 低于 `warn_threshold` |
| 2 | 橙 | 待审批 | 存在待处理的命令审批 |
| 3 | 绿 | 正常 | 服务运行且无异常 |
| 4 | 灰 | 服务未起 | 本地 HTTP 服务未启动 |

## 架构

### 技术栈

| 层 | 技术 |
|----|------|
| 运行时 | Electron 32 |
| 构建 | electron-vite 2 |
| 前端 | React 19 + TypeScript 5.9 + Tailwind CSS 3.4 |
| 本地存储 | better-sqlite3 11（审批历史） |
| 本地 HTTP | Express 4（仅监听 127.0.0.1:18456） |
| 配置解析 | yaml |

### 数据流

```
Claude Code ──PreToolUse──▶ approve.sh ──curl──▶ Express (127.0.0.1:18456)
                                                    │ 镜像过滤 / 审批队列
                                                    ▼
                                SQLite（审批历史） ◀── 托盘弹卡 ◀── 桌面通知
主进程：usage_sources 轮询余量、3s 轮询 ~/.claude/sessions/；渲染进程（React 卡片）◀── contextBridge IPC ◀── 主进程
```

## 安全模型

- **仅回环监听**：HTTP 只监听 `127.0.0.1:18456`，不对局域网开放；
- **数据不出本机**：API key 仅经环境变量注入，不入代码、不入配置；审批历史与配置全部本地存储；
- **进程隔离**：contextBridge + contextIsolation 隔离渲染进程，禁用 nodeIntegration；
- **单实例锁**：启动时探测 `/health`，旧实例存活则新进程自动退出——SQLite 始终只有一个写入方；
- **fail-safe 拦截**：审批拒绝走 exit 2 直接拦截，不依赖响应体 JSON 解析。

## 界面

> 截图待补（screenshots pending）：项目当前尚无正式 UI 截图，本节将在后续版本补充托盘菜单、Session 卡片视图、余额趋势图与审批弹卡的实际截图。

## 常见问题

**Q: macOS 能正常使用吗？**
A: 代码已适配但未经 macOS 真机实测，属实验性支持；请先 `brew install jq curl` 并自行验证。

**Q: Linux 托盘图标不显示？**
A: GNOME 桌面需安装 appindicator 扩展（如 `ubuntu-app-indicators`）。

**Q: 端口 18456 被占用？**
A: 启动时探测 `/health`：若返回正常说明旧实例仍在运行，新进程自动退出（单实例锁），无需手动处理。修改 `~/.config/harness-monitor/config.yaml` 后重启应用生效。

**Q: 审批弹卡没有出现？**
A: 依次核对：应用已启动（托盘非灰色）、`settings.local.json` 中 hook 已注册、命令不属于镜像过滤/快速通道清单。修改配置后需重启应用生效。

**Q: hook 的 `timeout` 是什么单位？**
A: 毫秒（Claude Code 2.1.207 实测）。链路已固定 70000ms > curl 65s > server 60s，手动安装时保持该大小关系。

## 许可证

ISC（见 [LICENSE](LICENSE)）。仓库：<https://github.com/Cury1994/session-buddy> · 反馈：[Issues](https://github.com/Cury1994/session-buddy/issues)
