import logging
import os
import json
import urllib.request
import urllib.error

from providers.base import BaseProvider, BalanceInfo

logger = logging.getLogger(__name__)


class DeepSeekProvider(BaseProvider):
    """Queries the DeepSeek balance API to retrieve remaining balance info.

    Requires the ``DEEPSEEK_API_KEY`` environment variable to be set.
    Uses stdlib urllib (no aiohttp dependency).
    """

    def __init__(self, balance_url: str = "https://api.deepseek.com/user/balance") -> None:
        self.api_key = os.environ.get("DEEPSEEK_API_KEY")
        self.balance_url = balance_url

    async def check_balance(self) -> BalanceInfo | None:
        if not self.api_key:
            logger.debug("DeepSeek API key not set, skipping balance check")
            return None

        try:
            req = urllib.request.Request(
                self.balance_url,
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
                balance_infos = data.get("balance_infos", [])
                if not balance_infos:
                    logger.warning("DeepSeek balance API returned empty balance_infos")
                    return None

                info = balance_infos[0]
                currency = info.get("currency", "CNY")
                total_balance = float(info.get("total_balance", 0))
                topped_up = float(info.get("topped_up_balance", 0))
                granted = float(info.get("granted_balance", 0))

                remaining = total_balance
                initial_total = topped_up + granted
                consumed = max(0, initial_total - remaining)

                return BalanceInfo(
                    provider="deepseek",
                    model="all",
                    balance=remaining,
                    currency=currency,
                    today_tokens=0,
                    month_used=consumed,
                    total_budget=initial_total,
                )
        except urllib.error.URLError as exc:
            logger.warning("DeepSeek balance API network error: %s", exc)
        except (KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
            logger.warning("DeepSeek balance API parse error: %s", exc)
        return None
