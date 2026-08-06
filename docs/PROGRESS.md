# harness-monitor — 开发进度日志

> 项目：harness-monitor（Electron 桌面托盘应用） | 启动：2026-07-21 | 蓝图：REQUIREMENTS **v2.2** / DESIGN **v3.2** / TASKS **v2.3**（2026-07-27 链路合并 + 蓝图裁剪，16→11 模块）

## 状态总览

| 模块 | 优先级 | 状态 | 单测 | Code Review | 完成时间 | 备注 |
|------|--------|------|------|-------------|---------|------|
| M1 项目骨骼 | P0 | ✅ 完成 | 通过 | 通过 | 2026-07-24 01:08 | commit 4e30d2f + 5783a5d（review 整改） |
| M2 配置管理 | P0 | ✅ 完成 | 通过 | 通过 | 2026-07-27 12:46 | commit 9a277be；P2 小修随 M3 提交 |
| M3 数据库 | P0 | ✅ 完成 | 通过 | 通过 | 2026-07-27 14:11 | commit 54b20d0 + b5908e4；**v2.3 schema 返工见下条** |
| M3r Schema 精简返工 | P0 | ✅ 完成 | 通过 | 通过(轻量) | 2026-07-27 15:34 | commit a1a7f82；主对话 diff 审查 |
| M4 系统托盘 + 窗口管理 | P0 | ✅ 完成 | 通过 | 通过(批量) | 2026-07-28 09:16 | commit 681d23a；PNG 图标（SVG 不可行，蓝图已更正）；3 项 GUI 确认待用户 |
| M5 HTTP Server + 审批队列 + 审批联动 | P0 | ✅ 完成 | 通过 | 通过(批量) | 2026-07-28 14:58 | commit eee9196；橙绿联动 IconPixmap 实测；electron-rebuild（见日志） |
| M6 数据服务 + 调度 + 余额联动 | P0 | ✅ 完成 | 通过 | 通过(批量) | 2026-07-28 15:49 | commit eb2361e；ctxPct 与 statusline.py 3/3 一致；/proc rss field 24（蓝图已勘误） |
| M7 IPC + 挂件壳 | P0 | ✅ 完成 | 通过 | 通过(批量) | 2026-07-29 15:38 | commit ab25b3e；14 IPC 1:1 / 毛玻璃挂件壳 / 分段导航 / CSP meta / sandbox 决策 |
| M8 用量视图 | P0 | ✅ 完成 | 通过 | 通过(批量) | 2026-07-29 17:52 | commit 690bd24；余额卡 + TrendSparkline 原生 SVG + 删 recharts；GUI 实测（¥10.77 / 低余额红字 / 30 点折线 hover）；曾停滞经 SendMessage 恢复 |
| M9 Sessions 视图 | P0 | ✅ 完成 | 通过 | 通过(批量) | 2026-07-29 16:09 | commit 2c0b99a；SessionCard/ApprovalBlock/ApprovalHistory + 状态灯；GUI 延后并入批量审；globals.css 提交含 M8 段（归属串，无碍） |
| M10 设置视图 | P1 | ✅ 完成 | 通过 | 通过(批量) | 2026-07-29 17:33 | commit a722e3b；saveConfig 抛出 + 重调度 / General+Limits / Quit；GUI 全项实测通过 |
| M11 端到端测试 + approve.sh | P0 | ✅ 完成 | 通过(42项) | E2E 即验收 | 2026-07-30 17:57 | approve.sh d4264c6；E2E 42 项通过/0 失败/4 肉眼项用户确认 |
| M12 审批镜像轮（归档后修订） | P0 | ✅ 完成 | 通过(41+36项) | 通过(diff复核×3) | 2026-08-06 01:01 | commits 70f391a+0a6cff7+98308da；E2E 双向保真全项 + F1-F4 GUI 遗留核销 |

**延后项**（主体功能验收后另评估，见 TASKS §13）：D1 打包 + 开机自启 + chrome-sandbox SUID ｜ D2 终端并行审批 ｜ D3 审批超时配置

**阶段进度**：Phase 1 基础设施 4/4 ✅ ｜ Phase 2 后端 2/2 ✅ ｜ Phase 3 前端 4/4 ✅ ｜ Phase 4 集成 1/1 ✅ ｜ 总体 11/11 (100%) 🎉

**当前阶段**：**项目归档完成（11/11 + 第五阶段总结）** — 全流程五阶段走完；RETROSPECTIVE.md 产出 + 工作流整改已入 ~/CLAUDE.md；后续仅延后项 D1+D3 另评估（D2 缓）
**归档后修订**：
- 2026-07-31 上午 session 显示名修复（3b0693e，transcript 首条用户消息优先）
- 2026-07-31 下午 会话卡片 6 项反馈修复轮（cdf4130 + a0086b0 + hook 注册）——详见日志末条
- 2026-07-31 傍晚 Sessions/审批四项体验增强轮（ee9f436：审批描述 / 卡片最近任务 / 自动审批开关 / 动效提速）——详见日志末条
- 2026-08-03 凌晨 审批镜像轮启动（M12：工具审批面 ≡ 终端询问面；早先"hook 权限 JSON 全被忽略"结论被复原弹窗污染，01:26 零干扰实测翻转 → Plan A「批准 = 输出权限 JSON」）——详见日志末二条
- 2026-08-06 凌晨 审批镜像轮完成（M12：E2E 全项通过——静默/询问/非 Bash/deny/F3/历史 tool 列；期间发现并修复 2 项 P2：镜像默认表元工具 + 历史 tool 列；F1-F4 GUI 遗留全核销）——详见日志末条
- 2026-08-06 凌晨 heredoc 过度镜像修复（43cb535）→ **实测后回滚**（f0f3c02：终端对 heredoc 实际会弹询，该"修复"是漏审回归）——详见日志末条

---

## 详细日志（按时间追加）

### 2026-07-21 ｜ 第一阶段 ｜ 需求澄清 + 蓝图启动
- 旧版 Python 实现（main.py / server.py / tray.py / panels/）作为参照，决定 Electron 全量重写

### 2026-07-22 17:08:31 ｜ 第一阶段 ｜ 蓝图产出
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

### 2026-07-24 00:44:25 ｜ M1 ｜ 开发完成（commit 4e30d2f）
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

### 2026-07-24 01:08:29 ｜ M1 ｜ review 整改完成（commit 5783a5d），M1 关闭
- P1：6 个构建期依赖移入 devDependencies（dependencies 仅剩 better-sqlite3/express/react/react-dom/recharts/yaml），lockfile 刷新
- P2：preload 占位名 → electronAPI；滚动条 → @layer base
- 复验：npm install + npm run build 零错误（三入口 + 双 typecheck）
- 遗留决策（已排期）：sandbox→M9 / CSP→M4-M10 / externalizeDeps→M3 前必加 / chrome-sandbox SUID→M15 postinstall

### 2026-07-24 01:09:24 ｜ 文档 ｜ 蓝图入库
- docs/（REQUIREMENTS/DESIGN/TASKS/PROGRESS/REVIEW/plan）+ 基准原型 harness_monitor.html + 设计资料两份 txt 提交入库（审查基准需版本化）

### 2026-07-27 ｜ 第三阶段 ｜ M2 开始
- 注入上下文：TASKS §3（M2 任务 + 验收）/ DESIGN §6.1（search paths + AppConfig 类型）/ §8.1-8.2（schema + 加载策略）
- 范围：src/main/config.ts — loadConfig 多路径优先级 + deepMerge + saveConfig + AppConfig 类型化
- 派发：开发+测试合并 subagent（续用 M1 agent，环境上下文复用）

### 2026-07-27 12:46:58 ｜ M2 ｜ 开发完成（commit 9a277be）
- 产出：src/main/config.ts（loadConfig/saveConfig/deepMerge/DeepPartial）+ src/shared/types.ts（AppConfig 及子接口，对齐 §6.1/§8.1）+ electron.vite.config.ts 多入口（out/main/config.js 独立产出供裸 node 验收）
- 验收：默认 port=18456 ✅；用户覆盖 port=9999 ✅；saveConfig 深合并写回（HOME=/tmp 隔离测试）✅；数组整体替换 ✅；npm run dev 多入口下窗口正常 ✅
- 蓝图缺陷发现并修正：DESIGN §8.2 合并顺序与 §6.1 优先级表矛盾（compat 会覆盖主配置）→ 实现遵循 §6.1+TASKS §3（正确），主对话已出 §8.2 v3.1.1 勘误
- 中途网关 502 两次（无工作丢失，重试恢复）

### 2026-07-27 12:59:48 ｜ M2 ｜ Code Review 通过（无 P0/P1）
- 审查方实测全过：优先级双文件（harness 胜 compat、compat 独有键保留）✅、--config 最高优先 ✅、deepMerge 不 mutate + 数组整体替换 ✅、损坏/非对象/无权限 YAML 降级不抛 ✅、saveConfig 目录自建 + 仅写覆盖 key ✅、裸 node require ✅、strict 无 any 逃逸 ✅
- AppConfig 与 §6.1 逐项比对全一致（含 'claude-code' 连字符 key）
- P2 处置：
  - 随 M3 顺修：saveConfig 原子写（temp+rename）；--config 重复 first-wins 注释；deepMerge 死代码清理
  - 延后：save 成功标志 → M13 一并设计；路径 import 期常量（记录备查）；写入权限收紧（config 引入 token 字段时）
- 文档修正：TASKS §3 验收命令 echo→printf（bash echo 不展开 \n）

### 2026-07-27 13:40:21 ｜ M3 ｜ 开发完成（commit abdc604 + 54b20d0）
- fix(M2) abdc604：saveConfig 原子写（tmp+rename）+ deepMerge 死代码清理
- feat(M3) 54b20d0：src/main/db.ts AppDatabase（WAL + 建表幂等 + 5 DAO + close）；shared/types.ts 增 UsageRecord/ApprovalRecord（§6.12 映射）；electron.vite.config 加 externalizeDepsPlugin + db 入口
- 验收：TASKS §4 node 脚本全通过（两表读写、多 provider/model MAX(id) 分组正确、get30DayUsage 当日聚合、WAL 双重证明、initDB 幂等）；M2 回归从项目根通过（config.js 226kB→4.07kB）；npm run dev 三入口窗口正常
- 偏差（均注明）：IF NOT EXISTS 幂等（结构同 §6.2）；DAO 返回 camelCase 共享类型（§6.12 映射）；裸 node 路径守卫回退 ~/.config/harness-monitor/monitor.db
- 遗留：UsageDailyAggregate 暂随 db.ts 导出，M11 需要时迁入 shared

### 2026-07-27 ｜ M3 ｜ Code Review 通过（无 P0/P1）
- 实测全过：验收复现 ✅、多组 MAX(id) 各自取最新 ✅、注入防御（DROP TABLE 字面量化）✅、WAL ✅、30 天聚合 SUM/窗口/隔离 ✅、close 幂等 + 优雅降级 ✅、externalize 裸 require ✅、§6.2 逐字对齐 ✅、§6.12 类型映射一致 ✅
- 肯定项：getLatestUsage 用子查询主动规避 §6.2 伪代码的 SQLite 裸列陷阱，比设计更严谨
- P2 处置：
  - 随 M4 顺修：getRecentApprovals 同秒排序（ORDER BY timestamp DESC, id DESC）；DAO prepared statement 复用；config tmp 文件名加随机后缀
  - 【时区专项·定级 P2 但有时限】datetime('now') UTC 存储 → UTC+8 凌晨 0-8 点数据按天聚合归"昨天"；v3.0 today_tokens 恒 0 故无可观测影响；**M9/M11 上线前必须解决**（含 §6.12 时间戳无时区标识、渲染端 new Date 误读问题）。修复方向待定：(a) 全链路 localtime（单机工具最简）(b) epoch 存储。决策点在 M9
- 遗留：UsageDailyAggregate 暂随 db.ts 导出，M11 需要时迁入 shared

### 2026-07-27 14:11:41 ｜ M3 ｜ P2 小修完成（commit b5908e4）
- getRecentApprovals 同秒 tie-break（ORDER BY timestamp DESC, id DESC，实测同秒 3 条取最新 2 条 ✅）
- 5 条 DAO 语句惰性 prepare 私有字段复用（高频轮询不再每次重编译）
- config 原子写 tmp 文件名随机后缀 + 双路径清理残留（实测无 .tmp 残留）
- 回归：M2 验收两条 + M3 验收 + npm run build 全绿
- 注：应用户要求小修独立先行，M4 待确认后启动

### 2026-07-27 ｜ 第三阶段 ｜ M4 准备就绪，待确认启动
- 注入上下文：TASKS §5（M4 任务 1-3 + 验收）/ DESIGN §6.3（托盘颜色状态机 + 菜单结构）/ §6.4（BrowserWindow 配置）/ §2.9-2.10（窗口尺寸 + Linux 适配）/ §7（preload API 约定）
- 范围：tray.ts（SVG 图标 + 颜色状态机 + 右键菜单 + 左键 toggle）/ window.ts（frame:false 340×650 圆角 + blur 隐藏 + pin）/ index.ts 整合（单实例锁 + 生命周期）
- 环境注意：GNOME 无原生托盘，需 appindicator 扩展（sudo 免密可装）
- 状态：首次派发被用户叫停（确立「阶段推进确认门」）；fix(M3) 已独立先行完成；M4 派发任务书已拟好，待用户确认后执行

### 2026-07-27 ｜ 工作流 ｜ 链路合并 16→12（TASKS v2.2）
- 背景：用户指出开发链路过长（16 模块 ×「确认→派发→开发测试→review→回写」固定开销），要求缩短；主对话提出三档合并方案，用户选定「适度合并」
- 合并规则：
  - 旧 M6+M7+M8 → **新 M6 数据服务 + 调度**（DeepSeek / Session 扫描是调度的两个输入，services.ts 天然同文件，3.5h）
  - 旧 M9+M10 → **新 M7 IPC + 挂件壳**（IPC 是 M3~M6 的薄封装，壳完成即消费 IPC 方法，合并保持上下文连续，3.5h）
  - 旧 M14 拆散：审批侧（notifyApproval + 橙/绿切换）→ 新 M5；余额侧（notifyBalanceLow + 红/绿切换）→ 新 M6。notifications.ts 工具模块在 M5 创建（两方法都实现，notifyBalanceLow 由 M6 调用）。颜色优先级协议（红>橙>绿）在 M5 定义、M6 遵循——联动逻辑与产生它的业务同时写，消除回补轮次
  - approve.sh 开发任务在 **新 M12** 明确落位（旧蓝图仅验收清单提及、无任务条目，属蓝图缺口，本次补上）
  - 其余仅重编号：旧 M5/M11/M12/M13/M15/M16 → 新 M5/M8/M9/M10/M11/M12
- 遗留项重映射（TASKS v2.2 §1 登记表）：
  - 时区修复（M3 时限 P2，原"M9/M11 上线前"）→ **新 M7 决策并修复**（M8/M9 渲染时间前必须完成）
  - UsageDailyAggregate 迁入 shared（M3 遗留）→ 新 M8
  - saveConfig 成功反馈设计（M2 延后）→ 新 M10
  - chrome-sandbox SUID 固化（M1 遗留）→ 新 M11
  - sandbox:false 决策 + CSP meta（M1 延后）→ 新 M7
- 效果：剩余 13 模块 → 9 模块，少 4 轮完整流程；总工时 ~23.5h 不变（只减流程开销，不减开发内容）
- 编号说明：本日志此条之前的"M5~M16"字样均为旧编号，新旧对照见上及 TASKS v2.2 §1
- M4 编号与内容不变，任务书（2026-07-27 拟）继续有效

### 2026-07-27 15:11:09 ｜ 工作流 ｜ 蓝图裁剪（REQUIREMENTS v2.2 / DESIGN v3.2 / TASKS v2.3）
- 背景：用户指出合并后开发测试时间仍然太长（"本来功能也不复杂"），要求主对话自评蓝图复杂度。评估结论：核心功能复杂度合理，蓝图膨胀在三层——假功能 / 想象的规模 / 仪式感流程
- 裁剪（用户逐项过目确认，8 项）：
  - 砍统计卡今日 token / 本月用量 / 千 token 均价（DeepSeek API 不返回 token 消耗，原数据只能是 0 或估算假值）
  - 砍余额百分比进度条（API 不返回总预算，无分母）
  - 告警阈值比例 15% → ¥ 绝对金额（默认 10）
  - 端口冲突 port+1..+10 重试 + server.port 文件协议 → 占用即提示退出，approve.sh 固定端口
  - cmux/tmux 终端适配器链 → 只留 kgx → gnome-terminal → xterm
  - 多 profile 五路自动发现 → 只扫 config_dirs 列表
  - CPU 阈值 busy/idle + 进程树遍历 → 进程存活判定
  - NFR-1 数值型性能指标删除
- 保留：余额卡 + 低余额警示；30 天**余额**趋势线（真实快照数据，原生 SVG，删 recharts）；Session 监控全套（ctx% usage token 估算保留）；审批全链路；托盘三色灯 + 通知 + 设置页
- 延后项登记（TASKS §13）：D1 打包 + 开机自启 + chrome-sandbox SUID ／ D2 终端并行审批 ／ D3 审批超时配置。旧 M11 打包模块删除，链路 12→11
- 技术简化：时间戳统一 `datetime('now','localtime')`——M3 时区时限 P2 直接在 M3 schema 返工解决，M7 不再设决策点；DESIGN §11 abtop 对照（~100 行）压缩为参考说明（1328→1221 行）
- 文档改版：REQUIREMENTS v2.2（FR-1.2/1.3/1.4 重写，FR-3.9/5.4/6.6→延后）／ DESIGN v3.2 ／ TASKS v2.3（11 模块 + M3r 返工任务 + 延后项 §13）
- 效果：剩余模块 9→8 个（M4~M11），估时 ~17.5h；参照 M2/M3 实际各 ~1h 完成 + 裁剪后前后端均减负，实际历时预计显著低于估时

### 2026-07-27 ｜ M3r ｜ Schema 精简返工 开始
- 范围：db.ts 删 today_tokens/month_used/total_budget 三列 + recordUsage(4 参) + get30DayUsage→get30DayBalance（按日取余额快照）+ 两表 timestamp 改 localtime；shared/types.ts 精简 UsageRecord/BalanceInfo + UsageDailyAggregate→BalanceDailySnapshot 迁入 shared + AppConfig 删 autostart；config.yaml 删 autostart 段 + 阈值改 10
- 验收：TASKS §4 v2.3 验收脚本 + M2 回归（port=18456）+ npm run build
- 处置：~/.config/harness-monitor/monitor.db 为开发期旧 schema，无真实数据，直接删重建
- 派发：独立 subagent（新会话，/clear 后旧 agent 已不可续）；变更小，完成后走轻量审查

### 2026-07-27 15:34:22 ｜ M3r ｜ 完成（commit a1a7f82）
- 产出：db.ts 删三列 + localtime（两表）+ recordUsage(4 参) + get30DayBalance（每日 MAX(id) 余额快照，WHERE id IN 子查询沿用 getLatestUsage 风格）；types.ts 精简 UsageRecord / 新增 BalanceInfo + BalanceDailySnapshot / 删 AutostartConfig；config.ts DEFAULT_CONFIG 联动（阈值 10、删 autostart）；config.yaml 同步
- 偏差（均合理）：get30DayBalance 30 天窗口改 `date('now','localtime','-30 days')`（与 localtime 存储基准一致，避免 UTC+8 凌晨跨日错位，代码已注释）；config.ts 随类型联动修改（typecheck 必然要求）
- 验收：npm run build 三入口零错误 + 双 typecheck ✅；DB 全项 ✅（timestamp 实测本地时间 15:33 ≠ UTC 07:33，WAL ✅，同双快照取当日最后一条 ✅）；M2 回归 ✅（port=18456、无 autostart、阈值 10）；全仓 grep 删净字段零残留 ✅
- 审查：主对话 diff 轻量审查通过（高速模式下小返工不单开 review agent）

### 2026-07-27 ｜ 工作流 ｜ 高速模式启用
- 用户选定高速推进档：确认门取消、每模块完成即报告（随时可打断）、Code Review 两轮（后端 M4+M5+M6 完成后全量审 / 前端 M7~M10 完成后全量审）
- 记忆条目 stage-gate-confirmation 已改写（旧逐模块确认门作废，保留历史背景）

### 2026-07-27 ｜ 第三阶段 ｜ M4 开始
- 注入上下文：TASKS §5（M4 任务 + 验收）/ DESIGN §6.3（托盘颜色状态机 + 菜单）/ §6.4（BrowserWindow 配置）/ §2.9-2.10（窗口尺寸 + Linux 适配）
- 范围：tray.ts（SVG 图标 + 四色状态机 + 右键菜单（含动态 Active Agents，session 快照注入口留桩）+ 左键 toggle）/ window.ts（frame:false 340×650 圆角 + blur 隐藏 + pin）/ index.ts（单实例锁 + 生命周期）+ 最小窗口控制 IPC（红绿灯/置顶，全量 IPC 归 M7）
- 验证约定：M4 只做主进程，红绿灯/置顶行为经 DevTools console 调 electronAPI 验证，GUI 按钮 M7 接线后复验
- 环境：GNOME 托盘需 appindicator 扩展；已指示 subagent 不重启 gnome-shell / 不注销用户，受阻则报告待用户协助
- 派发：开发+测试合并 subagent（高速模式首轮，M3r 完成后直接续进，未经确认门）

### 2026-07-28 09:16:51 ｜ M4 ｜ 完成（commit 681d23a）
- 产出：tray.ts（四色 PNG 图标 + 右键动态菜单 + setSessionSnapshot 注入口 + 左键 toggle）/ window.ts（340×650 frame:false + blur→hide + pin 豁免 + close→hide）/ index.ts 重写（单实例锁 + 生命周期 + SIGTERM/SIGINT + 4 条窗口控制 IPC）/ preload 最小 electronAPI
- 验证全绿：xwininfo 340×650 ✅；托盘 SNI 注册 Status=Active、IconPixmap (22,22) 非空 ✅（扩展 ubuntu-appindicators 已 ACTIVE，无需用户装扩展）；IPC 四项经 CDP 实测（pin→_NET_WM_STATE_ABOVE / maximize / minimize→Iconic / hide→Withdrawn）✅；blur→hide 真实焦点回收实测 + pin 豁免 ✅；close 不 quit ✅；单实例第二进程 exit 0 ✅；SIGTERM exit 0 无残留 ✅；截图 /tmp/hm_m4_renderer.png
- 偏差与蓝图更正：
  - 【蓝图级】**SVG data URL 图标不可行**——Electron nativeImage 不光栅化 SVG（Chromium 位图解码器不含 SVG），实测 IconPixmap 空图；改程序化 PNG 编码（zlib+CRC32，四色 hex 不变）。DESIGN §6.3 / TASKS §5 已更正
  - blur 500ms 宽限期（GNOME Wayland show→focus→焦点弹回序列防抖，已注释）
  - HM_DEBUG_SHOW=1 调试逃生舱（默认关闭，保留）
- 待用户 GUI 确认 3 项（Wayland 无法无头自动化）：① 顶栏绿点右键菜单弹出与内容 ② 左键 toggle（appindicator 下 click 事件常不触发，§2.10 已知降级，若确不复现则 M11 前定回退方案）③ 圆点颜色肉眼确认
- 交接：Preferences 菜单项 M10 接 Settings；颜色切换 M5/M6 经 setIconColor；session 列表 M6 经 setSessionSnapshot

### 2026-07-28 ｜ 第三阶段 ｜ M5 开始
- 注入上下文：TASKS §6（M5 任务 + 验收）/ DESIGN §6.5（server + EADDRINUSE 简化版）/ §6.6（approval-queue + UUID）/ §6.10（notifications）/ §5.3（审批全流程）/ §6.12（类型）/ §6.3（颜色状态机与优先级）
- 范围：approval-queue.ts / notifications.ts / server.ts（六路由 + 审批侧橙绿联动 + 端口占用即退）/ index.ts 接线（db 生命周期 + server 启停）；颜色优先级协议（红>橙>绿）落代码注释
- 验证手段：curl 全流程 + D-Bus StatusNotifierItem IconPixmap 像素色验证橙→绿 + dbus-monitor 捕获桌面通知 + 临时改 approve_timeout_sec 测自动 deny（验完恢复）
- 派发：开发+测试合并 subagent（高速模式，M4 完成直接续进）

### 2026-07-28 14:58:56 ｜ M5 ｜ 完成（commit eee9196）
- 产出：approval-queue.ts（UUID + auto-deny）/ notifications.ts（两通知 + 开关 + 点击唤起）/ server.ts（六路由 + computeTrayColor 优先级协议导出 + EADDRINUSE 简化版）/ index.ts 接线（db 生命周期 + server 启停 + 后端失败灰灯 exit 1）/ shared 补 Approval* + Session* 类型
- 验证全绿：health/sessions/approvals/usage ✅；阻塞审批全流程——dbus 抓到 Notify、**IconPixmap 取色橙 #ffab00 → respond 13ms 返回 → 回绿 #00e576**（像素级实测联动）✅；自动 deny（临时 timeout=3s）3.04s 返回 allowed:false ✅；端口占用 exit 1 + 旧实例探测 exit 0 ✅；单实例 + SIGTERM 回归 ✅
- 偏差与蓝图更正：
  - 【环境级】better-sqlite3 经 electron-rebuild 重建为 Electron ABI（127→128，M5 首个进程内载 db 模块触发）——**裸 node require db 的验收方式自此失效**，db 相关验证走运行中应用 / sqlite3 CLI；TASKS §4 已加注记，D1 打包需 postinstall 固化
  - 【蓝图级】recordApproval 落库点从 respond 分支移至 POST /approve 的 promise 恢复处（单一落库点，覆盖超时 auto-deny 路径，否则超时审批漏记历史）——DESIGN §5.3 已勘误
  - refreshTrayColor() 收敛颜色联动（严格红>橙>绿，比字面置橙正确）
- 交接：getSessions 注入口缺省 []（M6 接）；approval:pending/resolved push 已接（M7 监听）
- 环境杂项：端口 5173 有旧 prototype-preview 遗留 python http.server（非本项目产生，未动，建议用户自行 kill）

### 2026-07-28 ｜ 第三阶段 ｜ M6 开始
- 注入上下文：TASKS §7（M6 任务 + 验收 + 裸 node 约定）/ DESIGN §6.7（DeepSeek 字段映射）/ §6.8（扫描流程，§6.8.2e ctxPct 与 statusline.py 同源）/ §6.9（调度）/ §6.3（颜色状态机）；另附 ~/.claude/statusline.py 作为 ctxPct 算法真源对照
- 范围：deepseek.ts（checkBalance → BalanceInfo|null）/ claude-sessions.ts（简化扫描器：进程存活判定 + VmRSS + provider 解析 + ctxPct usage token 估算 + 审批合并）/ services.ts（双定时器 + {stop()} + 余额侧联动复用 server.ts computeTrayColor）/ index.ts 接线（getSessions 注入 + setSessionSnapshot 同步）
- 验收亮点：本机有真实 claude sessions（含本开发会话），用真实数据验收 ctxPct/memoryMB；无 DEEPSEEK_API_KEY 时 mock balance 端点验证解析
- 派发：开发+测试合并 subagent（高速模式续进）；**M6 完成后触发后端批量 Code Review（M4+M5+M6）**，再起常驻实例交用户试玩（承诺顺延：带真实余额+会话数据的实例比裸 M5 更值得玩）

### 2026-07-28 15:49:09 ｜ M6 ｜ 完成（commit eb2361e）
- 产出：deepseek.ts（checkBalance，全失败态→null）/ claude-sessions.ts（简化扫描器 328 行：进程存活判定 + /proc 内存 + provider 解析 + ctxPct + 审批合并 + 缓存）/ services.ts（双定时器 + 余额联动复用 computeTrayColor + 低余额通知去抖）/ index.ts 接线 / electron.vite.config 加深seek+claude-sessions 独立入口（裸 node 验收）
- 验证全绿：
  - **ctxPct 与 statusline.py 逐字同源对照：本机 3 个真实 session 3/3 MATCH**（8% / 21% / 5%，1M 窗口判定一致），内存与 VmRSS 逐字节一致（411/575/500 MB）
  - DeepSeek 解析 5 态（good/unavail/500/no-key/timeout 精确 15s）✅（无真实 key，mock 端点验证）
  - 调度：启动即首轮 push，uptimeSec delta=3.0s 证实 3s 轮询；余额告警 tray 红 #ff5252 + Notify 抓到 + 去抖仅弹一次；**红>橙优先级实测**（挂审批仍红，清队列仍红，恢复阈值→绿）；M5 橙绿回归 ✅；单实例 + SIGTERM 零残留 ✅
- 偏差与蓝图更正：
  - 【蓝图级】/proc/{pid}/stat rss 为第 **24** 字段（DESIGN §6.8.2c 原写 22=starttime，实测荒谬值后查证 proc(5) 更正）；page_size 用 getconf PAGE_SIZE
  - refreshTrayColor 实为 server.ts 内部闭包，M6 复用导出的 computeTrayColor 纯函数 + setIconColor（两链路收敛同一优先级函数，意图一致）
  - DeepSeekBalanceResponse 类型置于 deepseek.ts 本地（§6.12 列在 shared；仅本模块线格式使用，交 review 裁定）
- 遗留：~/.config/harness-monitor/monitor.db 有 mock 测试数据（¥50 余额 + 2 条测试审批），真实运行后覆盖；transcript 全读 O(size) v1 可接受（已注释）；3 个真实会话 cwd 均 /home/cury → name 都显示 cury（basename 按 §6.8.2a，非会话标题）

### 2026-07-28 ｜ 后端批量 Code Review ｜ 派发（M4+M5+M6）
- 审查方：独立 subagent（sonnet 交叉验证，高速模式两轮审之一）
- 范围：commits 681d23a / eee9196 / eb2361e 全量 diff + DESIGN §2.9/§6.3~§6.11 符合度 + 实测复现（build + 审批流 + 托盘取色 + session 扫描）
- 已预披露偏差（蓝图已更正或意图一致，不重复计为问题）：PNG 图标 / recordApproval 单落库点 / electron-rebuild / /proc field 24 / computeTrayColor 复用方式
- 通过条件：无 P0/P1；P2 列表交主对话裁定（批量修或延后）

### 2026-07-28 ｜ 后端批量 Code Review ｜ 通过（无 P0/P1）
- 审查方：独立 subagent（sonnet 交叉验证）；实测复现全绿：build ✅、真实 session 3 条 ✅、审批全流程（respond 11.7ms / 超时 auto-deny 落库 allowed=0 **意外实测证实单落库点覆盖超时路径**）✅、并发审批竞态无重复落库 ✅、托盘像素取色 绿→橙→绿 ✅、死进程降级 ✅、单实例 ✅、SIGTERM 10 进程全退 + WAL checkpoint ✅、listen 绑 127.0.0.1（读码 + ss 双证）✅、field 24 独立交叉验证 ✅、ctxPct 与 statusline.py 逐行同源（不按 role 过滤）✅
- 肯定项：computeTrayColor 单一真源、recordApproval 单落库点、Promise 单次解析不变量、strict 全族零 any、isDestroyed 防御、偏差注释可追溯
- P2 裁定（全部修，派整改包）：
  - ① server.ts express 默认错误页泄露绝对路径（非法 JSON → HTML 栈）→ 注册 JSON 错误中间件
  - ② discoverSessions 全同步阻塞事件循环（transcript readFileSync 全读，3s 一轮）→ 改尾部 256KB 增量读
  - ③ 致命路径灰灯紧跟 exit(1) 不可观测 → 去置灰、纯退出 + 日志
- P3 裁定：④ app.exit→app.quit() 走 will-quit 清理（exitCode=1 保留）修；⑥ getLatestUsage 一轮双调 修；⑤ 退出瞬间 pending 审批漏记（弃审不记可接受）延后；⑦ 限流/IPC 校验（单用户回环）延后
- 灰色项裁定：DeepSeekBalanceResponse 维持本地（仅本模块线格式，收敛 shared 暴露面，reviewer 同议）
- 文档勘误：§6.8.2e / TASKS §7 / REQUIREMENTS FR-2.3 措辞"最后一条 assistant 消息"→"最后一条含 usage 的记录"（与 statusline.py 真源一致）

### 2026-07-28 ｜ 审查整改包 ｜ 派发
- 范围：P2×3（JSON 错误中间件 / transcript 尾部读 / 去死代码灰灯）+ P3×2（app.quit 清理链 / getLatestUsage 复用）
- 验收：build + ctxPct 3/3 复验（尾部读不改变结果）+ 审批流回归 + 非法 JSON → {"ok":false} 无路径泄露 + EADDRINUSE exitCode=1 + SIGTERM 回归
- 完成后：主对话 diff 轻量复核 → 起常驻实例交用户 → 派发 M7

### 2026-07-28 17:22:21 ｜ 审查整改包 ｜ 完成（commit bf5e90d）
- 5 项全修 + 验证绿：JSON 错误中间件（400 + 路径泄露计数 0）／ transcript 尾部 256KB 读（ctxPct 3/3 MATCH 不变 8/23/5 + 300KB 假文件 decoy 测试命中尾部 usage、忽略头部诱饵）／ 灰灯死代码删除 ／ 退出清理链（EADDRINUSE exitCode=1 实测）／ getLatestUsage 单轮复用
- 偏差（agent 发现）：Electron app.quit() 不保留 process.exitCode（最小复现证实）→ will-quit 清理完成后补 `app.exit(Number(exitCode))` 兜底非零码，清理链与退出码两全
- 主对话 diff 轻量复核：scanUsageFromTail 尾→头扫描语义与原正向扫描取末条一致 ✅

### 2026-07-28 ｜ 常驻实例 ｜ 交用户试玩
- 处置：清空开发期测试数据（api_usage 3 行 mock + approval_history 测试条目，python sqlite3 直删）→ setsid 脱离启动 `electron . --disable-gpu`（日志 /tmp/harness-monitor.log）
- 环境：用户 shell 配置与当前环境均无 DEEPSEEK_API_KEY → 余额数据暂空（用量卡 M8 才做，当前窗口仍为 M1 占位）；待用户告知 key 提供方式
- 交接约定：用户反馈托盘三件事（右键菜单/左键 toggle/绿点）+ 审批试玩结果后回收实例再派发 M7（单实例锁冲突，M7 开发验证需起应用，实例须先下线）

### 2026-07-28 ｜ 用户反馈 ｜ 托盘三件事通过 + API key 配置
- 用户确认：托盘绿点 / 右键菜单 / 左键 toggle 均正常（"其他都没问题"）——M4 遗留的 3 项 GUI 确认核销
- DEEPSEEK_API_KEY 已写入 ~/.bashrc（600 权限，**不入 git、不入任何项目文档**，本日志亦不记录明文）
- 真实余额验证：裸 node 调 DeepSeekProvider.checkBalance() → **¥10.77 CNY** ✅（直连可用，node fetch 无需代理）。注意：余额距默认告警线 ¥10 仅 0.77，低余额红点 + 通知功能预计很快真实触发
- 蓝图小修：DESIGN §6.11 补 `usage:history` 通道、§7 补 `getBalanceHistory()`（v2.3 裁剪引入 get30DayBalance 时漏补 IPC 面）
- 实例已回收（端口释放、无残留），放行 M7 开发

### 2026-07-28 ｜ 第三阶段 ｜ M7 开始（前端阶段启动）
- 注入上下文：TASKS §8（M7 任务 + 验收）/ DESIGN §4（组件树）/ §2（视觉 token，基准原型 harness_monitor.html）/ §6.11（IPC 通道全表，含新增 usage:history）/ §7（preload API 全量）/ §6.12（共享类型）
- 范围：ipc-handlers.ts（全量 ipcMain.handle，薄封装委托）/ preload 全量 electronAPI（11 invoke + 5 on-push，返回 unsubscribe）/ electron.d.ts 类型声明 / 挂件壳（App.tsx widget-window 毛玻璃 + WidgetHeader 44px 拖拽区 + TrafficLights 红绿灯接 M4 窗口 IPC + PinIcon + SegmentedControl 分段导航含 pending badge + 三视图占位）/ M1 遗留（sandbox 决策 + CSP meta）
- 关键约定：approval:respond IPC 只做 queue.respond + 补发 approval:resolved push，recordApproval 唯一落库点仍在 server POST /approve 恢复处（审查整改后的不变量，不得破坏）；tray:color-changed push 在本模块接通
- 验证需 DEEPSEEK_API_KEY（source ~/.bashrc 获取，不得写入代码/文档/提交）
- 派发：开发+测试合并 subagent（高速模式续进）

### 2026-07-29 ｜ M7 ｜ 中断与恢复
- subagent 在收尾验证阶段被 API 错误（response stalled）中断：代码全部完成未提交、验证实例孤儿驻留（18456 在听）
- 处置：SendMessage 原 agent 续接（上下文完整保留）——完成剩余验证（segment 切换复验 / 截图 / 拖拽区）、补齐回归、提交、清理实例

### 2026-07-29 15:38:48 ｜ M7 ｜ 完成（commit ab25b3e）
- 产出：ipc-handlers.ts（14 通道 ipcMain.handle，薄封装委托）/ preload 全量 electronAPI（14 invoke + 5 on-push，返回 unsubscribe）/ electron.d.ts 类型声明 / 挂件壳（App.tsx widget-window 毛玻璃 + WidgetHeader 44px 拖拽区 + TrafficLights 红绿灯 + PinIcon 置顶 + SegmentedControl 分段导航含 pending badge + 三视图占位）/ M1 遗留收口（sandbox:false 决策 + CSP meta）
- 验证全绿：npm run build 三入口零错误 + 双 typecheck ✅；截图 /tmp/hm_m7.png（segment 切换 / 拖拽区确认）✅；实例清理（18456 空闲、无残留）✅
- 偏差：14 通道较 TASKS §8 原定「10 invoke」多 4 条（M4 窗口控制 IPC 4 条 + M8 前置 usage:history，均属 DESIGN §6.11 全表范围，非越权）
- 遗留：无（sandbox / CSP 随本模块关闭，跨模块遗留项登记表两项核销）
- 交接：M8 接 usage:get/usage:history IPC；M9 接 sessions:get/approval:respond/history:get IPC；M10 接 config:get/config:save IPC

### 2026-07-29 ｜ 工作流 ｜ C 方案四线并行派发
- 背景：M7 完成后，按前序 B/C 配置与并行化分析，将剩余前端模块改并行——B approve.sh（从 M11 拆出）/ A M8 / C M9 / D M10 同时派发
- 冲突隔离规则（实测有效）：文件域划分（M8 占 usage/、M9 占 sessions/、M10 占 main/+settings/）；PROGRESS.md 与 package.json 单一写方（主对话 / 仅 M8）；globals.css 令 M10 绕开用 Tailwind；GUI 验证轮询等实例空闲、不强杀他人实例
- 代价（符合预期）：同机单实例锁 + 固定 18456 → GUI 验证天然串行，M9/M10 均等待 M8 实例释放；代码开发（build/typecheck/写组件）并行，串行仅占各模块收尾 ~10%
- 结论：零文件冲突的模块可放心并行；验证串行是唯一硬约束

### 2026-07-29 ｜ 关键决策 ｜ saveConfig 反馈设计（M2 遗留收口）
- load 降级保留（§18.4，损坏/无权限→默认值不抛）；**save 降级取消**——保存是前台用户动作，静默降级＝假成功真丢失，改抛异常
- IPC：config:save 返回合并后完整 AppConfig（原返回 undefined）+ 成功后 reschedule；写失败抛出→invoke reject
- UI：行内反馈，成功"已保存 ✓"（绿，2s 淡出）/ 失败"保存失败：msg"（红，留到下次操作），不用 toast 库
- 重调度：save 后 stop 双调度器→loadConfig→重启（check_interval_min/refresh_interval_sec/threshold/notifications.enabled 即时生效）

### 2026-07-29 15:52:35 ｜ approve.sh ｜ 预完成（commit d4264c6）
- 从 M11 拆出独立并行（仅依赖 M5 HTTP API，HARNESS_MONITOR_PORT 可覆盖端口→stub 19999 自测，零冲突）
- stdin→jq 解析 command/session/cwd→curl -m 65 POST :18456/approve→allowed:true exit 0 / allowed:false exit 2（hook 拦截规范）/ 连接拒绝·超时 fail-open exit 0
- 8/8 stub 自测通过；agent 主动补 harness/tool 字段（否则审批历史 harness 列恒 unknown）——采纳
- M11 自此仅剩端到端清单执行

### 2026-07-29 16:09:43 ｜ M9 ｜ 完成（commit 2c0b99a）
- 产出：useSessionsData + StatusDot/ContextGauge/SessionCard/ApprovalBlock/ApprovalHistory/SessionsView（6 组件）
- 验证：tsc 绿 + 数据源联通（GET /api/sessions 返真实 session，字段逐一对齐）+ 审批链路静态走查；**GUI 被 M8 实例挡（两轮等待超时，按约未强杀）→ 延后并入批量审**
- 偏差：① Model→Tool（SessionInfo 无 model 字段，据实显示 tool）② 新增 orphan 审批兜底卡（curl 测试 session 不匹配真实 session 的必要超集）③ globals.css 一并提交 M8 未提交的用量段（单文件无法拆分，归属串但 CSS 全在，类名前缀隔离）④ 倒计时 cast PendingApproval（d.ts 声明 ApprovalPayload、运行时 PendingApproval）⑤ 挂载前已 pending 审批无 getPendingApprovals IPC 补拉（push 主流程不受影响，留审裁定）

### 2026-07-29 17:33:36 ｜ M10 ｜ 完成（commit a722e3b）
- 产出：config.ts（saveConfig 写失败抛出）/ ipc-handlers.ts（config:save 返回+reschedule+app:quit+window:get-always-on-top）/ index.ts（reschedule 注入）/ preload+electron.d.ts+shared/types.ts（DeepPartial 归位 §6.12）/ SettingsView
- saveConfig 契约收窄**零回归面**：仓库无 TS 测试框架，无"save 失败不抛"既有断言
- **GUI 全项实测通过**（唯一全过的前端模块）：CDP 驱动真实 React→IPC→主进程→磁盘——写盘（config.yaml 实测）/ 重调度（usagePushDelta=2 证即时 tick）/ 置顶（getAlwaysOnTop 真源）/ Quit 无残留 / save 失败（config.yaml 变目录注入 EISDIR，应用不崩）
- AlwaysOnTop 取舍：复用 pin 机制不持久化（WindowConfig 无该字段）+ 只读 IPC 反映窗口真源，与 header 📌 同源一致
- 提交超"main+settings"软边界含 preload/d.ts/types.ts（新 IPC 必须接线，M8/M9 不触碰，无冲突）

### 2026-07-29 ｜ M8 ｜ 停滞与恢复
- 代码写完未提交即停滞（同 M7 response-stalled 模式：换 3 实例后卡在提交前，无完成通知）；M10 后启动却先完成
- 诊断：实例仅 8 分钟新（非报告称 30 分钟）+ 多次重启 dev server＝活着非死；SendMessage 续接原 agent，返回"at its next tool round"证实存活
- 主机空闲后补做 GUI 全验并收尾

### 2026-07-29 17:52:17 ｜ M8 ｜ 完成（commit 690bd24）
- 产出：useUsageData + UsageView（余额卡）+ TrendSparkline（原生 SVG 面积折线）；删 recharts（npm ls 空）；globals.css 用量段已由 M9 提交（未重复 add）
- GUI 实测：余额卡 ¥10.77 + Live 徽章 / 低余额红字（threshold 20 注入，删除恢复）/ 30 点面积折线 + hover Tooltip（2026-07-18 ¥22.05）/ 空数据 return null（代码级）
- 清理：注入测试快照全删（346→317 真实行，remaining_injected=0）；EmptyState 分支 typecheck 过未运行时截图（需清空 api_usage 会毁真实余额，留批量审兜底）

### 2026-07-29 ｜ 环境坑汇总（供批量 Review / M11 复用）
- electron-vite dev 本机 GPU 进程 FATAL（error 1002）且拒收 --disable-gpu → 用构建产物 `electron . --disable-gpu --in-process-gpu`
- Wayland 下 xprop/wmctrl 看不到 Electron 窗口 → 用 CDP 做 DOM 读写/点击 + xwininfo/import 取像素；blur 自动隐藏需 togglePin+maximize 强制 IsViewable 再截图
- CDP Page.captureScreenshot 软件渲染偶发挂死 → 用 import -window
- server.ts:81 createServer 闭包捕获 balance_warn_threshold → 审批侧托盘色用旧阈值至重启；reschedule 已覆盖主消费方（余额告警 + services 余额侧托盘色 + 双调度器间隔），未重建 server（风险更高，超约定）

### 2026-07-30 ｜ 前端批量 Code Review ｜ 派发（M7~M10）
- 背景：07-29 M10 完成后日志停在"下一步：派发"，会话中断致派发未执行；07-30 用户询问进度时核实（无 review commit / src 无改动 / 18456 空闲 / 任务列表空）确认**未启动**，当场补派
- 审查方：独立 subagent（sonnet 交叉验证，高速模式两轮的最后一轮）；范围 commits ab25b3e/690bd24/2c0b99a/a722e3b 全量 diff + DESIGN §2/§4/§5.3/§6.11/§6.12/§7 符合度 + CDP 实测三视图
- 已预披露偏差（不重复计）：M7 14 通道 / M8 删 recharts / M9 Model→Tool + orphan 卡 + globals 串段 + cast + 无补拉 / M10 AlwaysOnTop 不持久化 + 超软边界

### 2026-07-30 ｜ 前端批量 Code Review ｜ 未通过（3×P1，严格口径）
- 实测全绿项：M7 挂件壳（分段/红绿灯/拖拽/badge）/ M8 余额卡 + Live + ¥10.77 + 折线 hover + 低余额红字 / M9 会话卡 + 审批 happy path + 历史 + orphan / M10 保存 + 重调度 + save 失败 + Quit；安全面（CSP 实证拦 http / sandbox+contextIsolation / contextBridge 冻结）+ strict 零 any 均优
- **不变量确认完好**：recordApproval 唯一落库点仍在 server.ts POST /approve 恢复处；approval:respond IPC 只 queue.respond + push，不落库
- **P1×3**（2 条在审批 P0 面）：
  - P1-1 FR-2.7 跳转终端是静默空桩（ipc-handlers `return false // M9 实现`，全仓无 spawn；P1 需求未延后，M11 验收 #521 必挂）
  - P1-2 审批**超时路径不 push** approval:resolved → 卡 zombie（"Wait Approval (0s)" 冻结、按钮可点但返回 false）+ badge 永久卡住
  - P1-3（预披露 #5 升级）**无 pending 补拉 + `key={activeView}` 重挂载** → 离标签页/启动前到达的审批 widget 内不可见不可操作，badge 却亮红
- P3×8：置顶双控件去同步 / 紧急红 #ff5252≠#ff3b30 / save 文案泄露路径 / DESIGN 文档陈旧 / server 阈值捕获 / onTrayColorChanged 无订阅 / EmptyState 无法注入 / 切 tab 闪烁
- EmptyState 兜底未竟：contextBridge 冻结 + 无 DB 空路径，无法运行时注入，静态确认正确（测试性限制非缺陷）

### 2026-07-30 ｜ 审查裁定（主对话）+ 用户拍板
- 用户选定：P1-3 用「补拉 seed」方案（非三视图常驻）；P1-1 **并入本轮整改包**（非拆分/延后）
- P3 裁定：修 P3-1/2/3；P3-4 文档主对话自改；P3-5 延后；P3-6 文档注明预留；P3-7 接受静态验证；P3-8 随 P1-3 顺解

### 2026-07-30 16:35:55 ｜ 整改包 ｜ 完成（commit d63fe60，9 文件 +189/-37）
- 开发+测试合并 subagent；6/6 全修 + build 三入口 + 双 strict typecheck 零错误 + CDP 实测全绿：
  - P1-2：POST /approve await 恢复处补 `sendToRenderer('approval:resolved',{id,allowed})`，落库点不动；超时 60s 卡正确淡出移除 + badge→null + 历史 allowed:false
  - P1-3：新增 `approval:get` invoke（approvalQueue.getAll 只读）接线 ipc/preload/d.ts；useSessionsData `Promise.all([sessions:get, approval:get.catch(→[])])` 挂载 seed + id 去重幂等；离页 POST 切回即见可批 + 启动前 pending 首屏即显（顺解 P3-8）
  - P1-1：session:jump-terminal 实装 §6.8.4 回退链 kgx→gnome-terminal→xterm（--working-directory / xterm spawn cwd）+ 入参守卫 + 全链失败 false + SessionCard 行内"无可用终端"提示；实测弹出 gnome-terminal cwd 命中
  - P3-1 置顶态上提 App 单一真源（getAlwaysOnTop 播种）双向同步 / P3-2 红统一 var(--danger-red)（color-mix 浅红）/ P3-3 UI 脱敏「保存失败：请检查配置目录权限（错误类型）」路径/pid/tmp 只留 main 日志
- 清理：7 测试行删除（approval_history 11→4 真实行不动）、api_usage 未碰、config.yaml 复原、gnome-terminal/chmod 复原、端口释放无残留

### 2026-07-30 ｜ 整改 ｜ 主对话轻量复核 通过
- diff 复核 P0 面：P1-2 push 位于落库点之后 res.json 之前（recordApproval 不动）；respond 路径双发 push（IPC + POST 恢复）经 `App.tsx:39 Math.max(0,c-1)` 下限 + fading-by-id 幂等吸收，badge 不变负；P1-3 seed Promise.all + catch 回退 + id 去重 + disposed 守卫健全
- 结论：M7~M10 放行（前端批量审闭环）

### 2026-07-30 ｜ 文档 ｜ DESIGN 陈旧同步（P3-4 + P1-3 新通道）
- §4：Model 徽章→Tool（SessionInfo 无 model）；删 Start at Login（autostart 已裁剪）
- §6.11：config:save 签名 `Partial→void` 改 `DeepPartial→AppConfig`（M10 决策）；新增 `approval:get` 行（PendingApproval[]，P1-3 补入）
- §7：saveConfig 签名同步；新增 `getPendingApprovals()`
- 遗留（延后/备查）：P3-5 server warnThreshold 捕获（收敛延迟低风险）；onTrayColorChanged 无订阅（预留）

### 2026-07-30 17:11:12 ｜ 第四阶段 ｜ M11 端到端验收 开始
- 基线：d8af845（DESIGN 同步 + PROGRESS 时间戳回填），工作树干净，18456 空闲、无孤儿实例
- 注入上下文：REQUIREMENTS v2.2（FR-1~FR-6 / NFR / US 全表）/ TASKS §12（M11 验证清单）/ DESIGN §6.13（approve.sh）
- 范围：approve.sh 已 8/8 预完成（d4264c6）→ 本模块仅剩**端到端清单逐项执行**，对照 REQUIREMENTS 核销（含 FR-2.7 跳转终端、FR-3.2 超时 auto-deny，整改后均已实装）
- 安全边界（任务书已约束）：不得 SIGTERM 真实 claude session（FR-2.8 仅对 dummy 进程验证）；阈值/间隔/config.yaml 改后必复原；注入测试数据必清空；验证用实例结束即清理
- 派发：开发+测试合并 subagent（高速档，M10 收尾后直接续进）；需用户肉眼确认项（托盘圆点/桌面通知/弹出终端）由 subagent 标注、主对话转交用户

### 2026-07-30 17:57:57 ｜ 第四阶段 ｜ M11 端到端验收 通过（项目 11/11 收口）
- 验收方：开发+测试合并 subagent（真实运行实例，构建产物 `electron . --disable-gpu --in-process-gpu`）；主对话独立复核清理与安全
- **结果：42 项通过 / 0 失败 / 4 肉眼项**（FR/NFR/US 全核销）
  - FR-1 余额：余额卡 ¥10.77+Live、低余额注入 threshold=20→红点 #ff5252+桌面通知+卡内警示、30 天趋势线 hover、持久化 660 行真实数据
  - FR-2 Sessions：2 真实卡片 / ctx% 11%·27%（cyan 进度条）/ 内存 / provider 解析（glm-5.2）/ 状态灯脉冲；**跳转终端 IPC true + gnome-terminal spawn 成功**；终止仅 dummy 进程验证（**未触碰真实 session**）
  - FR-3 审批：approve.sh 真实实例 exit 0/2 + fail-open；**60s 超时 auto-deny 实测**（临时 3s→3019ms allowed:false + 落库）；sudo rm 高亮 #ff6b6b；Approve/Deny→HTTP 返回→tray 橙→绿；历史折叠 8 条
  - FR-4 托盘：像素级四色 绿 #00e676→橙 #ffab00→红 #ff5252，优先级 红>橙>绿
  - FR-5 设置：改阈值/间隔→config.yaml 写入→重调度→已复原；FR-6 基础设施：单实例锁 / 端口占用 exit 1 / SIGTERM 零残留 / 127.0.0.1 / 全链路本地时间（17:47:50≠UTC）
  - NFR：sandbox+contextIsolation+nodeIntegration:false、API 7 态降级；US-1~6 全核销
- 4 肉眼项：FR-2.7 跳转终端（**用户确认看到 gnome-terminal 弹出**）/ FR-4.3 右键 / FR-4.4 左键 / blur+pin（后三项 07-28 已确认）→ 全部核销
- 清理复核（主对话独立验证）：工作树干净、18456 空闲、无孤儿进程；用户配置复原（无残留用户 config.yaml，仓库默认 threshold=10/interval=1/timeout=60 完好）；DB 无 M11 残留（测试审批 id≥29 全删 10→4，剩 4 条为今早前端 review 历史行；api_usage 660 行未动）
- 代码产出：本模块无新代码（approve.sh d4264c6 预完成）；验收记录见本 commit

### 2026-07-30 18:04:06 ｜ 第五阶段 ｜ 项目总结与知识沉淀 完成（项目归档）
- 产出 `docs/RETROSPECTIVE.md`：项目概述 / 时间线 / 10 项关键决策（附理由）/ 环境坑 7 项 + 工程坑 4 项 / 工作流经验 / 数据附录
- **延后项评估结论**（RETROSPECTIVE §6）：
  - D1 打包+开机自启+SUID/electron-rebuild postinstall 固化 → **优先做**（产品化最后一公里，坑已探明，约 2~4h）
  - D3 审批超时可配置 → **顺手做**（M10 设置页框架已就位，0.5~1h）；建议与 D1 同批（共 3~5h）
  - D2 终端并行审批 → **缓做**（面板已覆盖主路径，ROI 偏低，待真实诉求）
- **知识沉淀**：工作流已依本项目实战整改 `~/CLAUDE.md`（11 条：反膨胀审查 / 开局定档 / 合并启发式 / 批量审 / 集成左移 / 禁空桩 / 蓝图活文档 / 并行派发 / 收尾三件套 / 参考资料外移 / 日志强化）+ `vibe-coding-workflow` 记忆同步 + HH:MM:SS 时间戳规范
- **对话保留**：全过程对话不删除，留作知识资产（工作流第五阶段要求）

### 2026-07-31 10:25:19 ｜ 归档后修订 ｜ session 显示名修复 完成（commit 3b0693e）
- 背景：用户反馈"sessions 里的会话名称不能全是 cury，得以实际为主"。根因：claude-sessions.ts `name = basename(cwd)`，本机会话 cwd 全为 /home/cury → 全显 "cury"（M6 完成日志已记录该现象，当时按 §6.8.2a 字面实现）
- 数据源调查（主对话实测）：① transcript JSONL 首条 user 记录即会话真实主题（string 或 text block 数组；tool_result 回传 type 亦为 "user" 但无 text 块须跳过；首条常被 `<system-reminder>` 追加包装）② session json 自带 name 字段（interactive 会话为 "cury-49" 类派生名，区分度有限，作回退）
- 实现（开发+测试合并 subagent，S 档不单开 review，主对话 diff 复核）：
  - 命名优先级链：**transcript 首条可读用户消息 → json name → basename(cwd) → 'unknown'**
  - `firstUserText()`：openSync+readSync **头部限读 64KB**（首条消息必在头部几 KB；transcript 可达数十 MB，绝不全文读）逐行 parse
  - `toTitle()` 共用清洗：整段剥除 `<system-reminder>` 与 `<local-command-caveat>`、剥斜杠命令 4 标签留内部文本（`<command-name>/loop</command-name>` → "/loop"）、取首个非空行、空白折叠、超 60 字符截断 + "…"
  - parseSessionFile 重构：findTranscript 一次定位，头读（取名）与尾读（ctxPct）共用路径
  - 审批匹配改 name / basename(cwd) / sessionId 三者任一（旧语义超集，approve.sh 主路径仍走 session_id）
- 验收全绿：build 三入口 + 双 typecheck 零错误；裸 node 真实数据——3 会话名互不相同（"/home/cury/harness-monitor"（本会话首条消息）/ "当前开了全局代理，浏览器访问网址出问题" / "/clear"），全唯一、≤61 字符；**主对话独立复跑确认 + ctxPct 8/5/27 非零（尾读链路重构无回归）**；7 组边界用例 PASS（tool_result 跳过 / reminder 剥后空跳过 / 截断 / 双级回退 / 多行取首行 / json name 截断 / 三路审批匹配）
- 蓝图勘误（已回写 DESIGN）：§6.8.2a name 字段规则改为命名链；§6.12 SessionInfo.name 注释同步。**实现期新发现**：`<local-command-caveat>` 整段占据首条 user 记录（原始调查 4 标签清单未覆盖），与 system-reminder 同列整段剥除
- 约束遵守：用户常驻实例（pid 427464，18456）全程未触碰，验收仅走裸 node；GUI 肉眼确认待用户重启实例
- 收尾三件套：① commit 3b0693e ✅ ② 无新起实例、无孤儿 ✅ ③ 本日志 ✅

### 2026-07-31 12:46:03 ｜ 归档后修订 ｜ 会话卡片 6 项反馈修复轮 完成（cdf4130 + a0086b0）
- 背景：用户实测反馈 6 项——① /clear 会话常驻需去除 + 会话路径未按实际展示 ② glm-5.2 API 不对 ③ Tool 应只有 claude-code 出卡 ④ 关闭按钮应关终端窗口而非杀对话 ⑤ 打开终端应跳转已有窗口而非新开 ⑥ 终端出现 command 审批时工具未同步
- 主对话只读调查定根因（关键发现）：
  - /clear 会话 = `kind:"bg"` 后台任务会话（带 jobId，长期驻留 sessions 目录）
  - session json 的 cwd 恒为启动目录（/home/cury），但 **transcript 每条记录自带 cwd 字段且随实际工作目录动态更新**——尾读真值即 /home/cury/harness-monitor
  - 本机经本地代理 **cc-switch**（127.0.0.1:15721）转发，transcript 末条 `message.model` = **qwen3.8-max-preview**（API 实际返回）；settings 的 `ANTHROPIC_DEFAULT_SONNET_MODEL_NAME=glm-5.2` 是陈旧代理别名（旧实现真源）
  - **#6 根因：~/.claude/settings.json 从无 hooks 配置**——approve.sh（d4264c6）只入库未注册，审批提示从未到达应用
  - 终端环境：gnome-terminal **原生 Wayland**（X11 侧不可见），系统无公开 API 聚焦指定窗口；xdotool/wmctrl 未装
- 实现（两轮串行 subagent，文件域隔离；主对话 diff 复核 + 裸 node 独立复跑）：
  - **#1a** parseSessionFile 增 kind 过滤（存在且非 interactive → 跳过；缺失放行兼容旧版）
  - **#1b/#2** `usedTokens` 重构为 `tailFacts`——单次 256KB 尾窗读逆扫**同时提取三事**（usedTokens 语义逐字不变 / lastCwd / lastModel，三量独立累积、齐备提前退出，零新增 IO）；显示 cwd = lastCwd → json cwd 降级；apiProvider = lastModel → settings 降级；ctxPct 窗口判定**仍由 settings modelId 驱动**（transcript 模型 id 经代理改写不含 [1m]，误用则偏差 5 倍）
  - **#3** tool 徽章固定值 `'Bash'` → `'Claude Code'`（harness 身份；前端仅徽章一处引用，审批匹配不依赖）
  - **#4** session:terminate 语义重做：`closeTerminalOfPid`（/proc/<pid>/fd/0 → /dev/pts/N → rdev → 枚举同 tty_nr 进程集 → SIGTERM 集合中 ppid 不在集内的根 shell → 模拟器关窗/标签 → claude 随 pty hangup 退出）；守卫 pid<=0/自身/init；无控制终端 → false + UI 行内"无终端窗口"；IPC 返回 boolean
  - **#5**（用户裁决方案 A：X11 精确聚焦 + Wayland 开窗到项目路径）`focusExistingTerminal`：command -v 检测 xdotool（**可选依赖不强装**）→ ppid 上行找终端祖先（TERMINAL_COMMS 白名单）→ search --pid 取窗（多窗口按标题含 basename(cwd) 筛选）→ windowactivate；失败降级既有 spawn 链（F2 后 cwd 已是真实项目路径）；IPC 签名 (cwd, pid?)
- 验收全绿（两 subagent + 主对话复跑）：build 三入口 + 双 typecheck 零错误；裸 node 真实数据——**仅剩 1 卡**（bg 被滤）、cwd=/home/cury/harness-monitor、apiProvider=qwen3.8-max-preview、tool=Claude Code、ctxPct 14 无回归；closeTerminalOfPid script 假终端 5/5（true+2s 全组消失 / 无 tty false / 守卫 false）；findTerminalAncestor(本会话 pid)→gnome-terminal- + shim 假 xdotool 8 组断言（多窗口标题筛选命中 222 / 单窗 / 全不匹配取首 / search 空 false / 无 xdotool false）
- **实现期新发现（均已代码注释 + 蓝图回写）**：
  - Linux comm 受 TASK_COMM_LEN 限 **15 字符**——gnome-terminal-server 在 /proc stat 中为截断形 `gnome-terminal-`，TERMINAL_COMMS 须含截断形（否则祖先查找必 null）
  - `statSync().rdev` 与 stat field 7 `tty_nr` 同为 old_encode_dev 编码（pts/1 实测同值 34817），可直接 === 比较
- **蓝图勘误（本次已同步回写 DESIGN / REQUIREMENTS）**：§6.8.2b kind 过滤 + cwd 尾读真源；§6.8.2f apiProvider 真源改 transcript message.model（settings 降级）；§6.8.4 聚焦优先 + 开窗降级二段（xdotool 可选依赖 / comm 15 字符截断）；§6.11 jump-terminal 签名 (cwd, pid?) + terminate 语义变更；§6.12 SessionInfo cwd/apiProvider/tool 注释；§7 preload 双签名；§6.13.5 hook timeout 70；REQUIREMENTS FR-2.4/2.7/2.8 修订
- 约束遵守：两轮 subagent 全程未触碰用户实例（其间用户自行换实例 427464→436959）；~/.claude 只读（hook 注册归主对话，见下条）
- 收尾三件套：① commit cdf4130 + a0086b0 ✅ ② 无新起实例/无孤儿 ✅ ③ 本日志 ✅
- 遗留：#6 hook 注册 + 端到端 / 用户实例重启载新构建（10:27 实例为修复前构建）——随下条日志收口

### 2026-07-31 13:31:16 ｜ 归档后修订 ｜ #6 hook 注册 + 审批全链路闭环
- 注册：~/.claude/settings.json 增 `hooks.PreToolUse`（matcher Bash → `/home/cury/harness-monitor/resources/hooks/approve.sh`，**timeout 70000**）；原 settings.json 备份为 `settings.json.bak-20260731`
- **排障实录（两个叠加坑，均已入蓝图）**：
  - 坑 1：timeout 写 `70` → hook 被 70ms 即杀、报 "hook error: No stderr output"——**2.1.207 的 hook timeout 单位为毫秒**（二进制日志串 `with timeout ${c}ms` 实锤）→ 改 70000
  - 坑 2：改对后仍"报错"——实为 **exit 2 拦截被 Claude Code 显示成 "hook error: No stderr output"**（60s 无人审批 → auto-deny → exit 2 → stderr 空 → 展示文案误导）。诊断包装器（/tmp 临时，记 PATH/stdin/exit）证实脚本 exit=2 完全正常；直测端点 `time curl POST /approve` = **real 1m0.011s + allowed:false**，server 行为完全正确
  - 结论：全程无代码 bug，纯粹"60s 内无人点批准"+ 展示文案误导
- **闭环证据链**：① 无头验证——POST /approve 挂起 60s、/api/approvals 见 pending 条目（timeoutSec 60）**用户在应用内点击批准 → 响应 allowed:true** ② 真实 hook 链路——本对话 Bash 命令经 PreToolUse → approve.sh → 审批卡 → 用户批准 → 命令执行（13:31:16 实测，输出打印成功）
- 副作用说明：注册后**本机所有 Claude Code 会话**的 Bash 命令经审批管控（app 未运行 fail-open / 60s 超时 auto-deny）；新会话即时生效，已运行会话按 Claude Code 配置热载行为
- 清理（随本条收尾命令）：今日 E2E 测试审批行（session: e2e-test/e2e-diag/headless-proof + 本会话探针行，timestamp ≥ 2026-07-31）从 approval_history 删除（07-30 及以前的 4 条真实历史行不动）；/tmp 诊断文件（hm-hook-*.sh/log/json、hm-notify-capture.txt、hm-approve-response.txt）全删
- 待办移交：用户实例（436959，10:27 启动 = 修复前构建）审批 UI 正常（M5 代代码）但 #1~#5 修复未载——重启后全量生效（D1 打包前最后一次手动重启）

### 2026-07-31 16:12:42 ｜ 归档后修订 ｜ Sessions/审批四项体验增强轮 完成（commit ee9f436）
- 背景：用户实测反馈 4 项——① 审批弹到界面时应描述请求内容 ② 每卡片放最近对话/任务内容（短）③ 加开关：打开后自动同意所有审批 ④ 审批同意/拒绝对动效太慢
- 需求澄清（主对话 AskUserQuestion，用户拍板两项分叉）：F3 开关 = **会话级快捷开关（Sessions 视图、重启复位 OFF 的安全默认）**；启用 = **两步确认**
- 只读调查定方案（关键发现）：Claude Code 的 Bash hook 输入**自带** `.tool_use.input.description`（命令人类可读摘要），approve.sh 一直丢弃 → F1 即透传它；claude-sessions.ts 已有单次 256KB 尾读（三事）→ F2 零新增 IO 扩成四事；淡出 2s 由 `FADE_HOLD_MS=2000` + CSS `approval-fade-out 2s` 两处共同决定 → F4 同降
- 实现（单个开发+测试合并 subagent，共享文件多故串行单 agent；主对话 diff 复核）：
  - **F1** approve.sh 提取 description 入 BODY → server /approve payload 解析 → ApprovalBlock cmd-box 上方 `.approval-desc`（非空显摘要，空回退"Claude Code 请求执行 ${tool} 命令"）；**不落库**（db schema 不动）
  - **F2** tailFacts 并列第四事 lastActivity（逆扫首条 message.content 清洗截断 120，尽力而为**不参与早退门槛**；usedTokens/lastCwd/lastModel 逐字不动）→ SessionInfo.lastActivity → SessionCard badge 与 meta 间单行 ellipsis（title 全文 tooltip）
  - **F3** server.ts 模块级 autoApprove flag + setAutoApprove/getAutoApprove 导出；POST /approve 构造 payload 后、enqueue 前**早退分支**（复用 `recordApproval(...,true)` 唯一落库点记 allowed=1，不入队/不通知/不置橙/不 push）；IPC `approval:set/get-auto-approve` + preload + d.ts；SessionsView `AutoApproveBar`（挂载 getAutoApprove 播种真源、两步 armed "Sure?"、点别处 disarm、ON 常驻警示横幅）；纯前端 state 不持久化
  - **F4** `.approval-fade` 2s→0.5s + `FADE_HOLD_MS` 2000→600（≥CSS 时长）
- 验收（subagent + 主对话 diff 复核）：build 三入口 + 双 strict typecheck 零错误；裸 node 真实会话 ctxPct 9/21 非零（**不变量 B 不回归**，usedTokens 代码 diff 字节一致）+ lastActivity 各 121 字符；approve.sh stub（19999）description 透传断言过（带/无 description 两态）；全仓无占位桩
- **不变量复核（主对话 diff）全过**：A recordApproval 仍唯一落库点（早退分支复用同一 DAO，return 前不重复，每请求恰一条历史）；B 早退门槛仍三事不含 lastActivity（不可能过扫/死等）；F3 IPC 非 boolean 归一 false、挂载播种 + disarm 一帧延迟防自解除均正确
- 蓝图勘误（本次已回写 DESIGN v3.2+）：§5.3 增 description 解析 + F3 自动审批早退分支；§6.8.2e 尾读四事（lastActivity 尽力而为）；§6.11 增 approval:set/get-auto-approve 两通道；§6.12 SessionInfo.lastActivity + ApprovalPayload.description；§7 preload 增 setAutoApprove/getAutoApprove
- 约束遵守：用户实例（pid 456964，18456）全程未触碰；~/.claude 只读；无孤儿进程（19999 stub 已关）
- 收尾三件套：① commit ee9f436（12 文件 +336/−22）✅ ② 无新起实例/无孤儿 ✅ ③ 本日志 ✅
- 遗留（待用户重启实例加载新构建后 E2E）：F3 实机自动放行（开关 ON → approve.sh 请求立即 allowed:true + 历史 allowed=1 + 托盘不闪橙 + 无卡片）／ F4 0.5s 淡出观感 ／ F1 审批卡描述行与 F2 卡片任务行渲染观感——受单实例锁 + 不动 18456 约束，本轮 GUI 验证跳过（用户实例本为旧构建，看到任何新功能都需重启）

### 2026-08-03 01:11:00 ｜ 归档后修订 ｜ 审批镜像轮（M12）开始
- 背景：用户 2026-07-31 夜反馈——"终端界面出现的、需要我授权的请求同步弹到工具里；终端未出现的请求，则不出现在工具里"。只读调查三定根因：① approve.sh 读 `.tool_use.input`、当前 2.1.207 发**顶层 `tool_input`**（捕获实锤）→ 审批卡 command/description 恒空（F1 stub 自测用旧格式掩盖了真实漂移）② matcher 仅 Bash + 无条件拦截 → 超集（settings.local.json 580 条 allow 规则全被无视，每条 Bash 都弹空卡）+ 缺集（Edit/WebFetch 等终端询问不进工具）
- 实测排障（临时捕获包装器 + settings.json 热替换，用完即复原、diff 验证字节一致）：
  - hook 输入 schema 捕获：顶层 tool_input / session_id / cwd / **permission_mode**（本会话 acceptEdits）/ tool_use_id
  - **hook stdout 权限 JSON 三轮标记命令实测（用户终端肉眼确认）**：hookSpecificOutput.permissionDecision:"allow" 单独 / legacy {"decision":"approve"} 单独 / 三格式组合——**全被忽略，终端照常弹原生询问** → "工具批准 = 终端不再问"无法靠 hook 输出声明实现
- 用户拍板（AskUserQuestion 四轮）：双向全镜像 ／ 静默放行不落库 ／ 批准 = **永久**写入 allow 规则（Plan B，与终端"允许并不再询问"同机制）／ 开发期 approve.sh 临时直通（终端原生权限流接管，已加 TEMP exit 0 段，E2E 换新实现时删）
- 开发期副作用说明：直通起，本机所有会话的审批闸门 = 终端原生权限流（工具不介入）；期间空卡误拒开发命令数起（根因①的直接体现）
- 方案定稿（蓝图已回写）：DESIGN v3.3（头部变更注记 / §5.3 流程重绘 / §6.5 /approve 前置管线 / §6.12 类型勘误+toolInput/permissionMode / §6.13 hook 全工具薄中继+快速通道+schema 两路兼容+注册 matcher "" / 新 §6.14 permission-mirror 六小节）+ REQUIREMENTS FR-3 改名+FR-3.1 重写+FR-3.10/3.11 新增 + TASKS §1 注记+§15 M12 任务+验收
- 已知缺口（登记）：会话内临时授权不可观测 → 工具可能多弹一次卡（无害）；规则匹配子集实现，偏差方向恒为多弹卡/终端兜底；enterprise settings / CLI --allowedTools 不求值（单机工具）
- 交接：F1-F4 的 GUI E2E 遗留项随 M12 收尾的用户实例重启一并核销（都需要重启载新构建）
- 派发：开发+测试合并 subagent（共享文件多——approve.sh/server/types/UI/config，串行单 agent；高速档），完成后主对话 diff 复核 + E2E（matcher "" 切换 + 双向保真 + 批准写规则实写 + 用户肉眼）

### 2026-08-03 01:26:21 ｜ 归档后修订 ｜ 审批镜像轮 实测翻转 + 方案回调 Plan B → Plan A
- 起因：01:11 并行派发的文档研究 agent 返回（856s）——v2.1.207 二进制静态分析：Zod schema 非严格（未知键剥除不拒绝）、legacy `decision:"approve"` 与 `hookSpecificOutput.permissionDecision` 皆支持且新格式覆盖旧格式、exit 0 + stdout 纯 JSON 才解析、JSON allow 不覆盖任意作用域 deny/ask 规则——与早先三轮"全被忽略"实测正面矛盾
- 污染根因：此前每轮标记测试后紧跟一条**复原配置命令**（未覆盖规则 → 终端原生流必弹一次），该弹窗被当成标记命令的；用户多轮回答"弹了"时实际看到的是复原命令的询问（01:06 单 legacy 轮后"弹了的"、组合轮后"弹了的"皆为此污染；首轮 wrapper-active 证据真实但用户未盯屏）
- 零干扰复测（01:24-01:26）：改 approve.sh TEMP 诊断段对 MIRRORCAP-TEST 命令输出规范形 permissionDecision allow JSON——真实注册路径（无 settings 切换 = 无热更新疑问）、无后续命令（= 无弹窗干扰）；首轮 echo/seq 存会话级临时授权干扰嫌疑 → 次轮换 `sha256sum`（会话全新 + 任何规则表均无）→ **用户全程目视确认：没弹、直接执行（01:26:21）** → hook 权限 JSON 生效结论确立
- 方案回调（Plan A，默认执行并向用户披露）：工具批准 → approve.sh 输出权限 JSON 压制终端二问；Plan B 的 persistAllowRule / 规则写入管线 / FR-3.11 原义（永久写规则）全废；批准 = 一次性语义；永久化登记 **延后项 D4**（审批卡勾选，Plan B 规则写入设计备装，见 commit 806165f 之 §6.14.5）；用户先前"永久写入"拍板的前提（JSON 无效）已推翻，据此回调
- fail-safe 不对称设计：拦截不托付 JSON（解析失败 = fail-open 安全洞）→ exit 2 + stderr；放行 JSON 解析失败降级"终端再问一次"（无害）
- 蓝图原地重写：DESIGN v3.3（头注 / §5.3 流程 / §6.5 前置管线 / §6.13.4 三态含 JSON 输出 / §6.14.1 翻转实录 / §6.14 引言去 persistAllowRule / 删 §6.14.5、6.14.6→6.14.5）/ REQUIREMENTS FR-3.11 重写 / TASKS §15 任务与验收瘦身 + §13 D4 / 本日志
- approve.sh TEMP 诊断段恢复简单直通，静候新实现整体替换

### 2026-08-06 01:01:21 ｜ 归档后修订 ｜ 审批镜像轮（M12）完成（E2E 全项通过）
- 开发（08-03 起，开发+测试合并 subagent）：两度 API 超时中断，均 SendMessage 续接原 agent 恢复（07-29 纪律再次生效）
- commits：70f391a feat(M12) 主体（7 文件 +579/−68）→ 0a6cff7 fix(M12) 垃圾响应 fail-open（复核整改）→ 98308da fix(M12) 镜像默认表元工具 + 历史 tool 列（E2E 整改）
- diff 复核（主对话 ×3 轮）：不变量 A-E（单落库点 / mirrorFilter 前置 / 快速通道白名单 / 权限 JSON 仅 allowed:true 分支输出 / F3 未破坏）全过；发现 1 项必修回归（垃圾响应误拦，旧版 fail-open）+ agent 连带挖出隐藏 bug（jq `.allowed // empty` 吞 false → deny 分支死代码）
- 主对话独立复跑：裸 node 镜像求值 18/18（真实规则样本：前缀/复合半全覆/模式短路/越界 Read/域名子域/摘要各分支）；整改轮 agent 累计 41/41 求值 + 36/36 stub 五态
- **E2E（真实实例 + matcher "" 全工具，用户肉眼确认）**：
  - 静默路径 ✅：规则覆盖命令（git *）不弹卡完全静默（超集方向修复成立）
  - 询问路径 ✅：未覆盖命令弹卡带内容（命令文本 + 徽章 + 描述行——字段错位空卡 bug 修复实证）；工具批准 = 一次性完事，终端不二问（Plan A permissionDecision JSON 生产落地）
  - 非 Bash ✅：WebFetch 未覆盖域弹卡、徽章醒目、内容为 URL（缺集方向修复成立）
  - deny ✅：拒绝 → exit 2 拦截 + stderr 原因，历史 allowed=0
  - F3 ✅：开关 ON → 未覆盖命令无卡自动放行 + 托盘不闪橙 + 历史 allowed=1（07-31 GUI 遗留核销）
- E2E 发现并轮内修复的 2 项 P2：B1 镜像默认表"未知工具→ask"误拦 harness 元工具（AskUserQuestion 实测被拦卡、阻塞主对话提问链路 → NEVER_PROMPT_TOOLS 21 项集合作为求值步 2.5，蓝图已勘误）；B2 recordApproval 缺 tool 参 → 历史 tool 列恒 'Bash'（签名 + INSERT 列补全，无 schema 迁移，蓝图已勘误）
- 环境坑（本轮新增）：① settings.json 的 hooks 段曾被外部重写移除（08-06 发现，疑似 provider 配置工具覆写），经用户确认后重新注册——**D1 打包时的 hook 一键注册须含完整性校验**；② settings 热加载（删除/注册）数秒内生效，再次实证；③ pkill -f 自匹配陷阱（括号技巧 `harness[-]monitor`）；④ 实测污染教训：标记测试不得紧跟任何未覆盖命令（复原命令的原生弹窗会污染观察）
- 收尾三件套：① 3 commits 入库 ✅ ② 实例 = 最新构建（98308da）健康在听 18456、无孤儿进程/端口；本轮 /tmp 诊断残留全清（wrapper/captures/stub/验证脚本/过期 settings 备份）✅ ③ 本日志 ✅
- 遗留：无（F2 卡片任务行用户日用中自然验证，异常随时反馈）

### 2026-08-06 01:35:34 ｜ 归档后修订 ｜ heredoc 修复回滚 + 终端行为实测 完成（commit f0f3c02）
- **背景**：01:22 的 heredoc 单块切分修复（43cb535）属假设先行、未实测终端。用户澄清需求「严格执行：终端是唯一真源，先实测终端行为再定」后，启动隔离实测。
- **实测方法**：临时剥离 settings.json hooks（备份+异 diff 复原，字节一致），`claude -p --model haiku-4-5` 隔离子进程逐条运行命令，报告 RAN（无审批）/ BLOCK（需审批）。两次独立测量 + claude-code-guide 权威文档交叉印证。
- **实测结果（2.1.207 环境，12 条命令）**：
  - 终端**不弹**（RAN）：`echo hi`、`pwd`、`which ls`、`du -sh /home/cury`
  - 终端**弹**（BLOCK）：`ls -la`、`cat`、`head`、`grep`、`cd && pwd`、`wc`、`diff`、`stat`、`python3 - <<'EOF'` heredoc、`sudo rm`
- **关键结论**：
  1. **heredoc 终端会弹询**（实测 + guide 推断双向印证：body 按换行切分、每段须各自被 allow，`Bash(python3 *)` 单条盖不住）→ **43cb535 的"静默 heredoc"是漏审回归**，回滚（f0f3c02），工具对 heredoc 恢复弹卡，与终端一致。
  2. **"工具弹了、终端没弹"实为 Plan A 正常效果**——工具先批准输出权限 JSON 压制终端二问，非工具多弹。工具本就在镜像终端会弹的命令，行为正确。
  3. guide 文档的只读豁免清单（ls/cat/head/tail/grep/…）与 2.1.207 实测**不符**（实测 ls/cat/head/grep/wc/diff/stat 均弹），2.1.207 实际豁免 ≈ {echo, pwd, which, du}（子集）。
- **残余 over-mirror**：仅裸 `echo`/`pwd`/`which`/`du`（终端自动放行、工具弹卡），纯只读无害。**用户拍板保持现状**（不引入复刻只读豁免的复杂性与漏审风险，符合"ask 误判→多弹卡无害"安全方向）。
- **蓝图勘误（DESIGN §6.14.4）**：撤销 01:22 加的 heredoc 单块切分注记，恢复"引号内分隔符/更深嵌套误切属已知边界→多弹卡无害"原文。
- 收尾三件套：① commit f0f3c02（revert）+ 本次 PROGRESS/DESIGN 回写待提交 ✅ ② 实例已重建为回滚后代码并重启（健康在听 18456，无孤儿）✅ ③ 本日志 ✅

### 2026-08-06 09:55:50 ｜ 归档后修订 ｜ 会话卡片任务状态灯 + 名称 完成（commit 72b12a0）
- 背景：用户提出在 Sessions 卡片加"任务状态"，初始两态（执行中/待执行）用颜色区分；需求澄清后确立**四态**（优先级高→低）：
  - **待执行 红** —— `hasPendingApproval`（命令等待审批，需用户操作）
  - **执行中 黄** —— 进程存活 && `recentlyActive`（transcript 最近写入，正在执行任务）
  - **busy 绿**（静）—— 进程存活兜底（会话在运行，无近期活动）
  - **已退出 灰** —— 进程已死（idle && memoryMB<=0）
- 数据源决策（AskUserQuestion 用户拍板）：busy(绿) 与 执行中(黄) 的区分 = **transcript 最近写入（mtime ≤ 60s）**，无需新增解析/轮询对比；待执行(红)=hasPendingApproval 无歧义
- 实现（S 档小改，主对话直接开发，未单开 review）：
  - types.ts：SessionInfo 增 `recentlyActive: boolean`
  - claude-sessions.ts：新增 `ACTIVE_WINDOW_MS=60_000`，进程存活且 transcript mtime 在窗口内 → recentlyActive（statSync 失败/transcript 空 → 降级 false）
  - StatusDot.tsx：重写为四态派生（pending/executing/busy/idle/dead）+ 彩色圆点 + **状态名称标签**（.status-label）
  - SessionCard.tsx：传 hasPendingApproval/recentlyActive 两新 prop
  - globals.css：增 pending(红)/executing(黄) 圆点 + status-wrap/status-label 样式；busy 由脉冲改静绿，脉冲移至执行中/待执行
- 验收：build 三入口 + 双 strict typecheck 零错误 ✅；真实数据校验——当前活动会话 transcript age=0s（→执行中），历史会话 days 级（→busy/已退出），阈值判定正确 ✅；构建产物含 recentlyActive 逻辑 + 四态标签 ✅
- 收尾三件套：① commit 72b12a0 ✅ ② 未触碰用户实例（pid 532090 仍为旧构建，GUI 肉眼确认待重启后核销）✅ ③ 本日志 ✅
- 遗留：实例重启后核销四态肉眼观感（红/黄/绿/灰 + 名称标签渲染）

### 2026-08-06 10:13:01 ｜ 归档后修订 ｜ 任务状态灯收尾 + 托盘增强 完成（commit 72b12a0 + 6c05b09 + 4bae67c）
- 任务状态灯（72b12a0，见上条）：四态彩色圆点 + 名称标签；绿色态标签 6c05b09 由 "busy" 改"空闲"
- 托盘增强（4bae67c）：
  - **Active Agents 菜单项**：彩色 emoji 圆点（🔴待执行/🟡执行中/🟢空闲/⚪已退出）承载状态色，
    与卡片 StatusDot 四态逻辑逐字同源（原生菜单无法着色单条文本，emoji + 状态名文本兜底）；
    并展示具体 tool + apiProvider + 会话名（替换原仅 ●/○ + name + busy/idle）
  - **双击托盘图标 → 弹窗**（win.show+focus；appindicator 平台可能降级，守卫记录）
  - **移除 Preferences... 菜单项**及分隔符
  - TraySessionSnapshot 增 hasPendingApproval/recentlyActive/tool/apiProvider，services.ts 全量透传
- 验收：build 三入口 + 双 typecheck 零错误；构建产物确认四态标签/emoji/双击在产、Preferences 菜单项已清（仅剩 webPreferences 选项误匹配）；实例重启（pid 578623）健康 200
- 收尾三件套：① commit 72b12a0+6c05b09+4bae67c ✅ ② 实例 = 最新构建，无孤儿 ✅ ③ 本日志 ✅
- 遗留：托盘菜单 emoji 彩色与双击行为需用户肉眼核销（GNOME appindicator 下双击可能不触发，属平台降级）

---

## M13 用量视图泛化（多 provider 阶段，2026-08-06 启动）

> 规模档：**L** ｜ 推进档位：**高速档**（用户选定分模块 subagent 推进）
> 背景：用量视图当前为 DeepSeek 单 provider 硬编码（余额卡 + 30 天趋势）。用户要求泛化为**多 provider + 惰性出卡**，
> 按卡片类型区分：余额卡（按量计费）/ 消耗卡（5h/7d 实际消耗）。
> 数据源（已逐一核实，见下日志评估）：
>   - DeepSeek 余额：`api.deepseek.com/user/balance`（`DEEPSEEK_API_KEY`，M8 已工作）
>   - 百炼余额：阿里云 BSS `QueryAccountBalance`（`business.aliyuncs.com` v2017-12-14，HMAC-SHA1 签名，`AliyunBSSReadOnlyAccess` AccessKey；**区别于 `sk-sp-` 模型 key**）
>   - 消耗卡：**cc-switch 本地库** `~/.cc-switch/cc-switch.db` `proxy_request_logs`（5046 条真实请求级用量，按 provider 聚合 `total_cost_usd`）
> 关键决策：订阅 5h/7d 消耗卡**不接各 provider 订阅 API**（用户实际 provider 均为按量计费、无该窗口），
> 改从 cc-switch 日志聚合——真实、本地、零认证，且「调用过就出卡」字面成立。

### M13 状态总览

| 模块 | 状态 | 单测 | Code Review | 完成时间 | 备注 |
|------|------|------|-------------|---------|------|
| M13a 配置+共享类型泛化 | ⏳ 未开始 | — | — | | usage_sources 列表 + cc_switch_db |
| M13b cc-switch 消耗读取 | ⏳ 未开始 | — | — | | cc-switch-usage.ts 聚合 5h/7d |
| M13c 百炼余额 | ⏳ 未开始 | — | — | | aliyun-bss.ts HMAC-SHA1 签名 |
| M13d 调度泛化 + db 接入 | ⏳ 未开始 | — | — | | startUsageChecker 遍历 sources |
| M13e IPC + 渲染（多卡片惰性出卡） | ⏳ 未开始 | — | — | | UsageView + hook + preload |
| M13f 集成测试 + review | ⏳ 未开始 | — | — | | E2E 逐项 + 批量 review |

**遗留项登记表（M13 新增）**
| 项 | 来源 | 计划收口 | 状态 |
|----|------|---------|------|
| 百炼余额真实凭证（阿里云 BSS AccessKeyId/Secret） | M13c | 用户提供后核销 | 🔄 待凭证 |
| 消耗卡 trend 图（数据在 cc-switch，本期只做现值） | 反膨胀裁剪 | 延后 | ⏳ |
| cc-switch 表结构耦合（升级改表 → 读失败降级保留上次） | M13b | 读取端 try/catch（NFR-3） | ⏳ |

---

### 2026-08-06 11:28 ｜ M13 ｜ 评估 + 蓝图确认
- 现状核实：用量视图 = DeepSeek 单 provider 硬编码（deepseek.ts 写死 `balance_infos[0].total_balance`）；cc-switch 本地代理 127.0.0.1:15721 路由到 DeepSeek + 阿里云百炼（glm-5.2/qwen3.8-max 均在百炼，`sk-sp-` token）
- 数据源核实：cc-switch `proxy_request_logs` 5046 条真实请求级用量（provider/model/tokens/total_cost_usd/created_at）；阿里云 BSS `QueryAccountBalance`（HMAC-SHA1 RPC 签名）
- 反膨胀结论：用户实际 provider（DeepSeek + 百炼）均为**按量计费**，无"订阅 5h/7d 窗口"；消耗卡改从 cc-switch 日志聚合
- 用户决策（AskUserQuestion）：① 消耗卡数据源 = 读 cc-switch 日志 ② 百炼余额 = 本期就做（需 BSS AccessKey）③ 推进方式 = 分模块 ④ 百炼凭证 = 稍后用户提供（已告知 https://ram.console.aliyun.com/manage/ak 获取，需 `AliyunBSSReadOnlyAccess`）
- 蓝图：见上方 M13 状态总览 + 模块表

---

**D1/D2/D3/D4 延后项暂缓**（M13 优先，用户本次指令）。原"下一步"文案见 git 历史。
