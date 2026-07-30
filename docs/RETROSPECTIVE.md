# harness-monitor — 项目复盘

> 项目：Electron 桌面托盘应用（DeepSeek 余额 + Claude Code session 监控 + Bash 命令审批）
> 周期：2026-07-21 启动 → 2026-07-30 验收收口（9 天，开发净时约 7 个工作日）
> 结果：**11/11 模块完成，E2E 验收 42 项通过 / 0 失败**
> 蓝图版本：REQUIREMENTS v2.2 / DESIGN v3.2 / TASKS v2.3

---

## 1. 项目概述

为"日常用 Claude Code、经本地代理接 DeepSeek API"的程序员提供的桌面生产力工具（非 demo）：

- **余额监控**：定时拉 DeepSeek `/user/balance`，余额卡 + 30 天余额趋势线 + 低余额托盘红灯/桌面通知
- **Session 监控**：扫描 `~/.claude` 会话，卡片展示状态灯/上下文%/内存/provider/cwd，支持跳转终端与终止
- **命令审批**：Claude Code PreToolUse hook（`approve.sh`）→ 本地 HTTP → 面板批准/拒绝 → 托盘橙灯 + 通知 + 历史

**规模**：26 commits｜src 4264 行（17 ts + 14 tsx + 1 css）｜主进程 12 模块 + 渲染层挂件壳/三视图｜`approve.sh` 69 行｜better-sqlite3 WAL 持久化。

**运行形态**：340×650 frameless 毛玻璃悬浮挂件 + 系统托盘四色灯，绑定 127.0.0.1:18456，单实例。

---

## 2. 时间线

| 日期 | 里程碑 |
|------|--------|
| 07-21 | 启动；旧 Python 版作参照，决定 Electron 全量重写 |
| 07-22~23 | 蓝图三文档 + REVIEW.md（13 项）+ 整改；基准原型定为 340px 挂件 |
| 07-24 | M1 项目骨骼（踩网络/GPU/sandbox 坑） |
| 07-27 | M2/M3/M3r；**链路合并 16→12**、**蓝图裁剪 8 项**、启用高速档 |
| 07-28 | M4/M5/M6 + 后端批量审 + 整改；常驻实例交用户试玩 |
| 07-29 | M7 + **前端四线并行**（M8/M9/M10/approve.sh） |
| 07-30 | 前端批量审（3×P1）+ 整改 d63fe60 + **M11 E2E 验收收口** + 工作流整改 |

---

## 3. 关键决策（附理由）

| 决策 | 理由 |
|------|------|
| Electron 全量重写（弃 Python 旧版） | 托盘 + 毛玻璃挂件 + IPC 推送，Electron 生态更顺 |
| UI 基准定 340px 悬浮挂件，弃侧边栏全窗原型 | 托盘工具应轻量常驻，非全窗应用 |
| ctx% 改用 transcript 末条 usage token 估算 | 与 Claude Code 终端底部上下文指示条**同源**（实测 3/3 MATCH），弃"行数×5"粗估 |
| `approve.sh` exit code 用 0/2（非 0/1） | 遵循 Claude Code PreToolUse hook 规范，exit 1 无法真正拦截 |
| **蓝图裁剪 8 项假功能** | DeepSeek API 不返回 token 消耗/总预算——今日 token、余额百分比进度条等只能造假值，砍 |
| 告警阈值 15% 比例 → ¥10 绝对金额 | API 无总预算，比例无分母；绝对金额可落地 |
| 时间戳全链路 `datetime('now','localtime')` | 单机工具，本地时间最简；消除 UTC+8 凌晨跨日聚合错位 |
| `recordApproval` 单一落库点（POST /approve 恢复处） | 覆盖超时 auto-deny 路径，否则超时审批漏记历史（审查整改确立的不变量） |
| 删 recharts，趋势线用原生 SVG | 体积/依赖减负，30 点折线无需重型图表库 |
| 高速档 + 阶段边界批量审 + 前端四线并行 | 流程轮次是主要耗时；批量审能抓跨模块不变量；零文件冲突模块可并行 |

---

## 4. 踩坑与解法

### 环境坑（本机 Ubuntu 24.04 / GNOME / Wayland）

| 坑 | 解法 |
|----|------|
| electron-vite dev GPU 进程 FATAL（error 1002），拒收 --disable-gpu | 用构建产物 `electron . --disable-gpu --in-process-gpu` |
| Wayland 下 xprop/wmctrl 看不到 Electron 窗口 | CDP 做 DOM 读写/点击；xwininfo/import 取几何与像素 |
| CDP captureScreenshot 软件渲染偶发挂死 | 改用 `import -window` 截图 |
| GNOME 无原生托盘 | 装 ubuntu-appindicators 扩展（SNI 注册即 Active） |
| better-sqlite3 经 electron-rebuild 后 ABI 切换（127→128），裸 node require 失效 | db 验证改走运行中应用 / sqlite3 CLI；**全新安装必须 postinstall 固化**（→ D1） |
| SVG data URL 图标不显示 | Electron nativeImage 不光栅化 SVG → 程序化 PNG 编码（zlib+CRC32） |
| `/proc/<pid>/stat` rss 字段偏移 | 实测荒谬值后查 proc(5)：是第 **24** 字段，非 22 |

### 工程坑

| 坑 | 教训 |
|----|------|
| P1 跳转终端被做成静默空桩（`return false // M9 实现`）到 review 才暴露 | **含空桩的模块不得标"完成"**，占位桩必登记（已入 CLAUDE.md 硬规则） |
| 审批超时路径不 push → 前端卡片 zombie、badge 永久卡住 | 跨模块交互问题单模块测不出 → **阶段边界批量审 + 早期集成** |
| 会话中断致前端批量审漏派发、孤儿实例驻留 | **收尾三件套**（commit+清理实例+回写日志）+ 会话启动核对未收尾项 |
| M2 蓝图 §8.2 合并顺序与 §6.1 优先级矛盾 | 蓝图是活文档：以实现正确方向为准 + 回写勘误 |

---

## 5. 工作流经验（已蒸馏进 ~/CLAUDE.md + 记忆）

**验证有效、保留**：
- 蓝图先行（需求/设计/任务三文档逐步确认）——返工率显著降低
- dev+test 合并 subagent（快循环）/ Code Review 独立 agent（交叉验证）/ 主对话持蓝图不沾代码
- PROGRESS.md 进度日志——多次跨会话无损接续，救回漏派发的 review

**本项目暴露、已补进流程**：
- **蓝图反向审查（反膨胀）**：蓝图会自发膨胀（假功能/想象规模/仪式感），需反向拷问对冲
- **开局定档**：规模档 S/M/L × 推进档 低速/高速，避免一套力度套所有项目
- **模块合并启发式** + **并行派发规则**（文件域/单一写方/验证串行）
- **集成左移** + **收尾三件套** + **HH:MM:SS 时间戳**

---

## 6. 延后项评估（D1/D2/D3）

| 项 | 内容 | 价值 | 成本 | 风险 | 建议 |
|----|------|------|------|------|------|
| **D1** | 打包（.deb/AppImage）+ 开机自启 + chrome-sandbox SUID 固化 + electron-rebuild postinstall 固化 | **高**：产品化最后一公里；开机自启是托盘工具体验刚需 | 中（2~4h，主要踩 electron-builder + native 打包） | 坑已探明：M1 记 SUID 未入代码、M5 记 native ABI 必须 postinstall，均为已知必做 | **优先做**。必要且风险可控 |
| **D2** | 终端并行审批：hook 终端提示 + Ctrl+C 拒绝 / 另开窗口 curl 响应 | 中：面板批准/拒绝已覆盖主路径，这是"不想看面板"的补充 | 中-高：approve.sh 交互改造、SIGINT→deny、hook stdin/stdout 被 Claude Code 占用的限制 | Ctrl+C 信号语义与 fail-open 策略需协调 | **缓做/按需**。ROI 偏低，除非高频出现该场景 |
| **D3** | 审批超时时间可配置（v1 固定 60s） | 低-中：60s 多数够用，个别长命令需更长 | **低**（0.5~1h）：M10 已建好设置页框架 + saveConfig 重调度，加字段+输入框即可 | 低 | **顺手做**。可与 D1 同批，作为设置页小补充 |

**排期建议**：D1 + D3 同批做（产品化 + 顺手补设置项，约 3~5h）；D2 暂缓，待真实使用中出现"不想切面板"的明确诉求再评估。

---

## 7. 数据附录

- **模块**：M1~M11（+ M3r schema 返工），Phase 1 基础设施 4 / Phase 2 后端 2 / Phase 3 前端 4 / Phase 4 集成 1
- **审查**：后端批量审（M4+M5+M6）+ 前端批量审（M7~M10，3×P1 整改 d63fe60）+ M11 E2E
- **验收**：42 项通过 / 0 失败 / 4 肉眼项用户确认（FR/NFR/US 全核销）
- **真实数据验证**：余额 ¥10.77、2 个真实 session（ctx% 11%/27% 与 statusline.py 同源）、审批全链路含 60s 超时 auto-deny
- **commit 规范**：`feat(Mx)` / `fix(Mx)` / `docs`；TypeScript strict 全栈；主进程异步不外溢渲染进程
