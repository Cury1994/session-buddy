# harness-monitor — 文档审查报告

> 审查日期：2026-07-23 | 审查对象：DESIGN.md v3.0 + REQUIREMENTS.md v2.0

---

## 一、会直接导致开发歧义/返工的问题（必须在写 TASKS.md 前修复）

### 1. 核心数据类型完全缺失

IPC 两端（主进程 ↔ 渲染进程）传递的 4 个核心类型没有任何 interface 定义：

- `SessionInfo` — SessionCard 渲染用
- `UsageRecord` — UsageView 渲染用
- `ApprovalPayload` / `PendingApproval` — 审批流程用
- `BalanceInfo` — DeepSeek API 返回值

开发 M9（IPC + Preload）时，主进程和渲染进程的 subagent 会各自猜测字段名，100% 对不上。

**修复**：在 DESIGN.md §6 和 §7 之间新增 `§6.12 共享类型定义`，给出完整 TypeScript interface。

### 2. approve.sh 零设计

FR-3.1 是 **P0**，但设计文档中只在 §5.3 数据流图里写了一行 `approve.sh reads stdin JSON`。缺失：

- Claude Code hook 传入的 JSON schema 是什么？（`{tool_name, tool_input, session_id, ...}`）
- 脚本如何提取 command 和 cwd？
- curl 超时怎么处理？（server 没启动时）
- exit code 约定（0=approve, 1=deny, 2=error）

**修复**：新增 `§6.13 approve.sh — Hook 脚本设计`。

### 3. 窗口尺寸两处矛盾

| 位置 | 值 |
|------|-----|
| §2.9（视觉规范） | `85vw × 85vh`，max `1100×750px` |
| §6.4（window.ts） | `~900 × ~680` |
| §8.1（config.yaml） | `width: 900, height: 680` |

开发时到底用哪个？

**修复**：统一为 config.yaml 的 `900×680`，§2.9 改为引用配置值。

### 4. DeepSeek API 响应解析丢失

v2.0 有详细的字段映射表（`balance_infos[0].total_balance → balance`），v3.0 只剩一行 API 地址。开发 M6 时不知道响应 JSON 长什么样。

**修复**：§6.7 补回响应结构和字段映射。

---

## 二、影响开发效率的重要缺失

### 5. Linux 平台降级策略完全空白

目标平台是 **Ubuntu 24.04**，但设计全程按 macOS HIG 写。以下问题开发时必然遇到：

| 问题 | 影响 |
|------|------|
| `backdrop-filter: blur()` 在 X11 下不生效 | 侧边栏毛玻璃效果消失 |
| Electron Tray 在 GNOME 下需要 `gnome-shell-extension-appindicator` | 托盘图标不显示 |
| 红绿灯按钮在 Linux 上无原生对应 | Close/Minimize/Maximize 行为需自定义 |
| `~/.claude/sessions/*.json` 路径在 Linux 下正确但需确认 | — |

**修复**：新增 `§2.10 Linux 平台适配` 或在 §6.4 中补充降级方案。

### 6. FR-4.1/FR-4.2 仍是占位符

需求文档中：

```
| FR-4.1 | 托盘图标 | gemini设计 | P0 |
| FR-4.2 | 颜色状态 | gemini设计 | P0 |
```

原型图已确认，这里应改为实际描述（SVG 圆点 + 四色状态机），否则需求-设计追溯矩阵中 FR-4.x 的覆盖验证无法做。

### 7. 端口冲突无处理

FR-6.2 硬编码 `18456`，但如果端口被占用（比如旧版 Python 进程还在跑），Express 会直接 crash。

**修复**：§6.5 补充端口冲突处理（`EADDRINUSE` → 尝试 +1 或报错退出）。

### 8. §5.2 与 §6.8 扫描方式不一致

§5.2 写 `fastGlob("~/.claude/sessions/*.json")`，§6.8 写 `fs.readdir + filter *.json`（参考 abtop）。应统一。

### 9. §6.8.1 引用 abtop 配置文件不合理

> "读取 ~/.config/abtop/config.toml → claude_config_dirs 字段（向后兼容）"

harness-monitor 不应依赖 abtop 的配置文件。应改为读自己的 `config.yaml` 中的 `harnesses.claude-code.config_dirs` 字段。

### 10. 测试用例缺少 approve.sh

FR-3.1 是 P0，但 §9 测试用例中没有 approve.sh 的测试项（stdin JSON → curl → exit code）。

---

## 三、小问题

### 11. FR-1.3 编号缺失

需求编号从 FR-1.2 直接跳到 FR-1.4，要么补上 FR-1.3，要么重新编号。

### 12. approval-queue 的 id 生成策略未定义

`enqueue()` 返回 `{id, promise}`，但 id 是 UUID、自增整数、还是时间戳？影响 IPC 和 HTTP 两端。

### 13. 配色来源冲突

Design Specification.txt 中 Card Background 是 `rgba(255, 255, 255, 0.55)`（半透明），但原型图和 DESIGN.md 中 card 是纯白 `#ffffff`。应以原型图为准，但需注明。

---

## 修复优先级

| 优先级 | 问题编号 | 修复时机 |
|--------|---------|---------|
| **P0 — 阻塞 TASKS.md** | 1, 2, 3, 4 | 立即修复 DESIGN.md |
| **P1 — 影响开发效率** | 5, 6, 7, 8, 9, 10 | 写 TASKS.md 时作为各模块验收标准补充 |
| **P2 — 小修** | 11, 12, 13 | 随手修 |
