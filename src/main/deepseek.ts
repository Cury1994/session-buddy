import type { AppConfig, BalanceInfo } from '../shared/types'

/**
 * M6 — DeepSeek 余额查询（DESIGN §6.7 / §5.1）
 *
 * `GET {balance_url}` + `Authorization: Bearer $DEEPSEEK_API_KEY`，15s 超时。
 * 响应 `balance_infos[0].total_balance` 是**字符串**，需 `parseFloat`（§6.7 字段映射）。
 *
 * 错误处理（NFR-3：失败不影响 UI，保留上次数据）：
 *   key 缺失 / 网络错误 / 超时 / 非 200 / is_available=false / JSON 异常 / 金额非法
 *   → console.warn + 返回 null。调用方（services.ts）见 null 则跳过本轮入库与 push，
 *   上一轮快照保留在 db / 渲染端，不做任何 UI 降级动作。
 */

/** DeepSeek GET /user/balance 原始响应（§6.7，仅本模块使用的线格式） */
interface DeepSeekBalanceResponse {
  is_available: boolean
  balance_infos?: {
    currency: string // "CNY"
    total_balance: string // 字符串金额，需 parseFloat
    granted_balance: string
    topped_up_balance: string
  }[]
}

export class DeepSeekProvider {
  private readonly apiKey: string | undefined
  private readonly balanceUrl: string

  constructor(config: AppConfig) {
    this.apiKey = process.env.DEEPSEEK_API_KEY
    this.balanceUrl = config.providers.deepseek.balance_url
  }

  /** 查询余额；任何失败态返回 null（见文件头 NFR-3 约定）。 */
  async checkBalance(): Promise<BalanceInfo | null> {
    if (!this.apiKey) {
      console.warn('[deepseek] DEEPSEEK_API_KEY 未设置，跳过余额查询')
      return null
    }

    let resp: Response
    try {
      resp = await fetch(this.balanceUrl, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(15000)
      })
    } catch (err) {
      // 网络错误 / DNS / 超时（AbortSignal.timeout 抛 TimeoutError）
      console.warn(`[deepseek] 请求失败: ${(err as Error).message}`)
      return null
    }

    if (!resp.ok) {
      console.warn(`[deepseek] 非 200 响应: HTTP ${resp.status}`)
      return null
    }

    let data: DeepSeekBalanceResponse
    try {
      data = (await resp.json()) as DeepSeekBalanceResponse
    } catch (err) {
      console.warn(`[deepseek] JSON 解析失败: ${(err as Error).message}`)
      return null
    }

    if (data.is_available === false) {
      console.warn('[deepseek] 服务不可用 (is_available=false)，保留上次数据')
      return null
    }

    const info = data.balance_infos?.[0]
    if (!info) {
      console.warn('[deepseek] balance_infos 为空')
      return null
    }

    const balance = parseFloat(info.total_balance)
    if (!Number.isFinite(balance)) {
      console.warn(`[deepseek] total_balance 非法: ${String(info.total_balance)}`)
      return null
    }

    return {
      provider: 'deepseek',
      balance,
      currency: info.currency || 'CNY'
    }
  }
}
