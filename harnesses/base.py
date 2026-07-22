from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class SessionInfo:
    """Represents a discovered harness session (Claude Code or Codex CLI)."""
    name: str
    harness: str
    status: str
    cwd: str
    task: str
    api_provider: str
    ctx_pct: int
    memory_mb: int
    pid: int
    uptime_seconds: int
    has_approval: bool = False
    pending_command: str = ""


class BaseHarness(ABC):
    """Abstract base class for harness session discoverers."""

    @abstractmethod
    async def discover_sessions(self) -> list[SessionInfo]:
        """Return a list of active sessions for this harness type.

        Returns an empty list when the harness data directory does not
        exist, when no sessions are running, or when an error occurs.
        """
        pass
