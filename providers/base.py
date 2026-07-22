from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class BalanceInfo:
    """Represents balance information returned by a provider API."""
    provider: str
    model: str
    balance: float
    currency: str
    today_tokens: int
    month_used: float
    total_budget: float


class BaseProvider(ABC):
    """Abstract base class for balance query providers."""

    @abstractmethod
    async def check_balance(self) -> BalanceInfo | None:
        """Query the provider API and return balance info, or None on failure.

        Returns:
            BalanceInfo on success, None if the API key is missing, the
            network request fails, or the response cannot be parsed.
        """
        pass
