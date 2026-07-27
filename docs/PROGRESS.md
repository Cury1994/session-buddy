# harness-monitor — 开发进度日志

> 项目：harness-monitor（Electron 桌面托盘应用） | 启动：2026-07-21 | 蓝图：REQUIREMENTS **v2.2** / DESIGN **v3.2** / TASKS **v2.3**（2026-07-27 链路合并 + 蓝图裁剪，16→11 模块）

## 状态总览

| 模块 | 优先级 | 状态 | 单测 | Code Review | 完成时间 | 备注 |
|------|--------|------|------|-------------|---------|------|
| M1 项目骨骼 | P0 | ✅ 完成 | 通过 | 通过 | 2026-07-24 | commit 4e30d2f + 5783a5d（review 整改） |
| M2 配置管理 | P0 | ✅ 完成 | 通过 | 通过 | 2026-07-27 | commit 9a277be；P2 小修随 M3 提交 |
| M3 数据库 | P0 | ✅ 完成 | 通过 | 通过 | 2026-07-27 | commit 54b20d0 + b5908e4；**v2.3 schema 返工见下条** |
| M3r Schema 精简返工 | P0 | 🔄 进行中 | — | — | | v2.3 裁剪：删三假数据列 + localtime + autostart 移除 |
| M4 系统托盘 + 窗口管理 | P0 | 🔄 待启动 | — | — | | 340×650 挂件；任务书已拟 |
| M5 HTTP Server + 审批队列 + 审批联动 | P0 | ⏳ 未开始 | — | — | | 旧 M5 + M14 审批侧；UUID + 端口占用即退 + 颜色优先级协议 |
| M6 数据服务 + 调度 + 余额联动 | P0 | ⏳ 未开始 | — | — | | 旧 M6+M7+M8+M14 余额侧；扫描简化版（进程存活判定）；ctx% = usage token |
| M7 IPC + 挂件壳 | P0 | ⏳ 未开始 | — | — | | 旧 M9+M10；时区已在 M3r 解决，非决策点 |
| M8 用量视图 | P0 | ⏳ 未开始 | — | — | | 旧 M11；裁剪版：余额卡 + 余额趋势线（原生 SVG，删 recharts） |
| M9 Sessions 视图 | P0 | ⏳ 未开始 | — | — | | 旧 M12；SessionCard/ApprovalBlock |
| M10 设置视图 | P1 | ⏳ 未开始 | — | — | | 旧 M13；无开机自启项 + save 反馈设计 |
| M11 端到端测试 + approve.sh | P0 | ⏳ 未开始 | — | — | | 旧 M16 + approve.sh 开发落位；固定端口 |

**延后项**（主体功能验收后另评估，见 TASKS §13）：D1 打包 + 开机自启 + chrome-sandbox SUID ｜ D2 终端并行审批 ｜ D3 审批超时配置

**阶段进度**：Phase 1 基础设施 3/4 ｜ Phase 2 后端 0/2 ｜ Phase 3 前端 0/4 ｜ Phase 4 集成 0/1 ｜ 总体 3/11 (27%)

**当前阶段**：第三阶段（模块化开发）— M1~M3 完成，M3r 返工派发中，随后 M4

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

### 2026-07-27 ｜ M3 ｜ 开发完成（commit abdc604 + 54b20d0）
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

### 2026-07-27 ｜ M3 ｜ P2 小修完成（commit b5908e4）
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

### 2026-07-27 ｜ 工作流 ｜ 蓝图裁剪（REQUIREMENTS v2.2 / DESIGN v3.2 / TASKS v2.3）
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

---

**下一步**：M3r 返工完成后启动 M4（任务书已就绪；推进档位待用户确认）。
