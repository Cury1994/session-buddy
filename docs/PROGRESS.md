# harness-monitor — 开发进度日志

> 项目：harness-monitor（Electron 桌面托盘应用） | 启动：2026-07-21 | 蓝图：REQUIREMENTS v2.1 / DESIGN v3.1 / TASKS v2.1

## 状态总览

| 模块 | 优先级 | 状态 | 单测 | Code Review | 完成时间 | 备注 |
|------|--------|------|------|-------------|---------|------|
| M1 项目骨骼 | P0 | ✅ 完成 | 通过 | 通过 | 2026-07-24 | commit 4e30d2f + 5783a5d（review 整改） |
| M2 配置管理 | P0 | ✅ 完成 | 通过 | 通过 | 2026-07-27 | commit 9a277be；P2 小修随 M3 提交 |
| M3 数据库 | P0 | 🔄 进行中 | — | — | | better-sqlite3，externalizeDeps 必加 |
| M4 系统托盘 + 窗口管理 | P0 | ⏳ 未开始 | — | — | | 340×650 挂件 |
| M5 HTTP Server + 审批队列 | P0 | ⏳ 未开始 | — | — | | id=UUID + 端口冲突处理 |
| M6 DeepSeek 余额查询 | P0 | ⏳ 未开始 | — | — | | |
| M7 Claude Code Session 发现 | P0 | ⏳ 未开始 | — | — | | ctx% = usage token |
| M8 定时任务调度 | P0 | ⏳ 未开始 | — | — | | |
| M9 IPC 通道 + Preload | P0 | ⏳ 未开始 | — | — | | shared/types.ts |
| M10 挂件壳 | P0 | ⏳ 未开始 | — | — | | WidgetHeader+SegmentedControl |
| M11 用量视图 | P0 | ⏳ 未开始 | — | — | | 余额卡/统计卡/TrendSparkline |
| M12 Sessions 视图 | P0 | ⏳ 未开始 | — | — | | SessionCard/ApprovalBlock |
| M13 设置视图 | P1 | ⏳ 未开始 | — | — | | SettingsView 内联 |
| M14 通知集成 + 颜色联动 | P1 | ⏳ 未开始 | — | — | | |
| M15 打包 + 开机自启 | P2 | ⏳ 未开始 | — | — | | |
| M16 端到端测试 | P0 | ⏳ 未开始 | — | — | | |

**阶段进度**：Phase 1 基础设施 1/4 ｜ Phase 2 后端 0/5 ｜ Phase 3 前端 0/4 ｜ Phase 4 集成 0/3 ｜ 总体 1/16 (6%)

**当前阶段**：第三阶段（模块化开发）— M1 完成，待进入 M2 配置管理

---

## 详细日志（按时间追加）

### 2026-07-21 ｜ 第一阶段 ｜ 需求澄清 + 蓝图启动
- 旧版 Python 实现（main.py / server.py / tray.py / panels/）作为参照，决定 Electron 全量重写

### 2026-07-22 ｜ 第一阶段 ｜ 蓝图产出
- REQUIREMENTS v2.0 / DESIGN v3.0 / TASKS v2.0 初版完成

### 2026-07-23 ｜ 第一阶段 ｜ 蓝图审查（REVIEW.md）
- 产出 docs/REVIEW.md，列 13 项问题（P0×4 / P1×6 / P2×3）

### 2026-07-23 ｜ 第一阶段 ｜ REVIEW 整改（DESIGN v3.1 / REQUIREMENTS v2.1 / TASKS v2.1）
- #1 新增 §6.12 共享类型定义（SessionInfo/UsageRecord/BalanceInfo/Approval* 等 TS interface）
- #2 新增 §6.13 approve.sh 设计（hook JSON schema、curl 超时、exit code）
- #3 窗口尺寸以设计资料为准 → 340×80vh(max650)、圆角 16px（**未按 review 建议的 900×680**）
- #4 §6.7 补回 DeepSeek 响应结构与字段映射
- #5 新增 §2.10 Linux 平台适配
- #7 §6.5 端口冲突处理（EADDRINUSE）
- #8 §5.2 扫描方式统一为 fs.readdir
- #9 §6.8.1 config_dirs 改读自身 config.yaml
- #10 §9.6 补 approve.sh 测试用例
- #11 FR-1.x 重编号（级联 REQUIREMENTS/DESIGN/config/TASKS）
- #12 审批 id = crypto.randomUUID()
- #13 卡片配色注明

### 2026-07-23 ｜ 关键决策 ｜ UI 基准原型定为 harness_monitor.html
- 340px 悬浮挂件（无侧边栏、分段导航、浅色毛玻璃）
- 弃用侧边栏全窗原型 AppPrototype.jsx；DESIGN §2/§4/§3 全面对齐
- 卡片底色定为半透明 rgba(255,255,255,0.55)（与 Design Spec 一致）

### 2026-07-23 ｜ 关键决策 ｜ ctx% 估算改用 usage token
- 取 transcript 末条 assistant 消息 usage（input+cache_read+cache_creation）÷ 上下文窗口
- 与 Claude Code 终端底部上下文指示条同源；弃用"行数 × 5"

### 2026-07-23 ｜ 关键决策 ｜ approve.sh exit code
- 遵循 Claude Code PreToolUse hook 规范：0=放行 / 2=拦截（非朴素 0/1/2，exit 1 无法真正拦截）

### 2026-07-23 ｜ 清理 ｜ 移除弃用原型
- AppPrototype.jsx、appprototype.js、prototype-preview/ 已移出仓库（trash，可恢复）

### 2026-07-23 ｜ 工作流 ｜ 引入进度日志
- CLAUDE.md 工作流新增「贯穿全程：进度日志」，本文件即其落地

### 2026-07-23 ｜ 第三阶段 ｜ M1 开始
- 注入上下文：REQUIREMENTS v2.1 / DESIGN v3.1 / TASKS v2.1（§2 M1 + §3 目录结构 + §2.2 主题 + §18 开发约束）
- 范围：Electron + electron-vite + React + TS + Tailwind 项目骨架，最小窗口 + 浅色毛玻璃背景
- 派发：开发+测试合并 subagent

### 2026-07-24 ｜ M1 ｜ 阻塞：网络
- npm install dev deps 时 ECONNRESET（疑似 electron 二进制从 GitHub 下载被重置），subagent 被停止
- 处置：恢复原 subagent，指示先配代理（127.0.0.1:7897）+ electron 淘宝镜像 / registry 换源后重试

### 2026-07-24 ｜ M1 ｜ 开发完成（commit 4e30d2f）
- 依赖：electron 32.3.3 / electron-vite 2.3.0 / react 19.2.8 / tailwindcss 3.4.19 / better-sqlite3 11.10.0（native 编译 OK）/ typescript 5.9.3
- 验证：npm run build 三入口零错误 + tsc strict 双 project 通过；真实启动（DISPLAY=:0）+ 截图确认 "Hello harness-monitor" + 浅色毛玻璃卡片（/tmp/hm_window.png）
- 解决的关键问题：@vitejs/plugin-react 锁 v4（v6 需 vite 8 与 electron-vite2 冲突）；chrome-sandbox SUID 4755（sudo chown/chmod，未入代码，建议 M15 postinstall 固化）；dev GPU 崩溃 → 构建产物 --disable-gpu 验证
- DESIGN 偏差（均注明原因）：renderer 文件直接放 src/renderer/（非 electron-vite 惯例的 src/renderer/src/），按"冲突以 DESIGN 为准"执行；electron-builder.yml 仅占位（M15 完善）
- 未提交项：.npmrc（本机代理配置，已 gitignore）

### 2026-07-24 ｜ M1 ｜ Code Review（有条件通过）
- 审查方：独立 subagent（sonnet 交叉验证），实测复现 build + dev 启动
- 任务完整性 14/14 ✅；设计符合度：§2.2 CSS 变量 18/18 逐值一致、§8.1 config 逐字段一致、§3 目录一致
- 【P1 应修】package.json：autoprefixer/electron/electron-vite/postcss/tailwindcss/typescript 6 个构建期包误放 dependencies（会污染 M15 打包产物）→ 移入 devDependencies
- 【P2 顺修】preload 占位名 'api' → 'electronAPI'（对齐 DESIGN §7）；globals.css 滚动条移入 @layer base
- 【P2 延后】sandbox:false 决策 → M9；CSP meta → M4/M10；electron.vite externalizeDeps → **M3 引入 better-sqlite3 前必加**（否则 native .node 被 vite 打包损坏）
- 【观察】docs/ 蓝图与基准原型 html 尚未入库 → 主对话补 docs commit
- 处置：派发修复（P1+P2 顺修项），复验后 M1 关闭

### 2026-07-24 ｜ M1 ｜ review 整改完成（commit 5783a5d），M1 关闭
- P1：6 个构建期依赖移入 devDependencies（dependencies 仅剩 better-sqlite3/express/react/react-dom/recharts/yaml），lockfile 刷新
- P2：preload 占位名 → electronAPI；滚动条 → @layer base
- 复验：npm install + npm run build 零错误（三入口 + 双 typecheck）
- 遗留决策（已排期）：sandbox→M9 / CSP→M4-M10 / externalizeDeps→M3 前必加 / chrome-sandbox SUID→M15 postinstall

### 2026-07-24 ｜ 文档 ｜ 蓝图入库
- docs/（REQUIREMENTS/DESIGN/TASKS/PROGRESS/REVIEW/plan）+ 基准原型 harness_monitor.html + 设计资料两份 txt 提交入库（审查基准需版本化）

### 2026-07-27 ｜ 第三阶段 ｜ M2 开始
- 注入上下文：TASKS §3（M2 任务 + 验收）/ DESIGN §6.1（search paths + AppConfig 类型）/ §8.1-8.2（schema + 加载策略）
- 范围：src/main/config.ts — loadConfig 多路径优先级 + deepMerge + saveConfig + AppConfig 类型化
- 派发：开发+测试合并 subagent（续用 M1 agent，环境上下文复用）

### 2026-07-27 ｜ M2 ｜ 开发完成（commit 9a277be）
- 产出：src/main/config.ts（loadConfig/saveConfig/deepMerge/DeepPartial）+ src/shared/types.ts（AppConfig 及子接口，对齐 §6.1/§8.1）+ electron.vite.config.ts 多入口（out/main/config.js 独立产出供裸 node 验收）
- 验收：默认 port=18456 ✅；用户覆盖 port=9999 ✅；saveConfig 深合并写回（HOME=/tmp 隔离测试）✅；数组整体替换 ✅；npm run dev 多入口下窗口正常 ✅
- 蓝图缺陷发现并修正：DESIGN §8.2 合并顺序与 §6.1 优先级表矛盾（compat 会覆盖主配置）→ 实现遵循 §6.1+TASKS §3（正确），主对话已出 §8.2 v3.1.1 勘误
- 中途网关 502 两次（无工作丢失，重试恢复）

### 2026-07-27 ｜ M2 ｜ Code Review 通过（无 P0/P1）
- 审查方实测全过：优先级双文件（harness 胜 compat、compat 独有键保留）✅、--config 最高优先 ✅、deepMerge 不 mutate + 数组整体替换 ✅、损坏/非对象/无权限 YAML 降级不抛 ✅、saveConfig 目录自建 + 仅写覆盖 key ✅、裸 node require ✅、strict 无 any 逃逸 ✅
- AppConfig 与 §6.1 逐项比对全一致（含 'claude-code' 连字符 key）
- P2 处置：
  - 随 M3 顺修：saveConfig 原子写（temp+rename）；--config 重复 first-wins 注释；deepMerge 死代码清理
  - 延后：save 成功标志 → M13 一并设计；路径 import 期常量（记录备查）；写入权限收紧（config 引入 token 字段时）
- 文档修正：TASKS §3 验收命令 echo→printf（bash echo 不展开 \n）

### 2026-07-27 ｜ 第三阶段 ｜ M3 开始
- 注入上下文：TASKS §4（M3 任务 + 验收）/ DESIGN §6.2（Schema + DAO 方法表）
- 范围：src/main/db.ts — AppDatabase 类（initDB 建表 + WAL / recordUsage / getLatestUsage / get30DayUsage / recordApproval / getRecentApprovals / close）
- 前置必做：electron.vite.config main 构建加 externalizeDeps（better-sqlite3 native .node 不可被 vite 打包，M1 review 遗留项）
- 派发：开发+测试合并 subagent（先 fix(M2) P2 小修独立 commit，再 feat(M3)）

---

**下一步**：M3 开发中。完成后独立 Code Review，通过后进 M4 系统托盘 + 窗口管理。
