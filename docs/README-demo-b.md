# SessionBuddy

> 又切到浏览器查余额了？

当你同时挂着三张 API 卡、五六个 `claude` 会话、每个都在悄悄烧 token 的时候，这句话大约每二十分钟会从你心里冒出来一次。

SessionBuddy 是一个常驻系统托盘的桌面应用，**一个界面管住所有 Claude Code 会话，把命令审批集中到一个弹卡、顺手自动放行**——免去在终端里一次次被权限确认打断的烦扰，把眼睛放回代码上。

[![status](https://img.shields.io/badge/status-production--ready-green)](#路线图)
[![Platform](https://img.shields.io/badge/Linux-ready--%7C--macOS-experimental-blue)](#平台支持)
[![License](https://img.shields.io/badge/license-ISC-blue)](#许可)
[![审批](https://img.shields.io/badge/⚡-集中审批-orange)](#集中审批--自动审批)
[![会话](https://img.shields.io/badge/👀-多会话监控-teal)](#一个界面管住所有会话)
[![安装](https://img.shields.io/badge/📦-安装-lightgrey)](#安装)

---

## 集中审批 · 自动审批

**这是 SessionBuddy 最擅长的事**：把所有 Bash 命令审批从终端里搬到托盘，能自动放行的绝不让你手点。

`PreToolUse` hook → `approve.sh` → **托盘弹卡**：

- ⚡ **自动审批开关**——对信得过的会话一键开启，该会话的常规命令直接放行，**不再一次次打断你**
- 🛡️ **危险命令集中确认**——`sudo` / `rm` / `chmod` / `dd` 依然弹出卡片高亮，看清楚再点允许，**危险的拦住、安全的放行**
- 🔇 **镜像过滤**——终端里本就不会弹、代理静默放行的命令，这里也如实记录，不留盲区
- 🔔 **桌面通知 + 超时兜底**——hook 超时链 `70000ms > curl -m 65 > server 60s 自动拒绝`，三层保险，绝不悬而不决

> **免去频繁授权 = 把时间还给做事的人**。开启自动审批的会话，agent 跑它的，你在旁边看代码、回消息、并行做别的——不用守在终端前一次次点「允许」。等真的碰到危险命令，它才会把你叫回来。

> agent 要跑 `sudo docker compose up`，卡片弹出，红色 `sudo` 映入眼帘。看了三秒确认没问题，点「允许」，会话继续——而不是在终端里闭眼回车。

---

## 一个界面，管住所有会话

同时开多个 `claude` 会话干活，最怕的就是"看不见"：哪个在跑、哪个卡住、上下文还剩多少、子 Agent 并行了几路——全靠猜。

SessionBuddy 每 3 秒扫一次 `~/.claude/sessions/`，**把所有会话集中在一个悬浮面板里，每个会话一张卡片**：

- 💓 脉冲状态灯——活着还是在装死，一眼区分
- 🏷️ 会话名称 + 运行时长 + API provider
- 🧠 **上下文消耗 `ctx%`**——这个会话还能聊多久，进度条直接告诉你
- 🧮 内存占用、工作目录、当前任务清单
- 🤝 子 Agent 协作结构——并行跑了几路、各在干什么，不再盲飞
- ⚡ 每个会话卡片上的**自动审批开关**——按会话粒度决定放行策略

> 下班前挂四个会话收尾，回来扫一眼面板：哪个跑完了、哪个卡住了、哪个快没上下文了——十秒钟全知道。不用再一个个终端窗口翻。

---

## 没有它 vs 有它

| 场景 | 没有 SessionBuddy | 有 SessionBuddy |
|------|-------------------|------------------|
| 批 Bash 命令 | 终端一行小字，闭眼回车，超时即心碎 | 卡片弹出 + 危险命令高亮，看清楚再点允许 |
| 频繁授权 | 每个命令都打断你一次，守着终端寸步不离 | 自动审批按会话放行，安全命令不再打扰，可并行做别的事 |
| 盯多个会话 | 六七个终端窗口来回切，状态全靠猜 | 一个面板全列出：状态灯、ctx%、内存、任务清单 |
| 低余额预警 | 烧穿了才知道，`Insufficient Balance` 突然报错 | 托盘变红 + 桌面通知，提前叫醒你 |
| 审批历史 | 批过什么全凭记忆 | SQLite 持久化，事后可查 |

---

## 顺便：余量不足，托盘先红为敬

处理完审批，SessionBuddy 还顺带帮你看着 API 余量。托盘图标四色状态机，一眼定生死：

| 颜色 | 含义 |
|------|------|
| 🟢 绿 | 一切正常 |
| 🟠 橙 | 有待审批的命令等你处理 |
| 🔴 红 | 有 API 卡余额见底 |
| ⚪ 灰 | 后台服务没起来 |

- 📊 多卡余量追踪：已内置 **DeepSeek**（按量）、**阿里云百炼**（订阅），`usage_sources` 可插拔
- 📈 30 天余额趋势线：稳步下滑还是断崖跳水，曲线说话
- ⚡ 低余额告警：设置阈值，红了会通知，不用盯着

---

## 路线图

- ✅ Claude Code 会话监控 + 集中审批（生产可用）
- 🔜 **Codex 会话支持（规划中）**——当前版本聚焦 Claude Code，Codex CLI 的会话监控已列入后续计划
- ⚗️ macOS 打包（代码已适配，待真机验证）

---

## 截图

> 截图待补 —— 项目还没有正式 UI 截图，以下为占位，装上之后自己看一眼就知道长什么样 😉

![Session 监控截图](docs/screenshots/sessions.png "待补")

![Bash 审批卡片截图](docs/screenshots/approval.png "待补")

![余量卡片截图](docs/screenshots/usage.png "待补")

---

## 安装

### 平台支持

| 平台    | 状态     | 说明                                                     |
| ----- | ------ | ------------------------------------------------------ |
| Linux | ✅ 生产可用 | 主力平台，日常实测                                              |
| macOS | ⚗️ 实验性 | 已完成代码适配，**未经 macOS 真机实测**；需额外执行 `brew install jq curl` |

### 开发运行

```bash
npm install        # 装依赖
npm run dev        # 开发模式
npm run build      # 构建 + typecheck
```

### 打包分发

```bash
npm run dist:linux   # deb / AppImage
npm run dist:mac     # dmg / zip（实验性）
```

---

## 配置

Linux 配置文件路径：

```
~/.config/harness-monitor/config.yaml
```

### API Key：环境变量注入

密钥只走环境变量，**不入代码、不入配置文件**：

```bash
export DEEPSEEK_API_KEY=sk-xxx
export ALIYUN_BAILIAN_API_KEY=sk-xxx
npm run dev
```

### 审批 Hook：自动注册

应用启动时会自动把审批 hook 注册到 `~/.claude/settings.local.json`，**无需手动配置**。想手动来一份也行，示例：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "/path/to/session-buddy/resources/hooks/approve.sh" }
        ]
      }
    ]
  }
}
```

### 健康检查

后台服务监听 `127.0.0.1:18456`：

```bash
curl http://127.0.0.1:18456/health   # 200 = 活着
```

---

## 安全设计

一个监控 Bash 审批流的应用，自己首先要经得起审视：

- 🔒 本地 HTTP 服务**只监听 `127.0.0.1`**，端口不对外
- 📦 **数据不出本机**——余额、会话、审批记录全部留在本地 SQLite
- 🧱 Electron 渲染层走 `contextBridge` + `contextIsolation`，**禁用 `nodeIntegration`**
- 🔑 密钥仅存在于环境变量，代码与配置里零残留

---

## 技术栈

Electron 32 · electron-vite 2 · React 19 · TypeScript 5.9 · Tailwind 3.4 · better-sqlite3 11 · Express 4 · yaml

## 致谢

感谢 Claude Code 生态里每一个把终端当家的程序员——这个项目就是为你们（和我们）写的。

---

> 从此，「又切到浏览器查余额了？」这句话，留给别人说。

---

[GitHub 仓库](https://github.com/Cury1994/session-buddy) · [ISC License](LICENSE)
