# API 余量接入指南

> harness-monitor 的 API Usage 视图展示**调用过的 API 的余量**（按量消费 = 剩余金额，订阅消费 = 剩余套餐额度）。
> 接入新厂商分两级：**配置驱动零代码**（覆盖 90% 厂商）／ **适配器代码**（特殊签名/会话型厂商）。

---

## 一、快速理解

```
调用过的 API（检测器自动发现 + 手动声明）
   │
   ├─ 已配置 + 凭证齐全 ──→ 余量卡（显示余量 + 30 天趋势）
   ├─ 已配置 + 缺凭证 ────→ 槽位卡「请配置凭证」（提示缺哪个环境变量）
   └─ 已调用 + 未配置 ────→ 槽位卡「新增用量源」（引导跳设置页填写）
```

- **余量卡**：计费徽章（按量/订阅）+ 余量大数字 + 30 天趋势 + 低余量警示
- **槽位卡**：无数据也展示，卡内引导按钮跳设置页填参数，填好后自动变余量卡
- 调用检测由后端自动处理（cc-switch 日志 → Claude 会话记录 → 手动声明，无 cc-switch 自动降级），无需用户配置

---

## 二、零代码接入（http-json，覆盖 90% 厂商）

绝大多数厂商的余量接口是同一形态：**发一个带鉴权的 GET，从 JSON 响应里取一个数字**（DeepSeek / OpenAI / OpenRouter / Gemini / 多数国内厂商都是）。这种只需在设置页或 config.yaml 加一段配置。

### 方式 A：设置页添加（推荐，带引导）

1. 打开应用 → **Settings** → **用量源管理** → **+ 新增用量源**
2. 填写：
   - **名称**：如 `OpenRouter`
   - **计费形式**：按量（余额＝剩余金额）／订阅（剩余套餐额度）
   - **接入方式**：`http-json`
   - **查询 URL**：余量接口地址，如 `https://openrouter.ai/api/v1/auth/key`
   - **凭证**：环境变量名，如 `OPENROUTER_API_KEY`（需先在 shell 里 export 或写进 `~/.bashrc`）
   - **余量提取 path**：剩余值在响应的 JSON 路径（见下）
   - **limit**（可选）：若接口返回 `limit` + `usage` 而非直接剩余，填 limit 的路径自动算 `limit − usage`
   - **单位**：`USD` / `CNY` / `次数` / `token`
   - **告警线**（可选）：低于该值托盘变红 + 桌面通知
3. 保存 → 主进程重调度 → 该厂商立即出余量卡

### 方式 B：直接编辑 config.yaml

```yaml
usage_sources:
  # ── 示例 1：接口直接返回剩余值 ──
  - id: openrouter
    name: OpenRouter
    billing: payg
    kind: http-json
    url: "https://openrouter.ai/api/v1/auth/key"
    auth: { type: bearer, key_env: "OPENROUTER_API_KEY" }
    remaining: { path: "data.usage" }   # 若响应是 {data:{usage:...}}，取 data.usage
    unit: USD
    warn_threshold: 5

  # ── 示例 2：接口返回 limit + usage，自动算剩余（limit − usage） ──
  - id: some-vendor
    name: Some Vendor
    billing: subscription
    kind: http-json
    url: "https://api.example.com/v1/quota"
    auth: { type: bearer, key_env: "SOME_VENDOR_API_KEY" }
    remaining:
      path: "data.usage"      # 已用量路径
      limit: "data.limit"     # 上限路径 → 剩余 = data.limit − data.usage
    unit: token

  # ── 示例 3：免鉴权端点 ──
  - id: public-quota
    name: Public Quota
    billing: payg
    kind: http-json
    url: "https://api.example.com/public/quota"
    auth: { type: none }
    remaining: { path: "remaining_credits" }
    unit: USD
```

### JSON 路径语法（`remaining.path` / `remaining.limit`）

- 点号访问：`data.usage`
- 数组下标：`balance_infos[0].total_balance`
- 数字字符串也会被解析（如 DeepSeek 的 `"10.77"`）

保存后在设置页添加厂商会重调度，槽位卡即时变余量卡。

---

## 三、适配器代码（特殊签名/会话型厂商）

以下情况**必须写一个小适配器**挂进注册表（几十行），无法纯配置：
- 需要签名（阿里云 BSS HMAC-SHA1、AWS SigV4 等）
- 需要会话/cookie 鉴权（如 Claude 订阅页）
- 需要多步请求才能拿到余量

### 结构（`src/main/quota-reader.ts`）

`readQuota(source)` 按 `source.kind` 分发到适配器，所有适配器返回统一 `QuotaInfo`：

```ts
interface QuotaInfo {
  sourceId: string
  name: string
  billing: 'payg' | 'subscription'
  remaining: number   // 剩余值
  unit: string
  currency?: string
  updatedAt: string   // 本地时间
}
```

### 新增适配器步骤

1. 在 `src/shared/types.ts` 加 kind 值 + 对应 Source 接口（如 `kind: 'myvendor'`），并入 `UsageSourceConfig` 联合。
2. 在 `quota-reader.ts` 实现 `readMyVendorQuota(source)`，在 `readQuota` 的 switch 加分支。
3. 任一失败返回 `null`（不抛，UI 显示 error 槽位卡自动重试）。
4. config.yaml 加默认示例源（端点留空占位 → 显示 missing-config 槽位卡引导）。

内置适配器参考：`bss`（阿里云 BSS，含 HMAC-SHA1 签名实现）与 `subscription`（空 url 占位）。

---

## 四、检测器扩展（自定义"调用过的 API"证据源）

默认检测链：**cc-switch 日志** → **Claude 会话记录** → **手动声明**。若要接入其它代理日志/统计源，在 `src/main/detectors.ts` 的 `detectCalled(config)` 内新增一个检测器（参照 `CcSwitchUsageReader.detectCalled` 与 `detectFromSessions`），输出 `CalledApi[]` 即可，卡片生成自动吸收。

---

## 五、常见问题

- **槽位卡显示「待凭证」**：该源已配置但缺少环境变量。在 `~/.bashrc` 加 `export KEY_ENV=xxx` 后重启应用；或设置页改 key_env 名称。
- **槽位卡显示「未配置」**：检测到调用了某 API 但未配置余量查询。点「配置此 API →」进设置页补参数。
- **余量卡显示「查询失败」**：网络/接口变动，应用自动重试，保留上次数据。
- **低余量不告警**：检查 `warn_threshold` 是否设置；托盘红的判定用「全局最低告警线」（所有源告警线的最小值）。
- **如何让「调用过才展示」生效**：默认即启用。某 API 从未被调用则不出卡；配置声明过的源（手动声明）恒出卡。
