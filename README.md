# SessionBuddy

Electron 桌面托盘应用，为使用 Claude Code + 本地代理接入第三方 API 的程序员提供实时监控。

## 功能

- **多卡 API 余量/用量实时追踪** — DeepSeek、阿里云百炼等，可插拔 `usage_sources` 配置
- **多 Session 统一状态监控** — 3s 轮询，含上下文长度 ctx% / 任务清单 / 子 Agent
- **Bash 命令审批集中管理** — PreToolUse hook → approve.sh → 托盘弹卡

## 环境要求

| 平台 | 状态 |
|------|------|
| Linux | ✅ 生产可用（GNOME + appindicator 扩展） |
| macOS | ⚠️ 实验性（已做代码适配，未经 macOS 设备实测） |

macOS 额外依赖（Homebrew 安装）：

```bash
brew install jq curl
```

## 安装与运行

```bash
npm install        # 需要 Node 18+；走代理时先配 .npmrc
npm run dev        # 开发模式（electron-vite dev）
npm run build      # 构建 + 双 typecheck
```

## 打包

```bash
npm run dist:linux   # deb + AppImage
npm run dist:mac     # dmg + zip（实验性）
```

## 配置

API key 通过环境变量注入，**不写入配置文件**：

```bash
export DEEPSEEK_API_KEY="sk-xxx"
export ALIYUN_BAILIAN_API_KEY="xxx"
```

用户配置位于 `~/.config/harness-monitor/config.yaml`（Linux）。默认配置见仓库根 `config.yaml`，支持多卡余量源、告警阈值、上下文长度表等，字段含义见文件内注释。

## 审批 hook 安装

SessionBuddy 通过 Claude Code PreToolUse hook 拦截 Bash 等工具调用并弹卡审批。hook 由应用启动时自动注册到 `~/.claude/settings.local.json`，无需手动配置。

手动安装：

```bash
# settings.local.json 的 PreToolUse hooks 数组加入：
{
  "matcher": "",
  "hooks": [
    {
      "type": "command",
      "command": "<项目绝对路径>/resources/hooks/approve.sh",
      "timeout": 70000
    }
  ]
}
```

## 开发

```bash
npm run typecheck    # node + web 双 typecheck
npm run build:only   # 仅 electron-vite 构建（跳过 typecheck）
```

架构与设计文档见 `docs/DESIGN.md`。

## 许可

ISC — 见 [LICENSE](LICENSE)
