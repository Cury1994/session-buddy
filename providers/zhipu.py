import logging
import os
import json
import urllib.request
import urllib.error

from providers.base import BaseProvider, BalanceInfo

logger = logging.getLogger(__name__)


class ZhipuProvider(BaseProvider):
    """Queries the ZhipuAI (BigModel) subscription list API.

    Requires the ``BIGMODEL_COOKIE`` environment variable set to a valid
    login cookie for open.bigmodel.cn.
    Uses stdlib urllib (no aiohttp dependency).
    """

    def __init__(self, balance_url: str = "https://open.bigmodel.cn/api/biz/subscription/list") -> None:
        self.cookie = os.environ.get("BIGMODEL_COOKIE")
        self.balance_url = balance_url

    async def check_balance(self) -> BalanceInfo | None:
        if not self.cookie:
            logger.debug("BIGMODEL_COOKIE not set, skipping Zhipu balance check")
            return None

        try:
            req = urllib.request.Request(
                self.balance_url,
                headers={"Cookie": self.cookie},
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())

                items = data
                if isinstance(data, dict):
                    items = data.get("data", data.get("list", data.get("items", [])))

                if not items:
                    logger.warning("Zhipu subscription API returned empty list")
                    return None

                target_model = "GLM-4-Plus"
                target = None

                for item in items:
                    model_field = (
                        item.get("modelName")
                        or item.get("model")
                        or item.get("name")
                        or ""
                    )
                    if target_model in model_field:
                        target = item
                        break

                if target is None:
                    target = items[0]

                remaining = self._float_field(
                    target, "remainingBalance", "remaining", "surplus", "balance")
                total = self._float_field(
                    target, "totalBalance", "total", "totalBalance")
                used = self._float_field(
                    target, "usedBalance", "used", "consumed")
                currency = target.get("currency", "CNY")

                return BalanceInfo(
                    provider="zhipu",
                    model=target_model,
                    balance=remaining,
                    currency=currency,
                    today_tokens=0,
                    month_used=used,
                    total_budget=total,
                )
        except urllib.error.URLError as exc:
            logger.warning("Zhipu subscription API network error: %s", exc)
        except (KeyError, ValueError, TypeError, IndexError, json.JSONDecodeError) as exc:
            logger.warning("Zhipu subscription API parse error: %s", exc)
        return None

    @staticmethod
    def _float_field(item: dict, *keys: str) -> float:
        for key in keys:
            if key in item:
                try:
                    return float(item[key])
                except (ValueError, TypeError):
                    continue
        return 0.0
