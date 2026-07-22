import json
import logging
import os
from datetime import datetime
from pathlib import Path

from harnesses.base import BaseHarness, SessionInfo

logger = logging.getLogger(__name__)


class CodexHarness(BaseHarness):
    """Discovers active Codex CLI sessions from ``~/.codex/sessions/``.

    Returns an empty list gracefully when the directory does not exist
    or when parsing errors occur.
    """

    def __init__(self, sessions_path: str = "~/.codex/sessions/") -> None:
        self.sessions_path = os.path.expanduser(sessions_path)

    async def discover_sessions(self) -> list[SessionInfo]:
        sessions_dir = Path(self.sessions_path)
        if not sessions_dir.is_dir():
            logger.debug("Codex sessions directory not found at %s", self.sessions_path)
            return []

        sessions: list[SessionInfo] = []
        now_ms = datetime.now().timestamp() * 1000

        try:
            for session_file in sorted(sessions_dir.iterdir()):
                if session_file.suffix != ".json":
                    continue
                session = self._parse_session_file(session_file, now_ms)
                if session is not None:
                    sessions.append(session)
        except OSError as exc:
            logger.debug("Error reading Codex sessions directory: %s", exc)
            return []

        return sessions

    def _parse_session_file(self, filepath: Path, now_ms: float) -> SessionInfo | None:
        """Parse a single Codex session JSON file into a ``SessionInfo``."""
        try:
            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            logger.debug("Skipping unreadable Codex session file %s: %s", filepath, exc)
            return None

        pid = data.get("pid")
        if not pid:
            return None

        # --------------------------------------------------------------
        # Process info (RSS memory)
        # --------------------------------------------------------------
        try:
            import psutil
            proc = psutil.Process(pid)
            memory_bytes = proc.memory_info().rss
            memory_mb = memory_bytes // (1024 * 1024)
        except Exception:
            # psutil may not be installed, or process may be gone
            memory_mb = 0

        session_id = data.get("sessionId", "")
        name = data.get("name") or (session_id[:8] if session_id else filepath.stem)
        cwd = data.get("cwd", "")
        status = data.get("status", "idle")
        started_at_ms = data.get("startedAt") or 0
        uptime_seconds = max(0, int((now_ms - started_at_ms) / 1000))

        return SessionInfo(
            name=str(name),
            harness="codex",
            status=str(status),
            cwd=str(cwd),
            task="",
            api_provider="unknown",
            ctx_pct=0,
            memory_mb=memory_mb,
            pid=pid,
            uptime_seconds=uptime_seconds,
        )
