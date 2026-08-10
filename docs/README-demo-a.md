# SessionBuddy

[![License](https://img.shields.io/badge/License-ISC-blue)](LICENSE)
[![Platform](https://img.shields.io/badge/Linux-production%20ready-success)](#平台支持)
[![macOS](https://img.shields.io/badge/macOS-experimental-orange)](#平台支持)
[![Electron](https://img.shields.io/badge/Electron-32-47848F)]()
[![React](https://img.shields.io/badge/React-19-61DAFB)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6)]()

为使用 Claude Code + 本地代理接入第三方 API 的程序员提供实时监控的 Electron 桌面托盘应用：API 余量追踪、多 Session 状态看板、Bash 命令集中审批。

> 截图待补（docs/screenshots/ 目录规划中）

## 功能

| 能力 | 说明 |
| --- | --- |
| API 余量追踪 | 多卡余量/用量追踪（DeepSeek、阿里云百炼等，`usage_sources` 可插拔）；30 天余额趋势线；低余额告警——托盘变红 + 桌面通知 |
| 多 Session 监控 | 每 3s 轮询扫描 `~/.claude/sessions/`；卡片含脉冲状态灯、名称、运行时长、API provider、上下文消耗 ctx%、内存 MB、工作目录、任务清单、子 Agent 协作 |
| Bash 集中审批 | `PreToolUse` hook → `approve.sh` → 托盘弹卡；`sudo`/`rm`/`chmod`/`dd` 危险命令高亮；镜像过滤终端（终端侧不弹审批）静默放行；审批历史 SQLite 持久化；桌面通知 |

## 平台支持

| 平台 | 状态 | 备注 |
| --- | --- | --- |
| Linux | 生产可用 | 主支持平台 |
| macOS | 实验性 | 已做代码适配，未经 macOS 设备实测；需额外安装 `jq`/`curl`：`brew install jq curl` |

## 快速开始

前置要求：Node.js + npm。

```bash
npm install      # 安装依赖
npm run dev      # 开发模式
npm run build    # 构建 + typecheck
```

打包分发：

```bash
npm run dist:linux   # deb / AppImage
npm run dist:mac     # dmg / zip（实验性）
```

### 配置 API Key

API key 通过环境变量注入，不写入代码或配置文件：

```bash
export DEEPSEEK_API_KEY=sk-...
export ALIYUN_BAILIAN_API_KEY=sk-...
npm run dev
```

### 审批 Hook

应用启动时自动将审批 hook 幂等注册到 `~/.claude/settings.local.json`，无需手动配置。手动安装示例（`matcher` 留空 = 匹配所有工具调用，`approve.sh` 内部做 Bash 镜像过滤；命令路径以实际安装位置为准）：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/session-buddy/resources/hooks/approve.sh",
            "timeout": 70000
          }
        ]
      }
    ]
  }
}
```

## 配置

配置文件：`~/.config/harness-monitor/config.yaml`（Linux）。

| 字段 | 值 |
| --- | --- |
| 监听地址 | `127.0.0.1:18456`（本地 HTTP） |
| 健康检查 | `GET /health` |
| 审批超时链 | hook `timeout` 70000ms > `curl -m 65` > 服务端 60s 自动拒绝 |
| 审批历史 | SQLite（better-sqlite3）持久化 |

健康检查：

```bash
curl http://127.0.0.1:18456/health
```

### 托盘状态机

| 颜色 | 含义 |
| --- | --- |
| 红 | 余额低 |
| 橙 | 存在待审批命令 |
| 绿 | 正常 |
| 灰 | 服务未启动 |

## 架构

| 层 | 技术 |
| --- | --- |
| 桌面壳 | Electron 32 / electron-vite 2 |
| 渲染层 | React 19 / TypeScript 5.9 / Tailwind 3.4 |
| 本地服务 | Express 4（审批接收、健康检查） |
| 存储 | better-sqlite3 11 |
| 配置 | yaml |

核心链路：

1. **审批**：Claude Code `PreToolUse` hook（`timeout` 70000ms）→ `approve.sh`（`curl -m 65`）→ 本地 Express（60s 无响应自动拒绝）→ 托盘弹卡 → 用户批准/拒绝 → 放行或拦截
2. **监控**：每 3s 轮询 `~/.claude/sessions/`，刷新 Session 卡片（脉冲灯、运行时长、ctx%、内存、任务清单、子 Agent）
3. **余额**：`usage_sources` 拉取各卡余量 → 累计 30 天趋势 → 低于阈值时托盘转红 + 桌面通知

### 安全

- HTTP 仅监听 `127.0.0.1`，数据不出本机
- `contextBridge` + `contextIsolation`，禁用 `nodeIntegration`
- API key 仅经环境变量注入，不入代码、不入配置

## 许可

ISC，见 [LICENSE](LICENSE)。

仓库：https://github.com/Cury1994/session-buddy
