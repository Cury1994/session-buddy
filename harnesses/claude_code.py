import json
import logging
import os
import glob
from datetime import datetime
from pathlib import Path

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

from harnesses.base import BaseHarness, SessionInfo

logger = logging.getLogger(__name__)


class ClaudeCodeHarness(BaseHarness):
    """Discovers active Claude Code sessions from ``~/.claude/sessions/*.json``.

    Reads model-to-provider mappings from ``~/.claude/settings.json``
    and estimates context usage by counting lines in the session history
    file when available.
    """

    def __init__(
        self,
        sessions_glob: str = "~/.claude/sessions/*.json",
        settings_path: str = "~/.claude/settings.json",
    ) -> None:
        self.sessions_glob = os.path.expanduser(sessions_glob)
        self.settings_path = os.path.expanduser(settings_path)
        self._model_mappings: dict[str, str] = {}
        self._load_model_mappings()

    # ------------------------------------------------------------------
    # Settings parsing
    # ------------------------------------------------------------------

    def _load_model_mappings(self) -> None:
        """Read ``settings.json`` and extract env-var model-name mappings."""
        try:
            path = Path(self.settings_path)
            if not path.exists():
                return
            with open(path, encoding="utf-8") as f:
                settings = json.load(f)
            env = settings.get("env", {}) if isinstance(settings, dict) else {}
            for key, value in env.items():
                if key.startswith("ANTHROPIC_DEFAULT_") and key.endswith("_MODEL_NAME"):
                    self._model_mappings[key] = str(value)
        except (json.JSONDecodeError, OSError) as exc:
            logger.debug("Could not load Claude settings: %s", exc)

    def _resolve_api_provider(self, _session_data: dict) -> str:
        """Return the API provider string from the first available mapping."""
        for model in ("opus", "sonnet", "haiku"):
            key = f"ANTHROPIC_DEFAULT_{model.upper()}_MODEL_NAME"
            if key in self._model_mappings:
                return self._model_mappings[key]
        return "unknown"

    # ------------------------------------------------------------------
    # Context-usage estimation
    # ------------------------------------------------------------------

    @staticmethod
    def _estimate_context_usage(session_filepath: str, session_id: str) -> int:
        """Try to count messages in the session history and return a pct (0-100)."""
        try:
            session_dir = Path(session_filepath).resolve().parent
            candidates = [
                session_dir / f"{session_id}_history.jsonl",
                session_dir / "history.jsonl",
                session_dir.parent / "history" / f"{session_id}.jsonl",
            ]
            history_file: Path | None = None
            for candidate in candidates:
                if candidate.exists():
                    history_file = candidate
                    break

            if history_file is None:
                return 0

            with open(history_file, encoding="utf-8") as f:
                lines = [line for line in f if line.strip()]

            return min(100, len(lines) * 5)
        except OSError:
            return 0

    # ------------------------------------------------------------------
    # Session discovery
    # ------------------------------------------------------------------

    async def discover_sessions(self) -> list[SessionInfo]:
        sessions: list[SessionInfo] = []

        session_files = glob.glob(self.sessions_glob)
        if not session_files:
            logger.debug("No Claude Code session files found at %s", self.sessions_glob)
            return []

        now_ms = datetime.now().timestamp() * 1000

        for filepath in session_files:
            session = self._parse_session_file(filepath, now_ms)
            if session is not None:
                sessions.append(session)

        return sessions

    def _parse_session_file(self, filepath: str, now_ms: float) -> SessionInfo | None:
        """Parse a single session JSON file into a ``SessionInfo``."""
        try:
            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            logger.debug("Skipping unreadable session file %s: %s", filepath, exc)
            return None

        pid = data.get("pid")
        if not pid:
            return None

        # Process info — use psutil if available, otherwise fallback
        memory_mb = 0
        try:
            if HAS_PSUTIL:
                proc = psutil.Process(pid)
                memory_bytes = proc.memory_info().rss
                memory_mb = memory_bytes // (1024 * 1024)
            else:
                # Fallback: read from /proc/<pid>/status
                with open(f"/proc/{pid}/status") as f:
                    for line in f:
                        if line.startswith("VmRSS:"):
                            memory_mb = int(line.split()[1]) // 1024
                            break
        except (Exception,):
            logger.debug("Process %d is gone or inaccessible", pid)
            # Don't return None for dead process — just set memory to 0
            # The session file may still exist after the process dies briefly

        session_id = data.get("sessionId", "")
        name = data.get("name") or (session_id[:8] if session_id else Path(filepath).stem)
        cwd = data.get("cwd", "")
        status = data.get("status", "idle")
        started_at_ms = data.get("startedAt") or 0
        uptime_seconds = max(0, int((now_ms - started_at_ms) / 1000))
        api_provider = self._resolve_api_provider(data)
        ctx_pct = self._estimate_context_usage(filepath, session_id)

        return SessionInfo(
            name=str(name),
            harness="claude-code",
            status=str(status),
            cwd=str(cwd),
            task="",
            api_provider=api_provider,
            ctx_pct=ctx_pct,
            memory_mb=memory_mb,
            pid=pid,
            uptime_seconds=uptime_seconds,
        )
