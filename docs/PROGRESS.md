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

**延后项**（主体功能验收后另评估，见 TASKS §13）：D1 打包 + 开机自启 + chrome-sandbox SUID ｜ D2 终端并行审批 ｜ D3 审批超时配置

**阶段进度**：Phase 1 基础设施 4/4 ✅ ｜ Phase 2 后端 2/2 ✅ ｜ Phase 3 前端 4/4 ✅ ｜ Phase 4 集成 1/1 ✅ ｜ 总体 11/11 (100%) 🎉

**当前阶段**：**项目归档完成（11/11 + 第五阶段总结）** — 全流程五阶段走完；RETROSPECTIVE.md 产出 + 工作流整改已入 ~/CLAUDE.md；后续仅延后项 D1+D3 另评估（D2 缓）
**归档后修订**：
- 2026-07-31 上午 session 显示名修复（3b0693e，transcript 首条用户消息优先）
- 2026-07-31 下午 会话卡片 6 项反馈修复轮（cdf4130 + a0086b0 + hook 注册）——详见日志末条

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

---

**下一步**：① #6 hook 注册 + 真实审批端到端收口；② 用户重启实例加载全量修复；③ 按需启动延后项 **D1+D3 同批**（打包 + 开机自启 + SUID/postinstall 固化 + 审批超时可配；打包时 approve.sh 安装路径固化 + xdotool 声明可选依赖）；D2 暂缓。
