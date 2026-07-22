"""SQLite database manager for harness-monitor.

Stores API usage records and bash command approval history.
Uses standard-library sqlite3 (no aiosqlite dependency).
"""

import logging
import os
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DB_PATH = os.path.expanduser("~/.local/share/claude-monitor/monitor.db")


class Database:
    """Thread-safe SQLite database with methods for usage tracking and approvals.

    Usage
    -----
    >>> db = Database()
    >>> db.init_db()
    >>> db.record_usage("deepseek", "all", 100.0, "CNY", 0, 50.0)
    """

    def __init__(self, db_path: str | None = None) -> None:
        self.db_path: str = db_path or DB_PATH
        self._conn: sqlite3.Connection | None = None
        self._lock: threading.Lock = threading.Lock()

    def init_db(self) -> None:
        """Create the database directory and tables if they don't exist."""
        db_dir = Path(self.db_path).parent
        db_dir.mkdir(parents=True, exist_ok=True)

        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")

        with self._lock:
            self._conn.execute("""
                CREATE TABLE IF NOT EXISTS api_usage (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    provider         TEXT NOT NULL,
                    model            TEXT NOT NULL,
                    balance          REAL,
                    balance_currency TEXT,
                    today_tokens     INTEGER DEFAULT 0,
                    month_used       REAL DEFAULT 0,
                    timestamp        DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)

            self._conn.execute("""
                CREATE TABLE IF NOT EXISTS approval_history (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    harness      TEXT NOT NULL,
                    session_name TEXT,
                    command      TEXT,
                    cwd          TEXT,
                    allowed      INTEGER,
                    timestamp    DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)

            self._conn.commit()

        logger.info("Database initialised at %s", self.db_path)

    # ------------------------------------------------------------------
    # API usage
    # ------------------------------------------------------------------

    def record_usage(
        self,
        provider: str,
        model: str,
        balance: float,
        currency: str,
        today_tokens: int,
        month_used: float,
    ) -> None:
        """Insert a new API usage record."""
        assert self._conn is not None, "Database not initialised; call init_db() first"
        with self._lock:
            self._conn.execute(
                "INSERT INTO api_usage "
                "(provider, model, balance, balance_currency, today_tokens, month_used) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (provider, model, balance, currency, today_tokens, month_used),
            )
            self._conn.commit()

    def get_latest_usage(self) -> list[dict[str, Any]]:
        """Return the most recent record per (provider, model) pair."""
        assert self._conn is not None
        with self._lock:
            cursor = self._conn.execute("""
                SELECT *
                FROM api_usage
                WHERE id IN (
                    SELECT MAX(id) FROM api_usage GROUP BY provider, model
                )
                ORDER BY provider, model
            """)
            rows = cursor.fetchall()
            return [dict(r) for r in rows]

    def get_30day_usage(self, provider: str, model: str) -> list[dict[str, Any]]:
        """Return daily aggregated token counts for the last 30 days."""
        assert self._conn is not None
        since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        with self._lock:
            cursor = self._conn.execute(
                """
                SELECT DATE(timestamp) AS day, SUM(today_tokens) AS tokens
                FROM api_usage
                WHERE provider = ? AND model = ? AND timestamp >= ?
                GROUP BY DATE(timestamp)
                ORDER BY day
                """,
                (provider, model, since),
            )
            rows = cursor.fetchall()
            return [{"day": r["day"], "tokens": r["tokens"]} for r in rows]

    # ------------------------------------------------------------------
    # Approvals
    # ------------------------------------------------------------------

    def record_approval(
        self,
        harness: str,
        session_name: str | None,
        command: str | None,
        cwd: str | None,
        allowed: bool,
    ) -> None:
        """Record a bash command approval decision."""
        assert self._conn is not None
        with self._lock:
            self._conn.execute(
                "INSERT INTO approval_history (harness, session_name, command, cwd, allowed) "
                "VALUES (?, ?, ?, ?, ?)",
                (harness, session_name, command, cwd, 1 if allowed else 0),
            )
            self._conn.commit()

    def get_recent_approvals(self, limit: int = 20) -> list[dict[str, Any]]:
        """Return the ``limit`` most recent approval records."""
        assert self._conn is not None
        with self._lock:
            cursor = self._conn.execute(
                "SELECT * FROM approval_history ORDER BY timestamp DESC LIMIT ?",
                (limit,),
            )
            rows = cursor.fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def close(self) -> None:
        """Close the database connection."""
        if self._conn is not None:
            self._conn.close()
            self._conn = None
