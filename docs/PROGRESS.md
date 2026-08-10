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

**阶段进度**：Phase 1 基础设施 4/4 ✅ ｜ Phase 2 后端 2/2 ✅ ｜ Phase 3 前端 4/4 ✅ ｜ Phase 4 集成 1/1 ✅ ｜ 总体 11/11 (100%) 🎉 ｜ **M13 用量泛化 7/7 ✅**（2026-08-06~07）｜ **M14 hook 自动注册 ✅**（2026-08-07）｜ **M15 厂商 host 归并 + 内置 registry ✅**（2026-08-07）｜ **M16 Sessions 页迭代 ✅**（2026-08-07~08）｜ **M17 详情重构+上下文表+单卡审批+API精简 ✅**（2026-08-08 commit a32bb96：C1 + 4 并行 B + 集成 E2E + review 修复）

**当前阶段**：**M17 Sessions 详情重构 + 上下文长度表 + 单卡审批 + API 精简**（规模档 L / 推进档高速档，2026-08-08 起）
- ① Sessions 详情下沉为二级页面（点击才加载）；② 去掉详情"最近对话"；③ /clear 后详情清空 + 新任务/子Agent 实时同步（搭载 sessions:updated 3s 推送重拉）；④ 自动审批从全局改单卡片（按会话维度）；⑤ API Usage 只展示无需手动配置的卡（隐藏百炼等 missing-config/待凭证）；⑥ 设置去掉用量源管理，改"模型上下文长度"表（可编辑，存 config.yaml context_lengths，新模型成功调用按厂商 registry 自动入表，ctx% 改读此表）；⑦ 设置齿轮图标 flex 居中
- 视觉基准：docs/prototype-sessions-v2.html + docs/prototype-ctx-settings-v1.html（已入库，用户确认）
- **蓝图勘误**：用户原话"基于 API 的 URL"更新上下文长度，但 parseSessionFile 不读 base_url、cc-switch SELECT_CALLED 无 model 列 → 改按**模型名前缀**匹配厂商 registry（registry 仍按 URL host 组织于 VENDOR_TEMPLATES），已确认采用；未来补 cc-switch model 列可切回真 host 匹配
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
- 遗留：~/.config/harness-monitor/monitor.db 有 mock 测试数据（¥50 余额 + 2 条测试审批），真实运行后覆盖；transcript 全读 O(size) v1 可接受（已注释）；3 个真实会话 cwd 均 ~ → name 都显示 cury（basename 按 §6.8.2a，非会话标题）

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
- 背景：用户反馈"sessions 里的会话名称不能全是 cury，得以实际为主"。根因：claude-sessions.ts `name = basename(cwd)`，本机会话 cwd 全为 ~ → 全显 "cury"（M6 完成日志已记录该现象，当时按 §6.8.2a 字面实现）
- 数据源调查（主对话实测）：① transcript JSONL 首条 user 记录即会话真实主题（string 或 text block 数组；tool_result 回传 type 亦为 "user" 但无 text 块须跳过；首条常被 `<system-reminder>` 追加包装）② session json 自带 name 字段（interactive 会话为 "cury-49" 类派生名，区分度有限，作回退）
- 实现（开发+测试合并 subagent，S 档不单开 review，主对话 diff 复核）：
  - 命名优先级链：**transcript 首条可读用户消息 → json name → basename(cwd) → 'unknown'**
  - `firstUserText()`：openSync+readSync **头部限读 64KB**（首条消息必在头部几 KB；transcript 可达数十 MB，绝不全文读）逐行 parse
  - `toTitle()` 共用清洗：整段剥除 `<system-reminder>` 与 `<local-command-caveat>`、剥斜杠命令 4 标签留内部文本（`<command-name>/loop</command-name>` → "/loop"）、取首个非空行、空白折叠、超 60 字符截断 + "…"
  - parseSessionFile 重构：findTranscript 一次定位，头读（取名）与尾读（ctxPct）共用路径
  - 审批匹配改 name / basename(cwd) / sessionId 三者任一（旧语义超集，approve.sh 主路径仍走 session_id）
- 验收全绿：build 三入口 + 双 typecheck 零错误；裸 node 真实数据——3 会话名互不相同（"~/harness-monitor"（本会话首条消息）/ "当前开了全局代理，浏览器访问网址出问题" / "/clear"），全唯一、≤61 字符；**主对话独立复跑确认 + ctxPct 8/5/27 非零（尾读链路重构无回归）**；7 组边界用例 PASS（tool_result 跳过 / reminder 剥后空跳过 / 截断 / 双级回退 / 多行取首行 / json name 截断 / 三路审批匹配）
- 蓝图勘误（已回写 DESIGN）：§6.8.2a name 字段规则改为命名链；§6.12 SessionInfo.name 注释同步。**实现期新发现**：`<local-command-caveat>` 整段占据首条 user 记录（原始调查 4 标签清单未覆盖），与 system-reminder 同列整段剥除
- 约束遵守：用户常驻实例（pid 427464，18456）全程未触碰，验收仅走裸 node；GUI 肉眼确认待用户重启实例
- 收尾三件套：① commit 3b0693e ✅ ② 无新起实例、无孤儿 ✅ ③ 本日志 ✅

### 2026-07-31 12:46:03 ｜ 归档后修订 ｜ 会话卡片 6 项反馈修复轮 完成（cdf4130 + a0086b0）
- 背景：用户实测反馈 6 项——① /clear 会话常驻需去除 + 会话路径未按实际展示 ② glm-5.2 API 不对 ③ Tool 应只有 claude-code 出卡 ④ 关闭按钮应关终端窗口而非杀对话 ⑤ 打开终端应跳转已有窗口而非新开 ⑥ 终端出现 command 审批时工具未同步
- 主对话只读调查定根因（关键发现）：
  - /clear 会话 = `kind:"bg"` 后台任务会话（带 jobId，长期驻留 sessions 目录）
  - session json 的 cwd 恒为启动目录（~），但 **transcript 每条记录自带 cwd 字段且随实际工作目录动态更新**——尾读真值即 ~/harness-monitor
  - 本机经本地代理 **cc-switch**（127.0.0.1:15721）转发，transcript 末条 `message.model` = **qwen3.8-max-preview**（API 实际返回）；settings 的 `ANTHROPIC_DEFAULT_SONNET_MODEL_NAME=glm-5.2` 是陈旧代理别名（旧实现真源）
  - **#6 根因：~/.claude/settings.json 从无 hooks 配置**——approve.sh（d4264c6）只入库未注册，审批提示从未到达应用
  - 终端环境：gnome-terminal **原生 Wayland**（X11 侧不可见），系统无公开 API 聚焦指定窗口；xdotool/wmctrl 未装
- 实现（两轮串行 subagent，文件域隔离；主对话 diff 复核 + 裸 node 独立复跑）：
  - **#1a** parseSessionFile 增 kind 过滤（存在且非 interactive → 跳过；缺失放行兼容旧版）
  - **#1b/#2** `usedTokens` 重构为 `tailFacts`——单次 256KB 尾窗读逆扫**同时提取三事**（usedTokens 语义逐字不变 / lastCwd / lastModel，三量独立累积、齐备提前退出，零新增 IO）；显示 cwd = lastCwd → json cwd 降级；apiProvider = lastModel → settings 降级；ctxPct 窗口判定**仍由 settings modelId 驱动**（transcript 模型 id 经代理改写不含 [1m]，误用则偏差 5 倍）
  - **#3** tool 徽章固定值 `'Bash'` → `'Claude Code'`（harness 身份；前端仅徽章一处引用，审批匹配不依赖）
  - **#4** session:terminate 语义重做：`closeTerminalOfPid`（/proc/<pid>/fd/0 → /dev/pts/N → rdev → 枚举同 tty_nr 进程集 → SIGTERM 集合中 ppid 不在集内的根 shell → 模拟器关窗/标签 → claude 随 pty hangup 退出）；守卫 pid<=0/自身/init；无控制终端 → false + UI 行内"无终端窗口"；IPC 返回 boolean
  - **#5**（用户裁决方案 A：X11 精确聚焦 + Wayland 开窗到项目路径）`focusExistingTerminal`：command -v 检测 xdotool（**可选依赖不强装**）→ ppid 上行找终端祖先（TERMINAL_COMMS 白名单）→ search --pid 取窗（多窗口按标题含 basename(cwd) 筛选）→ windowactivate；失败降级既有 spawn 链（F2 后 cwd 已是真实项目路径）；IPC 签名 (cwd, pid?)
- 验收全绿（两 subagent + 主对话复跑）：build 三入口 + 双 typecheck 零错误；裸 node 真实数据——**仅剩 1 卡**（bg 被滤）、cwd=~/harness-monitor、apiProvider=qwen3.8-max-preview、tool=Claude Code、ctxPct 14 无回归；closeTerminalOfPid script 假终端 5/5（true+2s 全组消失 / 无 tty false / 守卫 false）；findTerminalAncestor(本会话 pid)→gnome-terminal- + shim 假 xdotool 8 组断言（多窗口标题筛选命中 222 / 单窗 / 全不匹配取首 / search 空 false / 无 xdotool false）
- **实现期新发现（均已代码注释 + 蓝图回写）**：
  - Linux comm 受 TASK_COMM_LEN 限 **15 字符**——gnome-terminal-server 在 /proc stat 中为截断形 `gnome-terminal-`，TERMINAL_COMMS 须含截断形（否则祖先查找必 null）
  - `statSync().rdev` 与 stat field 7 `tty_nr` 同为 old_encode_dev 编码（pts/1 实测同值 34817），可直接 === 比较
- **蓝图勘误（本次已同步回写 DESIGN / REQUIREMENTS）**：§6.8.2b kind 过滤 + cwd 尾读真源；§6.8.2f apiProvider 真源改 transcript message.model（settings 降级）；§6.8.4 聚焦优先 + 开窗降级二段（xdotool 可选依赖 / comm 15 字符截断）；§6.11 jump-terminal 签名 (cwd, pid?) + terminate 语义变更；§6.12 SessionInfo cwd/apiProvider/tool 注释；§7 preload 双签名；§6.13.5 hook timeout 70；REQUIREMENTS FR-2.4/2.7/2.8 修订
- 约束遵守：两轮 subagent 全程未触碰用户实例（其间用户自行换实例 427464→436959）；~/.claude 只读（hook 注册归主对话，见下条）
- 收尾三件套：① commit cdf4130 + a0086b0 ✅ ② 无新起实例/无孤儿 ✅ ③ 本日志 ✅
- 遗留：#6 hook 注册 + 端到端 / 用户实例重启载新构建（10:27 实例为修复前构建）——随下条日志收口

### 2026-07-31 13:31:16 ｜ 归档后修订 ｜ #6 hook 注册 + 审批全链路闭环
- 注册：~/.claude/settings.json 增 `hooks.PreToolUse`（matcher Bash → `~/harness-monitor/resources/hooks/approve.sh`，**timeout 70000**）；原 settings.json 备份为 `settings.json.bak-20260731`
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
  - 终端**不弹**（RAN）：`echo hi`、`pwd`、`which ls`、`du -sh ~`
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

## M13 用量视图泛化（多 provider 阶段，2026-08-06 启动 · 08-06 重构定稿）

> 规模档：**L** ｜ 推进档位：**高速档**（用户选定分模块 subagent 推进）
> 背景：用量视图当前为 DeepSeek 单 provider 硬编码（余额卡 + 30 天趋势）。用户要求泛化为**已调用过的 API 的余量展示**。
> **08-06 重构定稿（用户确认，取代原消耗卡思路）**：
>   - 展示模型：**API Usage 只显示「调用过的 API」**相关卡片。每卡 = 一个 API，计费形式区分 **按量消费（payg）** 与 **订阅消费（subscription）**。
>   - 卡片两类：**余量卡**（配置齐全 + 凭证正常，按量=剩余金额 / 订阅=剩余套餐额度，带计费徽章 + 30 天趋势）；**槽位卡**（已调用但缺配置/缺凭证，卡内引导跳设置页填写参数，无数据也展示）。
>   - **泛化核心**：quota-reader 注册表（http-json 通用适配器：GET+鉴权+JSON路径提取+limit 自动算剩余，覆盖 90% 厂商零代码；特殊签名厂商如阿里云 BSS / 百炼套餐写小适配器挂入）。
>   - **「调用过」检测器注册表（detectors.ts，可插拔）**：cc-switch 检测器（读 proxy_request_logs，无 db 自动跳过）∪ claude-sessions 检测器（扫会话记录 model 名，任何 Claude Code 用户都有 ~/.claude/）∪ manual 检测器（配置声明，恒生效兜底）。**前端不展示检测源细节，后端自动按规则合并降级**（用户拍板）。
>   - 数据源已核实：DeepSeek 余额 `api.deepseek.com/user/balance`（M8 已工作，¥10.77）；百炼为 token-plan 订阅（cost=0）；用户实际 provider：DeepSeek（按量 1116 请求）+ 阿里云百炼 token-plan（订阅 3190 请求）。
> 反膨胀：百炼套餐专属 API 端点/凭证待用户提供（无则订阅卡留空态待端点，先搭框架）。

### M13 状态总览

| 模块 | 状态 | 单测 | Code Review | 完成时间 | 备注 |
|------|------|------|-------------|---------|------|
| M13.1 配置模型扩展 | ✅ 完成 | 通过 | 通过(轻量) | 2026-08-06 15:20 | commit 4329c0b；usage_sources 计费/接入/提取 + detection 注册表 |
| M13.2 检测器注册表 | ✅ 完成 | 通过 | 通过(轻量) | 2026-08-06 15:40 | commit c8643aa；cc-switch/transcript/manual 合并降级 |
| M13.3 quota-reader 注册表 | ✅ 完成 | 通过 | 通过(轻量) | 2026-08-06 16:00 | commit 14fa809；http-json 通用 + bss 签名 + subscription 占位 |
| M13.4 db 扩展 | ✅ 完成 | 通过 | 通过(轻量) | 2026-08-06 16:30 | commit 91835dd；billing/unit 列 + 幂等迁移 + 单卡查询 |
| M13.5 调度泛化 | ✅ 完成 | 通过 | 通过(轻量) | 2026-08-06 16:50 | commit 450dcb8；startUsageChecker 多卡 + 全局最低告警线 + per-card 告警 |
| M13.6 IPC + 多卡 UI | ✅ 完成 | 通过 | 通过(轻量) | 2026-08-07 10:30 | commit 51d588d；多卡渲染 + 槽位卡引导 + 用量源表单 + Tailwind 坑 |
| M13.7 文档 + 集成测试 | ✅ 完成 | 通过 | E2E 即验收 | 2026-08-07 11:20 | commit 383697c；E2E 6/6 + 接入指南 + 原型入库 |

**遗留项登记表（M13 新增）**
| 项 | 来源 | 计划收口 | 状态 |
|----|------|---------|------|
| 百炼套餐专属 API 端点/凭证 | M13.3 | 用户提供后核销 | 🔄 待用户 |
| 百炼 BSS AccessKey（按量路径） | M13.3 | 用户提供后核销 | 🔄 待用户 |
| cc-switch-usage.ts（M13b 遗留） | M13.2 | 改造为 cc-switch 检测器 | ⏳ |
| 消耗卡 trend 图 | 反膨胀裁剪 | 延后 | ⏳ |
| cc-switch 表结构耦合（升级改表） | M13.2 | 读取端 try/catch（NFR-3） | ⏳ |

---

### 2026-08-06 11:28 ｜ M13 ｜ 评估 + 蓝图确认
- 现状核实：用量视图 = DeepSeek 单 provider 硬编码（deepseek.ts 写死 `balance_infos[0].total_balance`）；cc-switch 本地代理 127.0.0.1:15721 路由到 DeepSeek + 阿里云百炼（glm-5.2/qwen3.8-max 均在百炼，`sk-sp-` token）
- 数据源核实：cc-switch `proxy_request_logs` 5046 条真实请求级用量（provider/model/tokens/total_cost_usd/created_at）；阿里云 BSS `QueryAccountBalance`（HMAC-SHA1 RPC 签名）
- 反膨胀结论：用户实际 provider（DeepSeek + 百炼）均为**按量计费**，无"订阅 5h/7d 窗口"；消耗卡改从 cc-switch 日志聚合
- 用户决策（AskUserQuestion）：① 消耗卡数据源 = 读 cc-switch 日志 ② 百炼余额 = 本期就做（需 BSS AccessKey）③ 推进方式 = 分模块 ④ 百炼凭证 = 稍后用户提供（已告知 https://ram.console.aliyun.com/manage/ak 获取，需 `AliyunBSSReadOnlyAccess`）
- 蓝图：见上方 M13 状态总览 + 模块表

---

### 2026-08-06 15:20:14 ｜ M13.1 ｜ 配置模型泛化 完成（commit 待补）
- 派发：开发+测试合并 subagent；注入类型契约（BillingMode/HttpJsonSource/BssSource/SubscriptionSource/DetectionConfig）
- 产出：types.ts 删 ApiBalanceSource/BssBalanceSource/CcSwitchConfig，新增可插拔联合类型；config.ts DEFAULT_CONFIG 同步（DeepSeek http-json + 百炼 subscription 占位 + detection 段）；config.yaml 同步
- 验证全绿：npm run build 三入口零错误 + 双 typecheck 零错误；裸 node loadConfig() 6 组断言全过（字段齐全/detection 存在/providers.deepseek 保留/cc_switch 顶层清除）；grep 旧类型无残留
- 关键约束遵守：providers.deepseek 过渡保留（M13.5 调度泛化才移除，不破坏现有编译）；M8 类型原样保留
- 偏离：无。说明：裸 tsc -p tsconfig.web.json 报 TS6307 属存量基线（项目 typecheck 脚本带 --composite false）
- 蓝图勘误：无
- 收尾三件套：① commit 4329c0b ② 无新起实例、无孤儿 ③ 本日志 ✅

### 2026-08-06 15:40:12 ｜ M13.2 ｜ 检测器注册表 完成（commit 待补）
- 派发：开发+测试合并 subagent；注入 detect_ids 桥接设计（cc-switch provider_id ≠ usage_sources.id）
- 产出：types.ts 各 Source 加 detect_ids + 新增 CalledApi；cc-switch-usage.ts 加 detectCalled（按 provider_id COUNT join name）；detectors.ts 新建注册表（manual 恒生效 + cc-switch 可选 + claude-sessions 扫 model）；config.ts/config.yaml 加 detect_ids（DeepSeek:'default'，百炼两 UUID）；electron.vite.config 加 detectors 入口
- 验证全绿：build 三入口 + 双 typecheck 零错误；真实 cc-switch 库 detectCalled 6 条（百炼 3313 / DeepSeek 1116 + transcript 2 model + manual 2 source），python3 真源对照一致；无 cc-switch 降级（enabled:false 与 db_path 不存在两态均跳过不崩）；碰撞合并 4/4
- 关键处置：better-sqlite3 为 Electron ABI，用 `ELECTRON_RUN_AS_NODE=1 electron` 跑验收（不占端口、不触碰用户实例）；实测 session json 无 model 字段 → transcript 尾部 256KB 逆扫（独立轻量实现，与 tailFacts 同源）
- 桥接预演：deepseek↔default(cc-switch)、aliyun-bailian↔c3c29ba1…(cc-switch) 匹配成立；1373c51d(AIgC) 零调用不出卡（符合"调用过才出卡"）
- 偏离：输出排序任务书未规定，自定 evidence 优先级→calls 降序→id 升序（确定性）
- 收尾三件套：① commit c8643aa ② 无新起实例、无孤儿 ③ 本日志 ✅

### 2026-08-06 16:00:41 ｜ M13.3 ｜ quota-reader 注册表 完成（commit 待补）
- 派发：开发+测试合并 subagent；注入 kind 分发 + QuotaInfo 统一类型 + JSON 路径提取契约
- 产出：quota-reader.ts（约 330 行）——readQuota(source) 按 kind 分发；http-json 适配器（bearer/none + getPath 点号+数组下标 + limit 自动算剩余 + 15s 超时）+ aliyun-bss（阿里云 RPC HMAC-SHA1 签名 + QueryAccountBalance 解析 AvailableCashAmount）+ subscription 占位（空 url→null）；electron.vite.config 加 quota-reader 入口
- 验证全绿：build 三入口 + 双 typecheck 零错误；**真实 DeepSeek 余额 10.77 CNY**（key 经 ~/.bashrc 注入，未入代码/文档/提交）；getPath 10 例边界；limit mock 400；失败态全 null 不抛；**BSS 签名与阿里云官方文档向量 OLeaideS1JvxuMvnyHOwuJ+uX5qY= 一致 + python3 hmac 双重对照**；mock BSS 解析 88.88 CNY；subscription 空 url→null——共 51/51 断言
- 偏离：无（BSS 无真实 AK 联调过，代码注释已标明首次真实调用需核对时钟/AK 权限）
- 遗留：百炼套餐端点（subscription 占位）、BSS AccessKey 待用户提供
- 收尾三件套：① commit 14fa809 ② 无新起实例、无孤儿 ③ 本日志 ✅

### 2026-08-06 16:30:51 ｜ M13.4 ｜ db 扩展 完成（commit 待补）
- 派发：开发+测试合并 subagent；注入 billing/unit 维度 + 幂等迁移契约
- 产出：db.ts——api_usage 加 billing/unit 两列（新库直出 + migrateApiUsageColumns 幂等迁移 PRAGMA+ALTER）；recordUsage 扩为可选 6 参（缺省 '' 兼容旧 4 参调用方）；RawUsageRow/toUsageRecord 透传；新增 getLatestUsageByProvider（单卡查询）；types.ts UsageRecord 加可选 billing/unit
- 验证全绿：build 三入口 + 双 typecheck 零错误；迁移幂等（旧库加列 + 连续 3 次 initDB 无重复 + 新库直出）；6 参/4 参落库均正确；getLatestUsageByProvider 取最新；get30DayBalance 回归（provider 过滤互不串扰）；python3 sqlite3 10 行逐条核对——共 19 项断言
- 运行时验证：better-sqlite3 为 Electron ABI，tsc 单独编译后 electron 跑测试脚本
- 偏离：无（迁移函数命名 migrateApiUsageColumns 私有方法，与 initDB 生命周期一致）
- 收尾三件套：① commit 91835dd ② 无新起实例、无孤儿 ③ 本日志 ✅

### 2026-08-06 16:50:31 ｜ M13.5 ｜ 调度泛化 完成（commit 待补）
- 派发：开发+测试合并 subagent；注入 UsageCard 类型 + buildUsageCards 契约 + 全局最低告警线设计
- 产出：types.ts 增 UsageCard（ok/missing-config/missing-credential/error 四态）；services.ts startUsageChecker 泛化（buildUsageCards/buildSourceCard 导出 + per-card 告警 + 模块级卡片缓存 getUsageCards）；index.ts 去 DeepSeekProvider 接线；server.ts 全局最低告警线（min 所有 source.warn_threshold）；ipc usage:get→UsageCard[]、usage:history 收 sourceId；config 增 usage_poll_interval_min:1；notifications.ts notifyUsageLow（per-card 附名+余量）；**deepseek.ts 删除**（grep 无引用）
- 验证全绿：build 三入口 + 双 typecheck 零错误；真实 config → DeepSeek 卡 ok（remaining=10.44 CNY、warnThreshold=10）+ 百炼 missing-config（"未配置订阅端点"）+ 3 张 transcript 槽位卡 + 六参落库；缺凭证 → missing-credential + missingHint 正确；托盘色多卡（任一卡<全局线→红，红>橙不破）；per-card 告警独立/恢复重置/幂等；usage:updated 收到合法 UsageCard[]；deepseek.ts 无残留——调度器 E2E 16/16 + 单元 28 断言全绿
- 核验方式：tsc 编译至 gitignored out/m135-test + ELECTRON_RUN_AS_NODE=1 electron 跑（Electron ABI）；mock HTTP 驱动真实 startUsageChecker 全链路
- 备注：首轮测试挂 6 条为测试脚本自身期望值错误（A 卡持续低位不重复告警属正确；槽位卡混入 payload 属预期），修正后全绿，非代码问题
- 蓝图勘误：无（computeTrayColor 签名不变，warnThreshold 语义改全局最低线，注释已注明）
- 收尾三件套：① commit 450dcb8 ② 无新起实例、无孤儿（pgrep 匹配为命令自身 shell 包装）③ 本日志 ✅

### 2026-08-07 10:30:12 ｜ M13.6 ｜ IPC + 多卡 UI 完成（commit 待补）
- 派发：开发+测试合并 subagent；**两次中断**（API 502 在 Tailwind 排查时 / 续接后正常收尾），均 SendMessage 续接原 agent（07-29 纪律）
- 产出：preload/d.ts getUsageData→UsageCard[]、getBalanceHistory(sourceId)、onUsageUpdated→UsageCard[]；useUsageData 多卡 state + config 派生 defaultThreshold 兜底线；**UsageCardCard.tsx 新建**（四形态卡：ok/missing-config/missing-credential/error + 计费徽章 + 按需趋势模块缓存）；UsageView 多卡渲染 + onOpenSettings 钩子；SettingsView 用量源管理卡（列表+运行时状态标记 + 新增/编辑表单 kind 联动 + focusUsageSource 聚焦）；App settingsFocus state 传递消费清除；globals.css M13.6 段
- 验证全绿：build 三入口 + 双 typecheck 零错误（主对话独立复验）；隔离实例 GUI 实测（HOME=/tmp + port 18599，未触碰用户实例 18456）——多卡渲染（DeepSeek ¥9.78 + 百炼槽位 + 2 测试卡）/ 30 点趋势 / 缺凭证态 missingHint / 跳设置聚焦（编辑表单预填）/ 表单新增编辑写回 reschedule / 计费徽章蓝绿 / 低余量红字真实触发
- **【环境坑·Tailwind 3.4】`@layer components` 内类名字符串未在源码字面出现即被构建剥离**：`usage-badge-${card.billing}` 模板拼接 → usage-badge-payg/subscription 被丢弃（零报错、运行时无样式）。修复：`BILLING_BADGE_CLASS` 字面映射（UsageCardCard 导出，SettingsView 复用），构建后逐类核对全在
- 偏离：limit 字段按实际类型为 JSON 点号路径字符串（quota-reader 对 remaining.limit 做 getPath，非数值）；低余量判定用 per-card warnThreshold（config 最低线仅兜底）
- 清理：验证实例 18599/9223 已释放，无孤儿；用户实例未触碰（18456 = pid 596626 health OK）；/tmp/hm-m136-home 已删
- 收尾三件套：① commit 51d588d ② 无新起实例、无孤儿 ③ 本日志 ✅

### 2026-08-07 11:20:44 ｜ M13.7 ｜ 文档 + 集成测试 完成（commit 待补）
- 集成测试派发 subagent（后台），主对话同步写文档；测试结束 6/6 全过，无新缺陷
- **E2E 验收（隔离实例 HOME=/tmp/hm-m137-home + port 18601 + CDP 9225，用户实例 18456 未触碰）**：
  ① 检测全链路：detectCalled 8 条（百炼 cc-switch 3462 + DeepSeek 1431 + 3 transcript model + manual 3 项）；AIgC 零调用不出卡 ✓ ② 卡片生成：6 卡齐渲染（DeepSeek ok ¥8.58~9.01 + 百炼 missing-config + OpenRouter Mock ok + 3 transcript 槽位卡），db 落库 billing/unit ✓ ③ **泛化核心实证**：GUI 新增 http-json 源（mock {usage:100,limit:500}）→ saveConfig → reschedule → 新卡 Live $400.00（500−100 自动算）——"别人加新厂商零代码"成立 ✓ ④ 槽位卡跳设置聚焦（编辑表单预填 + 新增表单 name 预填）✓ ⑤ 回归全项：审批流（approve→respond→落库 tool/allowed/时间戳）/ Sessions 真实卡 / **托盘色 D-Bus 像素实测 红#ff5252→绿#00e676→橙#ffab00→绿→红**（改阈值 10→5→10 全程联动）/ 单实例锁 / SIGTERM 零残留 ✓ ⑥ 7 张截图
- 无新缺陷；既有已知项 P3-5（server.ts 审批侧旧阈值快照，主对话已裁定不修）再次观察到，未改代码
- 文档产出：**API_USAGE_GUIDE.md**（接入指南：http-json 零代码配置示例 ×3 + JSON 路径语法 + 适配器/检测器扩展示例 + FAQ）+ DESIGN.md v3.4 头部变更注记 + 原型 prototype-api-usage.html 入库
- 环境坑（测试侧）：① 窗口 blur→hide + GNOME 焦点争夺致测试窗中途隐藏（pin + second-instance wake 解决）② pkill 自匹配陷阱再现两次 ③ 用户实机操作会点到 alwaysOnTop 测试窗
- 清理：隔离实例 SIGTERM 终止、18601/18699/9225 全释放、/tmp/hm-m137-home + 测试脚本/日志已删（含 M13.6 漏删的 /tmp/hm-m136.log）；截图保留 /tmp/hm_m137_*.png；用户实例 18456（pid 596626）未触碰 health 正常；仓库 config.yaml 未污染
- 收尾三件套：① commit 383697c ② 无孤儿（用户实例健康在听）③ 本日志 ✅

---

**D1/D2/D3/D4 延后项暂缓**（M13 优先，用户本次指令）。原"下一步"文案见 git 历史。

### 2026-08-07 09:47:25 ｜ 归档后修订 ｜ M14 PreToolUse hook 自动注册 完成（commit 7066f03）
- **背景**：~/.claude/settings.json 的 hooks 段再次被外部清空（08-06 曾发生一次，当时人工重注册；见 M12 环境坑①）→ server 健康在听但收不到任何审批请求，审批链路第一环静默断开且无告警。用户要求启动时幂等自注册，根治该回归
- **产出**：
  - src/main/hook-installer.ts（79 行）：`ensureHookRegistered(settingsPath, approveScriptPath)` 幂等合并——读 settings JSON，已含指向 approve.sh 的 PreToolUse 条目（按 command 路径尾部匹配）则不动，否则追加；保留 env/model 等既有配置，绝不整体覆盖
  - 注册参数沿用镜像轮定稿：matcher ''（全工具中继 §6.13.2）+ timeout **70000ms**（＞curl -m 65 ＞ server 60s auto-deny；毫秒单位坑见 07-31 排障实录）
  - src/main/index.ts（+15）：启动生命周期接线，app ready 后调用
- **降级语义（NFR-3）**：settings 不可读/不可写/JSON 损坏 → console.warn + 静默跳过，不阻断应用启动（审批是可降级功能，退化到终端原生询问，安全无害）
- **验收**：build + 双 typecheck 零错误；幂等（重复调用 settings 字节不变）/ 未注册追加 / 损坏 JSON 降级不抛等裸 node 断言通过（hook-installer 纯 node + 单文件定点写，可离线自测）
- 收尾三件套：① commit 7066f03 ✅ ② 用户实例未触碰 ✅ ③ 本条日志为 08-07 15:20 会话启动收尾时**补记**（原会话未回写，违反收尾三件套，已登记教训）✅

### 2026-08-07 11:31:00 ｜ M15 ｜ 厂商（URL host）归并 + 内置厂商 registry 完成（commit 193a0e5）
- **背景**：API Usage 视图按 model 名拆卡，deepseek-v4-flash-0731 / qwen3.8-max-preview（实际走百炼端点）被拆成独立槽位卡。用户要求：**一个真实调用 URL = 一张余量卡**，走同一 URL 的 model 不拆卡；仅成功调用出卡；DeepSeek 等只需 key 的厂商零配置直接展示余量
- **实测数据**：cc-switch proxy_request_logs 里两 model 的 provider_id 都是百炼（c3c29ba1-...）：deepseek-v4-flash-0731(598 成功) / qwen3.8-max-preview(2658 成功)——顶了 deepseek 前缀的 model 名，实际走 `token-plan.cn-beijing.maas.aliyuncs.com`；providers 表 settings_config.env.ANTHROPIC_BASE_URL 是真实厂商 URL
- **产出**：
  - cc-switch-usage.ts：`urlHost()`（URL→hostname，去端口）、`getProviderHostMap()`（provider_id→{host,name}，解析 settings_config 取 BASE_URL）、detectCalled 改按 host 归并（同 host calls 累加）+ **status_code 2xx 成功过滤**；getConsumption 同步成功过滤
  - detectors.ts：claude-sessions 检测器改读 settings base_url → hostname（不再扫 transcript model）；**跳过本地代理 host**（127.0.0.1/localhost/0.0.0.0/::1，本机有 cc-switch 时 settings 是代理地址）；删 transcript 尾读/glob 辅助
  - **vendor-registry.ts 新建**：`VENDOR_TEMPLATES` 静态表 + `matchVendor(host)`，首批只放 DeepSeek（经实测），其余注释占位不塞猜测值
  - services.ts：buildUsageCards 匹配加 **url host 匹配**（有 url 的 source 自动按 host 吸收）+ **registry fallback**（未配置时命中内置模板→自动出余量卡，零配置）
  - config.yaml + config.ts DEFAULT_CONFIG：aliyun-bailian detect_ids 两 UUID→改 host；deepseek 删 detect_ids（url host 匹配兜底）
- **验证全绿**：
  - typecheck node+web + electron-vite build 零错误
  - 裸 node：urlHost/matchVendor 全过；python 复现 host 归并——百炼两 provider 合并 calls=3364 + DeepSeek 1446，**无 model 名卡**
  - **隔离实例 GUI（CDP 9333）实测**：正常 config → DeepSeek 余量卡 ¥8.37 + 百炼订阅·未配置（detect_ids=host 桥接）；**无 model 名卡、无 127.0.0.1 代理垃圾卡**；零配置（删 deepseek source）→ registry fallback 自动出 DeepSeek 余量卡 ✓
- **【环境坑·urlHost 返坑】**：`new URL().host` 对 `http://127.0.0.1:15721` 返回 `127.0.0.1:15721`（**带端口**），LOOPBACK 匹配不上 → 首次 GUI 验证出现 127.0.0.1:15721 垃圾卡。改 `.hostname`（去端口）后消失。真实厂商 URL 无端口，hostname 即正确归并键
- 收尾：用户实例 PID 738520 health OK；commit 193a0e5 ✅；本日志 ✅

---

## M16 Sessions 页迭代（2026-08-07 启动 · 08-08 完成）

> 规模档：**L** ｜ 推进档位：**高速档** + C 方案契约先行并行（C1→B1∥B2→M16.5）
> 背景：用户要求 Sessions 页升级——看到每个会话的任务执行情况（任务进度 / 父子 agent 协作 / 对话情况），
> 保证会话健康 + 上下文超限前的提醒和建议。原型 prototype-sessions-v1.html（仅真实落地功能，已入库）。
> 用户拍板：去掉 F5 告警块里的"跳转终端/开新会话"按钮；窗口 420；阈值写死 80%；F5 只做卡片内警示（不碰托盘色链）。

### 状态总览

| 模块 | 状态 | 验证 | 完成时间 | 备注 |
|------|------|------|---------|------|
| C1 契约层 | ✅ | build+typecheck 绿 | 2026-08-07 16:05 | commit 4e65d4f；types/preload/d.ts/config 窗口420 |
| B1 后端增量扫描器 | ✅ | 裸node 21/21 + typecheck | 2026-08-07 16:20 | session-detail.ts；taskId 真源勘误 |
| B2 前端重构 | ✅ | 主对话接管 GUI E2E | 2026-08-08 00:08 | SessionCard + 三子组件；subagent 网关报错接管 |
| M16.5 集成 E2E | ✅ | 隔离实例 CDP 全项 | 2026-08-08 00:11 | F1–F5 全过；commit dd2f51f |

### 2026-08-07 16:05 ｜ C1 ｜ 契约层 完成（commit 4e65d4f）
- types.ts：SessionInfo 增 `currentAction: {kind:'tool'|'waiting'; label:string}|null`；新增 SessionTask/SubAgentRef/SessionMessage/SessionDetail 载荷
- preload + electron.d.ts：新 `sessions:detail(sessionId)` invoke
- config.ts + config.yaml：window 默认 340→420
- 契约冻结（build + 双 typecheck 绿）；claude-sessions 先加 `currentAction:null` 占位过编译，B1 填真源

### 2026-08-07 16:20 ｜ B1 ｜ 后端增量细节扫描器 完成（subagent + 主对话 diff 复核）
- **session-detail.ts 新建**（SessionDetailScanner）：每会话增量缓存（tasks/agents/pendingTools/pendingTaskCreates/messages 环形 N=50 + knownSize/knownIno）。scan 只读新增 delta（openSync/readSync 从 knownSize 偏移，换行对齐）；**compact 重写（size 回退/inode 变化）→ 全量重建**；getDetail/getCurrentAction 只读缓存不重读 transcript。容量上限 512 会话 LRU 淘汰。
- claude-sessions.ts：注入 detailScanner，parseSessionFile 调 scan + getCurrentAction 填 SessionInfo（try/catch 降级 null，NFR-3）。**tailFacts/scanTailFacts/usedTokens 一字未动**（ctxPct 不变量 B 零回归）。
- ipc-handlers.ts：`sessions:detail`（sessionId 非 string/空 → 空载荷）；index.ts 实例化 + 双路注入。
- **测试 21/21**（裸 node 编译 out/m16-test + electron 跑）：真实 transcript（aa331775）3 条任务 status 逐条核对 / 真实 Agent 派发 done / messages 环形上限 / 合成 currentAction 状态机（tool→waiting→用户打断清 pending→null）/ compact 全量重建等价性 / 增量分片≡全量深度相等 / 边界。
- **蓝图勘误（taskId 真源，关键）**：蓝图写「TaskCreate tool_use id 即任务 id」，实测 TaskUpdate.input.taskId 是顺序编号 "1"/"2"/"3"（toolu_* 永不匹配），编号真源在 TaskCreate 的 tool_result 文本 "Task #N created" → 本实现以 tool_result 编号为准，解析失败降级 tool_use id。**另**：currentAction 判「存在任一未回应 tool_use」，且用户新文本消息（不含 tool_result）清除陈旧 pending（Esc 打断后永无 result 的漂移）。

### 2026-08-08 00:08 ｜ B2 ｜ 前端重构（subagent 两次 API 网关报错后主对话接管）
- SessionCard.tsx：F1 状态行（tool→蓝 spinner "正在运行 <label>" / waiting→黄 "⏸ 等待用户输入" / null 不渲染，位于徽章行下 lastActivity 上）+ **F5 告警块**（ctxPct≥80 → 红块"⚠ 上下文即将耗尽 (N%)"+建议文案，无按钮）+ 展开开关 + 详情区（sessions:detail 按需拉取，结果驻留 state 收起再展开不重复请求；loading/error/空 sessionId 空态）。
- 三子组件：TaskList（完成数/总数+绿进度条+三态条目，空态"无任务清单"）/ AgentPanel（类型首字母头像+type+description+运行中/已返回，空态"无子 Agent"）/ MessageTail（深色终端风 user 红/assistant 蓝，空态"无近期对话"）。类名全字面量（避 Tailwind 3.4 剥离坑）。
- globals.css：+351 行（action-row/ctx-warn/session-detail/detail-sec/task-*/agent-*/msg-* 等）。
- **B2 执行中断 3 次**（同为 `reasoning_effort` 参数被网关 400 拒绝，非代码问题）；SendMessage 续接两次仍复现 → 主对话接管剩余验证。代码已在工作区，编译绿 + CSS 类全在（构建产物逐类核对，主对话补了缺失的 `.detail-sec` 最小定义）。

### 2026-08-08 00:11 ｜ M16.5 ｜ 集成 E2E 通过（隔离实例 HOME=/tmp/hm-m16-home + port 18599 + CDP 9334）
- **F1** currentAction 真数据：/api/sessions 里两真实会话均 `{"kind":"waiting","label":"等待用户输入"}`（idle），DOM 显"⏸ 等待用户输入" ✓
- **F2** 展开首卡：TaskList 空态"无任务清单"（该会话无任务工具，正确降级）✓
- **F3** AgentPanel：4 个**真实子 Agent**（Explore×3 + Plan×1，含 description，全"已返回"）✓
- **F4** MessageTail：真实对话尾流（CLAUDE 行）+ 空态 ✓
- **F5** 合成高 ctx 会话（/tmp/hm-m16-fake，usage 850000 token → 1M 窗口 85%）：DOM 显"Ctx: 85%" + 红块"⚠ 上下文即将耗尽 (85%)"；真实会话 20%/22% 无告警 ✓
- **窗口 420**：截图 840×1300 = 420×650 的 2x，确认生效 ✓
- 回归：build + 双 typecheck 绿；2 张截图 /tmp/hm_m16_collapsed_warn.png / expanded_detail.png
- **清理**：隔离实例 SIGTERM、/tmp/hm-m16-home+fake+cdp 脚本+日志全删、18599/9334 释放。

### ⚠ 本会话事故记录（必须整改）
- **pkill -f 误杀用户常驻实例**：隔离实例与用户实例都从 ~/harness-monitor 启动，`pkill -f 'harness[-]monitor'` 同时匹配两者 → 用户 18456 实例被误杀。已用真实 HOME 重启恢复（health 200，现跑含 M16 的新构建）。**教训：清理验证实例必须用精确 pid 或隔离标识（如 HOME 环境变量路径特征），严禁裸 `pkill -f` 该项目名**（PROGRESS 既有 pkill 自匹配陷阱①②亦未预防此横向误杀）。真实 monitor.db 未受影响（隔离实例走 /tmp HOME，651KB 完好）。
- **B2 subagent 网关报错**：`reasoning_effort` 参数被 400 拒绝，3 次（SendMessage 续接 2 次仍复现）→ 主对话接管验证。非代码问题；高速档纪律"SendMessage 续接"在此失效于网关层，改为主对话接管，未另起炉灶。

- 收尾三件套：① commit 4e65d4f（C1）+ dd2f51f（B1/B2/E2E）✅ ② 无孤儿（用户实例 18456 health OK，隔离实例已清）③ 本日志 ✅
- 遗留：四态灯原"执行中/空闲"语义与 F1 currentAction 并存（不冲突，F1 更细）；aiTitle 会话名升级（C1 顺带发现，未做，延后）；上下文告警阈值写死 80（进配置延后）。

---

## M17 Sessions 详情重构 + 上下文长度表 + 单卡审批 + API 精简（2026-08-08 完成）

> 规模档：**L** ｜ 推进档位：高速档 ｜ 契约先行（C1 → 4 并行 B → 集成 E2E → review 修复）
> 视觉基准：docs/prototype-sessions-v2.html + docs/prototype-ctx-settings-v1.html（用户确认）
> 七项改动：① 详情下沉二级页面 ② 去最近对话 ③ /clear 清空+实时同步 ④ 单卡自动审批 ⑤ API Usage 只展示免配置卡 ⑥ 设置上下文长度表（可编辑，存 config.yaml）⑦ 齿轮居中

### 状态总览

| 模块 | 状态 | 验证 | 完成时间 | 备注 |
|------|------|------|---------|------|
| C1 契约层 | ✅ | typecheck + 裸node | 2026-08-08 11:10 | types/electron.d.ts/preload/config/vendor-registry contextForModel |
| B1 Sessions 后端 | ✅ | 裸node 31/31 + typecheck | 2026-08-08 11:45 | session-detail lastMessageRole + claude-sessions 分层 + server Set + ipc |
| B1 Services 后端 | ✅ | 裸node + typecheck | 2026-08-08 11:45 | auto-populate + missing 卡过滤 |
| B2 Sessions 前端 | ✅ | build + E2E | 2026-08-08 11:45 | SessionDetailPage + SessionCard ⚡ + 删 AutoApproveBar/MessageTail |
| B2 Settings 前端 | ✅ | typecheck 全绿 | 2026-08-08 11:45 | 上下文表 + 删用量源管理 + gear 居中 |
| M17.5 集成 E2E | ✅ | 隔离实例 CDP | 2026-08-08 12:00 | 全项通过 + 修复 scanner config 刷新 bug |

### 2026-08-08 11:10 ｜ C1 ｜ 契约层 完成
- types.ts：SessionDetail 删 messages / SessionMessage 删除；AppConfig 增 context_lengths（ContextEntry{len,source:manual|registry|heuristic}）；SessionInfo 增 lastModel
- electron.d.ts / preload：getSessionDetail 签名不变（type 自动更新）；auto-approve 签名改按 sessionId（见下 review 简化轮）
- config.ts DEFAULT_CONFIG + config.yaml 增 context_lengths: {}（deepMerge 对普通对象 key 级合并且实证通过）
- vendor-registry.ts：VendorTemplate 增 modelContext；DeepSeek（v4-pro/flash→1M）+ 百炼/qwen（→1M）模板；导出 contextForModel（前缀匹配长键优先）
- **加固**：百炼模板 source 用 bearer+未设 env → 走 buildSourceCard missing-credential 分支 → 被 M17.7 过滤（避免 error 卡漏出）

### 2026-08-08 11:45 ｜ 4 并行 B 模块 完成（文件域隔离）
- **B1 Sessions 后端**：session-detail.ts 删 messages ring + 增 lastMessageRole 修复 getCurrentAction waiting 判定（ctxPct 不变量 B 零回归）；claude-sessions.ts contextWindowForModel 分层（config→registry→heuristic）+ lastModel；server.ts autoApprove 全局→Set；ipc-handlers 按会话
- **B1 Services 后端**：services.ts tick 内 auto-populate context_lengths（lastModel 触发，manual 不覆盖）+ buildUsageCards 过滤 missing-config/missing-credential
- **B2 Sessions 前端**：SessionDetailPage 新建（back + TaskList + AgentPanel，无 MessageTail，订阅 onSessionsUpdated 实时重拉）；SessionCard 去 inline expand + 加 ⚡ 单卡审批；SessionsView 持 selectedSessionId + 删 AutoApproveBar；MessageTail 删除
- **B2 Settings 前端**：SettingsView 删用量源管理 + 加模型上下文长度表（编辑即 source=manual）；UsageView/UsageCardCard/App 去 onOpenSettings；globals.css .segment flex 居中

### 2026-08-08 12:00 ｜ M17.5 集成 E2E 通过（隔离实例 HOME=/tmp/hm-m17-home + port 18600 + CDP 9336）
- **F1 currentAction**：waiting/tool 态均正常（lastMessageRole 修复验证）
- **详情页 drill-down**：点「查看更多详情 ▸」→ 二级页（← 返回 + ●实时 + 任务进度 1/3 + 子Agent，**无最近对话**）；返回回列表 ✓
- **/clear 实时同步**：截断 transcript → 4s 内详情页自动从「0/1 旧任务」→「无任务清单」空态 ✓
- **单卡 ⚡ 独立**：点卡片A ON、卡片B OFF；后端 getAutoApprove 独立命中 ✓
- **上下文长度自动入表**：两模型（deepseek/flash, qwen3.8）均 registry → 1M 自动写入 config.yaml ✓
- **manual 不覆盖**：手改 deepseek→200000 manual，4s 后仍 manual 未被自动入表覆盖 ✓
- **ctx% 用 manual 值**：deepseek 会话 ctxPct 5%→25%（200000 分母）✓
- **API Usage 隐藏百炼**：仅 DeepSeek 卡，无百炼、无"配置"按钮 ✓
- **齿轮居中**：.segment display:flex + justify/align center ✓
- **发现并修复真实 bug**：scanner 的 `this.config` 是 readonly 构造时固化，config:save reschedule 只把 fresh 传给调度器、scanner 实例不更新 → 手动编辑 context_lengths 不生效直到重启（旧代码分母硬编码不依赖 config，故此前无此问题，M17 引入）。修复：claude-sessions.ts 加 setConfig + index.ts reschedule 调 sessionScanner.setConfig(fresh)。前台 saveConfig 改值后 ctxPct **实时**更新（无需重启）✓

### 2026-08-08 12:05 ｜ Code Review 批量 1 轮 + 修复
- **【P1 修复】单卡审批 name 键泄漏**：原 sessionId+name 双键进 Set，但 approve.sh 实际发 .session_id（payload.session=sessionId），name 键会造成同名会话（cwd basename 兜底）串扰 + 死会话遗留键被新会话继承。改为**仅按 sessionId 建键**（server/ipc/preload/electron.d.ts/SessionCard 同步简化），端到端重验通过
- **【P2 修复】上下文自动入表语义对齐注释**：改"只写不存在 key"为"**manual 永不覆盖，registry/heuristic 可被新解析精化**"（heuristic 猜的 200K 可在 registry 增补后升级；同值不写避免 churn），与 types.ts 注释一致
- **【P2 修复】空 sessionId 无详情入口**：SessionCard 对 session.sessionId==='' 不渲染「查看更多详情」按钮
- **【P2 接受】设置上下文表不实时刷新**：Settings 挂载读 config，3s 扫描新入表的模型需切 tab 重挂载才显示。低优先，记入遗留

- **遗留**：设置上下文表实时刷新（P2 接受）；百炼若未来补 BSS AccessKey/余量端点可恢复余量卡（M17 已整卡隐藏）；cc-switch 补 model 列后 contextForModel 可切回真 host 匹配（蓝图勘误）

### 2026-08-08 14:42 ｜ 归档后修订 ｜ 审批静默断开根治：hook 主注册位迁移 settings.local.json + fs.watch 覆写自愈 完成（commit a3334b1）

**背景**：用户反馈"审批又不在工具界面弹出"。从第一性原理排查，端到端链路逐步定位断点：
- server 健康在听 18456、POST /approve 入队+respond 正常（server 侧无损坏）
- approve.sh 存在可执行、无 TEMP 直通段残留
- **根因确认**：`~/.claude/settings.json` 的 hooks 段被**整体抹除**（只剩 env+model）→ Claude Code 不再调 approve.sh → 审批请求到不了 server。这是第三次（08-06/08-07/08-08）
- **真凶定位**：cc-switch 日志 `[13:33:03] 代理接管模式：热切换 claude 的目标供应商为 default` ↔ `~/.claude/settings.json` mtime 13:33:47（毫秒级吻合）。cc-switch 热切换 provider 时用其内部 provider 快照（settings_config 只有 env、无 hooks）**整体覆写** settings.json。cc-switch.db providers 表全量核对：所有 Claude provider 的 settings_config 均无 hooks → 覆写必抹
- **M14 局限**：启动时幂等注册只能兜"启动前被清"，兜不住"启动后被覆写"（实例 13:02 启动 → 13:33 被覆写 → 审批静默断开，无任何自愈/告警）

**修复（双保险，用户拍板"迁移+watch"）**：
1. **主注册位迁移** `~/.claude/settings.json` → `settings.local.json`（config.ts/config.yaml settings_path 默认同步）。实测 Claude Code 2.1.207 从**用户级** settings.local.json 加载 hooks（官方文档标 "project only"，实测用户级生效，以实测为准）；cc-switch 不碰此文件 → 从源头免疫覆写。hooks 跨层级合并，同一 approve.sh 严禁同时注册两文件（双执行→双卡/双落库），故主注册位固定 local
2. **fs.watch 覆写自愈**：hook-installer 新增 `startHookWatcher`（监听 ~/.claude/ 下 settings.json + settings.local.json，任一外部覆写后防抖 500ms 自动 ensureHookRegistered 补注册）。断链窗口从"直到重启"压到几百 ms。will-quit 释放 watcher

**验证全绿**：
- 隔离实测：Claude Code 2.1.207 从用户级 settings.local.json 加载 hooks 生效（审批记录 id=1366 实证：settings.json 无 hooks 仍走审批）
- 自愈单测：外部清空 settings.local.json hooks → watch 自动补注册恢复（PASS）；settings.json 不被污染（hooks 不双注册）✅
- 构建 + 双 typecheck 零错误；真实审批链路：我的会话命令走 hook→server→落库 allowed=1 全通
- 当前审批链路已恢复（settings.local.json 主注册位，Claude Code 热加载，无需重启实例）

**收尾三件套**：① commit a3334b1 ✅ ② 用户实例 932736 未触碰（旧构建，审批已通；watch 逻辑待实例重启后加载）✅ ③ 本日志 ✅
**遗留**：用户实例重启后 watch 自愈生效（下次自然重启即加载新构建）；DESIGN §6.13/§6.5 已同步注册位描述

---

### 2026-08-10 00:42 ｜ 归档后修订 ｜ 四项 UI 需求轮 完成（commit b535a18）

**背景**：用户 2026-08-08 提出 4 项改动——① 去掉审批历史 ② session 名称与终端窗口标题一致 ③ 上下文长度表：100% 有把握的（registry）行不支持编辑，需用户确认的才支持编辑，且支持选单位 M/K，字段值带单位展示 ④ 所有展示的模型支持折叠/展开。

**需求澄清（AskUserQuestion 用户拍板）**：
- ② 名称格式 = **完整终端标题** `user@host: dir`（如 `cury@<hostname>: ~/harness-monitor`）
- ④ 折叠语义 = **整表折叠**（像原审批历史那样整体 toggle，默认展开）

**技术边界（关键）**：本机 Wayland 下应用**无法直读真实终端窗口标题**——GNOME Shell `Introspect.GetWindows` 被 AccessDenied 拒绝（08-08 实测），xdotool 只对 X11 可见。故按用户 `.bashrc` 的终端标题规则 `\e]0;\u@\h: \w\a`（即 `user@host: 目录`）**推导**：用会话真实 cwd（transcript 尾读 lastCwd → json cwd 降级）+ os 宿主标识。

**实现（主对话直接开发，S~M 档不单开 review agent；4 项全部 CDP 实测）**：
1. **删审批历史**：ApprovalHistory.tsx 删除；SessionsView 引用移除；history:get IPC、getApprovalHistory（preload/d.ts）、db.getRecentApprovals + SELECT_RECENT/ALL + toApprovalRecord + RawApprovalRow + 两条 prepared 语句全删；shared/types.ts ApprovalRecord 类型删除。**保留 recordApproval 唯一落库点 + approval_history 表**（审批镜像不变量 A 不受影响）。globals.css history-* 类删除（.chevron 保留供 ④ 复用）。
2. **session 名称**：claude-sessions.ts 显示名改 `user@host: cwd`；宿主标识（userInfo().username + hostname()）模块级缓存一次，失败回退 process.env.USER/'host'。**删除命名链死代码**：firstUserText/toTitle/HEAD_BYTES/TITLE_MAX 全删（openSync/readSync/closeSync import 保留——tailFacts 尾读仍用）。cwdName（basename 匹配）保留仅供审批匹配旧语义兼容。
3. **上下文长度表**：`ContextEntry` 增可选 `unit?: ContextUnit`（'M'|'K'，len 恒存原始 token 数）。SettingsView：**registry 行只读**（无单位选择器、无输入框，右对齐展示 `formatLen` 带单位文本如 "1M"，title 提示完整 tokens）；manual/heuristic 行可编辑 + K/M 单位分段切换（`changeCtxUnit` 仅换算展示值、len 不变、立即落盘持久化单位偏好）。`commitCtxLen` 改按所选单位换算回原始 token 落盘；编辑仍强制 source='manual'。
4. **整表折叠**：ctx 卡片加 `.ctx-toggle` 折叠头（复用 .chevron，默认展开 `ctxOpen=true`），折叠态隐藏副说明与全部行。

**验收（隔离实例 HOME=/tmp/hm-m18-home + port 18650 + CDP 9388，用户实例 18456 未触碰）**：
- 合成会话（真实 pid + 隔离 cwd）→ `/api/sessions` 显示名 = `cury@<hostname>: ~/isolate-demo` ✓（需求②）
- CDP 读 DOM：ctx 表 2 行（registry `deepseek-v4-flash` 只读显示 "1M" 无单位选择器 / heuristic `some-unknown-model` 可编辑 + 单位 K 激活 + 输入 200）✓（需求③④）
- 折叠 toggle：rows 2→0→2，aria-expanded true→false→true ✓（需求④）
- 单位切换 K→M：value 200→0.2，config.yaml 落盘 `unit: M` ✓（需求③）
- 真实键盘事件编辑（0.8 + Enter）：反馈"已保存 ✓"，config.yaml `len: 800000, source: manual, unit: M` —— **编辑强制 source=manual 验证** ✓（需求③）
- 构建 + 双 typecheck 零错误；构建产物 CSS 无 history- 类残留、新 ctx 类全在 ✓

**清理**：隔离实例 1016928 精确 kill（非 pkill -f），18650/9388 释放，/tmp/hm-m18-home + cdp 脚本 + 截图删除；用户实例 18456 全程未触碰 health OK。

**收尾三件套**：① commit b535a18 ✅ ② 无新起实例、无孤儿 ✅ ③ 本日志 ✅
**遗留**：用户实例重启后载新构建生效（名称/上下文表/折叠均为渲染端 + 主进程改动，需重启）；DESIGN.md 待同步（§6.8.2a 命名链、§6.12 SessionInfo.name / ContextEntry.unit、§6.11 history:get 通道）

### 2026-08-10 08:54 ｜ 归档后修订 ｜ M18 回滚 → 恢复 全过程记录（commit 47dbd01 → 再恢复）

**时间线（三次操作，日志随 revert 波动，本条统一记录终态）**：
- **00:42** M18 完成（b535a18，见上条），重启验证生效
- **08:50** 用户要求「回滚到上一版本」→ `git revert --no-edit b535a18`（47dbd01，11 文件恢复 M17），实例重启验证生效
- **08:56** 用户「还是恢复那四项改动吧」→ `git revert --no-edit 47dbd01`（本次，代码文件干净恢复 M18；仅 docs/PROGRESS.md 因补记的回滚日志与恢复内容重叠产生冲突，本段即冲突解决结果）

**冲突解决**：保留 M18 完成日志（上条）为主体；本条记录回滚→恢复的全过程。**保留 M18 提交 b535a18 与回滚提交 47dbd01 于历史**（未强删任何提交）。

**恢复后状态**：代码 = M18 四项改动（删审批历史 / session 名称对齐终端标题 / 上下文表 registry 只读 + M-K 单位 + 整表折叠）；实例待重启加载新构建（见收尾）。

### 2026-08-10 11:22:29 ｜ 归档后修订 ｜ API Usage 空白根因定位 + 带 key 重启恢复 完成

**用户反馈**："API Usage 是空的，请恢复"。

**根因定位（第一性原理排查，未动任何代码）**：
- 运行实例（今早 10:41 由 systemd --user 后台拉起，pid 1069136/1069143）启动时**无 DEEPSEEK_API_KEY 环境变量**——父进程链到 `/usr/lib/systemd/systemd --user`（2202，7-22 起），非交互 shell 不加载 ~/.bashrc
- 无 env → buildSourceCard（services.ts:108）判 missing-credential → M17.7 过滤（services.ts:220）隐藏 → API Usage 空。**这是 M17 需求⑤"只展示免配置卡"与后台无 key 启动叠加的结果**，非代码回归
- 证据链：`/api/usage` 最新快照停在 08-09 01:32（实例从未成功写库）／ 日志仅 server 监听行无任何 quota 报错（缺 env 静默早退特征）／ 带 key 实测 `readQuota` 返回 ¥4.30、curl 余额端点 200

**恢复（用户拍板：重启实例加载 key）**：
- 精确 SIGTERM pid 1069136（will-quit 清理链），端口 18456 释放、无残留进程
- key 从 ~/.bashrc:136 显式提取（`.bashrc` 头部 `case $- in *i*) ;; *) return;;` —— 非交互 `source` 会直接 return，不能依赖 source；命令文本不含 key 明文、env 不暴露于 ps）
- setsid 脱离 + nohup + `electron . --disable-gpu --in-process-gpu` 重启，日志 /tmp/harness-monitor.log

**验证全绿**：health 200 ／ `/api/usage` 返回 11:22:03 新快照 ¥4.17（DeepSeek 卡 ok 落库）／ sessions 端点 200 ／ 新实例 pid 1086203 健康在听 18456

**收尾三件套**：① 本次仅运维操作，无代码改动、无 commit ② 无孤儿（新实例健康在听）③ 本日志 ✅
**遗留/经验**：后台拉起实例必须显式注入 env（或写 systemd unit 的 Environment=）；M17.7 过滤把"缺 key 的余量源"静默隐藏，用户端表现为"空白"而非提示——是否给 missing-credential 出提示卡，延后评估

### 2026-08-10 11:28:25 ｜ 归档后修订 ｜ <synthetic> 占位模型回填上下文表根因定位 + 修复 完成（commit 438a966）

**用户反馈**：模型上下文长度表里出现一个 `<synthetic>`（拼作 "sybthetic"）。

**第一性原理根因链（实测证据，未假设）**：
1. `<synthetic>` 是 **Claude Code 写入 transcript 的合成占位模型 id**（非真实模型），出现在两类记录：
   - API 调用失败：`isApiErrorMessage:true` + `apiErrorStatus:400`（实测 08-06 传入不存在模型 `deepseek-v4-flash-0731` 被拒 400，5 条）
   - 无响应请求：`isApiErrorMessage:false` + content "No response requested."（6 条）
   - 全仓 transcript 共 32 条 `<synthetic>`，是唯一占位符形式（尖括号包裹 vs 真实模型字母数字/点/连字符）
2. **scanTailFacts 无差别捕获**（claude-sessions.ts:309-314）：`message.model` 非空 string 即设为 lastModel，不识别占位符 → 会话尾部恰是失败记录时 lastModel="<synthetic>"
3. **sessionScanner 自动回填**（services.ts:309-323）：contextForModel("<synthetic>") 不命中 → 启发式 200000 → 落盘 `context_lengths["<synthetic>"]={len:200000, source:'heuristic'}`
4. 设置页把它当模型名渲染 → 用户看到 `<synthetic> | heuristic | 200000` 行

**修复（两层，均实测）**：
- **第一层（数据源，根治）**：scanTailFacts 捕获 lastModel 时**跳过尖括号占位符**（`!m.includes('<') && !m.includes('>')`），继续逆扫找更早真实模型；找不到 → null → 调用方降级 settings modelId（ctxPct 分母 / apiProvider 两消费链均有 `?? model.*` 降级，验证安全）
- **第二层（防御）**：services.ts 自动回填前过滤尖括号占位符，防漏网
- 尖括号特征而非硬编码 "<synthetic>"——天然覆盖未来其它占位符形式

**验证全绿**：
- build 三入口 + 双 typecheck 零错误
- 裸 node 模拟修复后解析：5 个污染会话（尾部恰为 synthetic）逆扫跳过占位符，1 个找回真实模型 `deepseek-v4-flash`，5 个正确降级 null
- 清理脏数据：`~/.config/harness-monitor/config.yaml` 删除 `<synthetic>` 条目
- 重启实例（新 pid 1092738）：10s 后 config.yaml 无 synthetic 回填（0 clean）／ `/api/sessions` 两会话 lastModel 均 `deepseek-v4-flash` 无占位符 ／ ctxPct 13%/14% 正常 ／ usage+sessions 端点 200

**收尾三件套**：① commit（claude-sessions.ts + services.ts + 本日志，见 git log）② 无孤儿（新实例健康在听 18456）③ 本日志 ✅
**遗留**：历史 transcript 中的 `<synthetic>` 记录是数据源原始产物（Claude Code 行为），不清理；harness-monitor 不再捕获回填即可

### 2026-08-10 13:43:57 ｜ 归档后修订 ｜ Session 名称改为「最近用户消息」动态标题 完成（commit a6a048d）

**用户诉求**：界面上 session 名称应与"当前窗口名称"一致（如 `*API usage...`），核心目标是**通过名称判断大概在跑什么任务**；期望**动态变化**（针对最新对话总结题目）且**不消耗 API token**。

**第一性原理调研（先验证可行性）**：
- Wayland + GNOME 下读真实窗口标题**全部通道实测均不可行**：gnome-terminal 是 Wayland 原生（X11 xwininfo 不可见）、GNOME Shell `Introspect.GetWindows` AccessDenied、gnome-terminal DBus 只暴露 Exec/ChildExited 无标题属性、AT-SPI 无服务。用户看到的 `*API usage...` 是终端标签页标题（`*`=手动改标签标记），只存于合成器，应用不可读
- 但 transcript 里的**真实用户文本消息**（message.content 为 string）天然反映任务内容：`~` 会话显示"你看下运行本地的hermes…"、本会话显示"界面上sessions的名称…"——**这就是"判断在跑什么任务"的可读真源**

**实现（S~M 档，主对话直接开发 + 真实数据验收，零 token 本地方案）**：
- `TailFacts` 增第五事 `lastUserText`（scanTailFacts 逆扫 ⑤）：取最近一条**真实用户文本消息**——判别 `message.role==='user' && typeof message.content === 'string'`（tool_result 的 content 是 block 数组，天然排除；历史 firstUserText 用 `record.type==='user'` 过滤会误吞 tool_result，本次用 content 类型判别更正确）
- **宽窗兜底（关键）**：实测活跃会话最新用户消息可深达 **600KB+**（尾部被 tool_result 占满），256KB 尾窗扫不到 → 新增 `lastUserTextWide` 用 **2MB 独立窗口**专扫（`USER_TEXT_TAIL_BYTES=2097152`，仅缺失时触发，常规路径仍是单次 256KB 读零回归；2MB 尾读约 0.2ms 本机实测可忽略）
- `toTitle` 恢复（M18 删除的清洗函数，60 字符截断；toActivity 同源规则）；删 `TERMINAL_TITLE_USER/HOST` 及 userInfo/hostname import（孤儿）
- 名称合成：`tail.lastUserText → basename(cwd) 兜底`（替换 M18 的 `user@host: cwd`）

**验收全绿（真实数据 + 隔离测试）**：
- build 三入口 + 双 typecheck 零错误
- 隔离实例 3 场景：① 尾窗内用户消息命中（"修复审批超时问题"）② 600KB tool_result 挤出 → **宽窗兜底命中**（"界面上名称要对齐终端窗口"）③ 无用户文本 → basename(cwd) 降级（"cury"）
- 真实实例重启（pid 1136544）后 `/api/sessions`：本会话名称 = "界面上sessions的名称应该和当前窗口名称一致，比如当前窗口名称是*API usage..."（= 当前任务，动态）；另一会话 = "你的会话ID是什么"（该会话最近用户消息）

**收尾三件套**：① commit（claude-sessions.ts，见 git log）② 无孤儿（新实例健康在听 18456）③ 本日志 ✅
**遗留**：DESIGN.md §6.8.2a 命名链描述待同步（M18 改 user@host 时的回写也需复核）；长 idle 会话名称反映最近任务、非首条——符合"动态"诉求，用户接受

### 2026-08-10 14:09:15 ｜ 归档后修订 ｜ M19 卡片执行动作 + 详情动态消息 完成（commit 12e54e5）

**用户诉求**：① 会话卡片展示"正在执行的动作"（更直观）② 详情页展示**近 3 条**动态消息（对话 + 操作）。

**原型确认**：docs/prototype-sessions-v3.html（v3 相对 v2：① 卡片动作行新增 **agent 态**——紫色「Agent」徽章 + spinner，子 Agent 运行中展示"正在运行 Plan · 设计详情页"而非空转 ② 详情页新增「动态消息」板块，深色终端风近 3 条，USER 红 / CLAUDE 蓝 / TOOL 绿 / AGENT 紫）。用户确认"可以这样"。

**数据源现状核实**：
- ① 卡片执行动作**已有基础**：`session.currentAction`（M16）只推导 tool/waiting 两态。缺口是**agent 态**——Agent 派发本身算 pending tool_use，显示成裸 "Agent" 无描述。
- ② 详情动态消息**数据源不存在**：M17.1 把 messages 从 SessionDetail 契约整个删除（当时是 50 条全量对话）。本次加近 3 条轻量尾流，体积小一个数量级。

**实现（S~M 档主对话直接开发 + 独立单测 + 隔离实例 GUI E2E）**：
- **types.ts**：`currentAction` 增 `{kind:'agent', label}` 态；新增 `SessionFeedItem`（kind: user/assistant/tool/agent + text）；`SessionDetail` 增 `messages: SessionFeedItem[]`
- **session-detail.ts**：
  - 动态消息尾流 `feed: SessionFeedItem[]` 环形缓冲（FEED_MAX=3），数组按真实插入序 = 展示序；user 文本（无 tool_result 块）/ assistant 文本 / tool_use 操作行（Bash/Read 摘要，其余工具名）/ Agent 派发（`<type> · <description>`）混排入流；compact 重写全量重建时清空复位
  - **元工具（TaskCreate/TaskUpdate）不产生操作行**（无用户可见动作），但仍是 pending（currentAction tool 态不受影响）
  - **Agent 不再进 pendingTools**（否则显示裸 "Agent" 遮住 agent 态；tool_result 到达时 delete 不存在键无害）
  - `getCurrentAction` 三态扩展：① pending tool_use → tool ② 否则 running 子 Agent（取最近派发者 type+description）→ agent ③ 否则 assistant 收尾 → waiting ④ null
- **ipc-handlers.ts**：sessions:detail 空载荷补 messages:[]（typecheck 必改）
- **ActivityFeed.tsx 新建**：详情页「动态消息」板块，复用 globals.css 孤儿 `.msg-*` 类（M17.1 删 MessageTail 后遗留），补 tool 绿 / agent 紫 who 配色
- **SessionCard.tsx**：action-row 增 agent 态分支（紫色徽章 + spinner，同 tool 布局）
- **SessionDetailPage.tsx**：ok 态追加 ActivityFeed 板块
- **globals.css**：`.action-row.agent` / `.action-agent-badge` + `.msg-line.tool` / `.msg-line.agent` 配色

**验收全绿**：
- build 三入口 + 双 typecheck 零错误（含 m19-test 独立编译）
- **单测 out/m19-test/test.js 16/16 PASS**：环形 3 条混排/agent 派发→currentAction agent 态/Agent result 后 null（lastMessageRole=user，M17 语义）/pending tool 优先于 agent/Bash 摘要/无 description 仅类型名/元工具不入流/TaskCreate 仍驱动 tool 态/compact 复位/键集含 messages/空载荷
- **真实数据只读验收**：本机 3 个真实会话 messages 尾流正常（tool/assistant 混排近 3 条）、currentAction 正常、无 running agent 时无 agent 态
- **隔离实例 GUI E2E**（HOME=/tmp/hm-m19-home + port 18700 + CDP 18701，合成会话含真实 pid + Bash/Agent 派发 transcript）：卡片 `action-row agent` + "Agent" 徽章 + "正在运行 Plan · 设计动态消息组件" ✓ 详情页动态消息 3 条（TOOL Bash / AGENT Plan / CLAUDE 已派发）✓ 三板块齐全 ✓

**收尾三件套**：① commit 12e54e5（8 文件 +670/−13）✅ ② 隔离实例精确 pid 清理、18700/18701 释放、/tmp/hm-m19-home+脚本+截图全删、用户实例 18456（pid 1136544）全程未触碰健康在听 ✅ ③ 本日志 ✅
**遗留**：DESIGN.md §6.8 待同步（currentAction agent 态 + messages 尾流回归，此前 M17.1 的"messages 已移除"描述需修订）；用户实例重启后载新构建生效（卡片 agent 态 + 详情动态消息均为渲染端 + 主进程改动）；真实运行中验证 agent 态观感（本次用合成会话验证，真实 Agent 派发需实例重启后自然观察）

### 2026-08-10 14:22:51 ｜ 归档后修订 ｜ M19.1 任务清单清理 + 动态消息置顶/自动滚动 完成（commit 134a1e3）

**用户诉求**（三项）：① 新的任务清单出现 → 旧任务数据清掉 ② 详情动态消息默认定位最新（新消息出现自动滑动到最佳展示位置）③ 动态消息在详情中置顶。

**需求澄清（AskUserQuestion 用户拍板）**：「新任务清单」触发信号 = **两者都要**——transcript 重写（/clear、/compact）+ 新任务编号回退都算新一轮。

**关键调研（真实 transcript）**：TaskCreate 编号在单个 transcript 内**单调递增不重置**（1→2→3→…→14），/clear 或 /compact 后编号回到 1。故「新 TaskCreate 编号 ≤ 已见最大编号」= 新一轮任务清单的可靠信号。

**实现（S~M 档主对话直接开发 + 单测 + 隔离 GUI E2E）**：
- **session-detail.ts**：
  - SessionCache 增 `maxTaskNum`（当前轮最大真实任务编号）；**compact 重写不清零**（保留识别回退的依据），新缓存创建才为 0
  - applyToolResult 配对 TaskCreate 时：`num ≤ maxTaskNum` → `c.tasks.clear()`（新一轮清空旧任务）+ 更新 maxTaskNum。覆盖两种触发：/clear、/compact（重写后残留旧任务编号回退 → 清空，只留新轮）
- **SessionDetailPage.tsx**：详情页板块顺序调整——动态消息置顶（原在最后），任务进度/子 Agent 后移
- **ActivityFeed.tsx**：`logRef` + useEffect `[items]`——挂载滚到底（默认定位最新）+ items 更新（3s 推送/详情重拉）再滚底，`.msg-log`（max-height:150px 内部滚动）最新一条始终在可视区

**验收全绿**：
- build 三入口 + 双 typecheck 零错误
- **单测 out/m19-test 20/20 PASS**（新增 T6/T7）：
  - T6：首轮 3 任务累积 → TaskUpdate 生效 → 编号回退 1 → 旧任务清空只留新任务 ✓
  - T7：首轮 5 任务 → compact 重写（残留旧任务编号 1 + 新轮编号 1）→ maxTaskNum 保留识别回退 → 旧任务残留清空只留新轮 ✓
- **隔离实例 GUI E2E**（HOME=/tmp/hm-m191-home + port 18750 + CDP 18751，合成会话含首轮 3 任务 + 多轮动态消息）：
  - ① 详情页板块顺序 `["◎动态消息","✓任务进度","◈子Agent协作"]`（置顶生效）✓
  - ② 追加新任务（编号回退 1）→ 任务清单 3→1 只剩「新一轮任务甲」（清旧生效）✓
  - ③ 追加 20 条长消息触发 `.msg-log` 溢出（179>150）→ `atBottom:true` + `scrollTop:29` 最新条贴底可视（自动滚动生效）✓

**收尾三件套**：① commit 134a1e3（3 文件 +33/−4）✅ ② 隔离实例精确 pid 清理、18750/18751 释放、/tmp/hm-m191-home+脚本全删、用户实例 18456 健康在听（未触碰）✅ ③ 本日志 ✅
**遗留**：用户实例重启后载新构建生效（M19.1 三项均为渲染端 + 主进程改动）；DESIGN.md 待同步（同 M19 遗留）

### 2026-08-10 14:33:33 ｜ 归档后修订 ｜ M20 移除 SessionCard 关闭/打开终端按钮 + 后端 IPC 链路 完成（commit 7cbca30）

**用户诉求**：去掉 close terminal 和 open terminal 两个按钮。

**方案（AskUserQuestion 用户拍板「按钮 + 后端链路全删」）**：两个按钮是跳转终端（FR-2.7）与关闭终端（F3）的**唯一 UI 入口**，去掉后后端链路无消费方，连根删除不留死代码（同 M18 删审批历史口径）。

**改动（6 文件 +8/−504）**：
- **SessionCard.tsx**（−95）：删 header-actions 两个按钮（close terminal / open terminal）+ 孤儿 state（confirmTerm/jumpHint/jumpTimerRef）+ 函数（jump/terminate/showHint）+ 清理 effect + micro-row jumpHint span + JUMP_HINT_MS 常量；import 去 useRef；文件头结构注释更新（Header 只留 ⚡ 自动 pill）
- **globals.css**（−47）：删 .mini-icon-btn 整段（含 danger/confirm 态）+ .jump-hint 段（均仅服务被删按钮）
- **preload/index.ts**（−17）：删 jumpToTerminal / terminateSession 两个方法
- **electron.d.ts**（−4）：删对应两声明
- **ipc-handlers.ts**（−95）：删 session:jump-terminal / session:terminate 两 handler + openTerminal（回退链 kgx→gnome-terminal→xterm）+ commandExists（仅被 openTerminal 用）+ 文件头通道一览更新；import 清 spawn/accessSync/fsConstants/statSync/closeTerminalOfPid/focusExistingTerminal
- **claude-sessions.ts**（−254）：删 closeTerminalOfPid / TERMINAL_COMMS / findTerminalAncestor / focusExistingTerminal 四个函数 + 文件头两大段注释（改为一句移除说明）；import 清 spawnSync/readlinkSync（readdirSync/basename/execSync 仍被 findTranscript/审批匹配/pageSize 用，保留）

**验证全绿**：npm run build 三入口 + 双 typecheck 零错误 ✅；新构建产物 grep 无 jumpToTerminal/terminateSession/Close terminal/Open Terminal/mini-icon-btn/jump-hint 残留 ✅

**收尾三件套**：① commit 7cbca30 ✅ ② 无孤儿（用户实例 18456 pid 1163657 健康在听，全程未触碰）✅ ③ 本日志 ✅
**遗留**：用户实例重启后载新构建生效（渲染端 + 主进程改动）；DESIGN.md 待同步（§6.11 invoke 通道表去两行、§6.13/§6.14 hook 描述、§7 preload、REQUIREMENTS FR-2.7/FR-2.8 需求移除或标记）——注意 FR-2.7/2.8 原为 M11 验收项，去掉入口后这两条需求实质失效，是否从 REQUIREMENTS 降级为延后需用户定夺

### 2026-08-10 14:55:03 ｜ 归档后修订 ｜ 应用显示名 Harness Monitor → SessionBuddy（commit 1a3d51b）

**用户诉求**：项目名/挂件名从「harness-monitor / Harness Monitor」改为 **SessionBuddy**，工具界面名称同步。

**范围（AskUserQuestion 用户拍板「只改显示名」）**：只改用户可见显示名；`~/.config/harness-monitor/` 配置目录、`monitor.db` 路径、config.yaml `harnesses` 技术字段、代码 harness 概念名**一律不动**（现有配置/审批历史原样保留）。

**改动（5 文件，+10/−10）**：
- `WidgetHeader.tsx`（+2/−2）：挂件顶部标题 "Harness Monitor" → "SessionBuddy"（含文件头注释）
- `tray.ts`（+4/−4）：托盘 tooltip、菜单标题项、Quit 项 → SessionBuddy（含菜单结构注释）
- `SettingsView.tsx`（+2/−2）：Quit 按钮文案 + 结构注释
- `index.html`（+1/−1）：`<title>harness-monitor</title>` → `<title>SessionBuddy</title>`（窗口无显式 title，默认取此）
- `server.ts`（+1/−1）：端口占用桌面通知标题 → SessionBuddy

**验证全绿**：npm run build 三入口 + 双 typecheck 零错误 ✅；产物 grep 无 "Harness Monitor" 残留 ✅
**隔离实例 GUI E2E**（HOME=/tmp/hm-sb-test-home + port 18777 + CDP 9333）：
- ① CDP 读挂件 `.widget-title` = "SessionBuddy"、`document.title` = "SessionBuddy" ✓
- ② D-Bus SNI（:1.2316，pid 1183363）托盘 tooltip = "SessionBuddy"；菜单 GetLayout 逐项 `SessionBuddy / Show Dashboard / Hide Dashboard / Active Agents / (none) / Quit SessionBuddy` ✓

**收尾三件套**：① commit 1a3d51b（5 文件 +10/−10）✅ ② 隔离实例精确 pid 清理、/tmp/hm-sb-test-home 全删、用户实例 18456 健康在听（未触碰）✅ ③ 本日志 ✅
**遗留**：用户实例重启后载新构建生效（渲染端 + 主进程改动）；docs/ 原型 html 与 CLAUDE.md 内的历史显示名属快照/文档，未批量替换（保持历史可溯）
