#!/usr/bin/env python3
"""harness-monitor HTTP API server.

Runs an aiohttp web server that:
- Exposes balance-usage and active-session data to the GTK tray UI.
- Holds approval requests open (via ``asyncio.Future``) until the user
  responds through the UI.
- Periodically scans for active Claude Code / Codex CLI sessions.
- Periodically checks provider API balances on their configured intervals.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from aiohttp import web

from db import Database
from harnesses.claude_code import ClaudeCodeHarness
from harnesses.codex import CodexHarness
from harnesses.base import SessionInfo
from providers.deepseek import DeepSeekProvider
from providers.zhipu import ZhipuProvider
from providers.base import BalanceInfo

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("harness-monitor")

# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------

pending_approvals: dict[str, dict[str, Any]] = {}  # approval_id -> metadata + Future
active_sessions: list[SessionInfo] = []
_approval_counter: int = 0

db: Database | None = None
config: dict[str, Any] = {}

# ---------------------------------------------------------------------------
# Config loader
# ---------------------------------------------------------------------------

CONFIG_SEARCH_PATHS = [
    Path(__file__).parent / "config.yaml",
    Path(os.path.expanduser("~/.config/harness-monitor/config.yaml")),
    Path(os.path.expanduser("~/harness-monitor/config.yaml")),
]


def load_config() -> dict[str, Any]:
    """Load YAML configuration from the first existing search path."""
    for path in CONFIG_SEARCH_PATHS:
        if path.exists():
            try:
                with open(path) as f:
                    return yaml.safe_load(f) or {}
            except (yaml.YAMLError, OSError) as exc:
                logger.warning("Failed to load config from %s: %s", path, exc)
    logger.info("No config file found, using defaults")
    return {}


# ---------------------------------------------------------------------------
# Background: session scanning
# ---------------------------------------------------------------------------

async def scan_sessions() -> None:
    """Run all harness discoverers and merge in pending approval state."""
    global active_sessions
    harness_instances: dict[str, Any] = {
        "claude-code": ClaudeCodeHarness(**config.get("harnesses", {}).get("claude-code", {})),
        "codex": CodexHarness(**config.get("harnesses", {}).get("codex", {})),
    }

    all_sessions: list[SessionInfo] = []
    for h_name, harness in harness_instances.items():
        try:
            found = await harness.discover_sessions()
            all_sessions.extend(found)
        except Exception:
            logger.exception("Harness %s discovery failed", h_name)

    # Merge pending approval metadata into the matching session
    now_ts = time.time()
    for session in all_sessions:
        for approval in list(pending_approvals.values()):
            if approval["harness"] == session.harness and approval["session_name"] == session.name:
                session.has_approval = True
                session.pending_command = approval["command"]
                break

    # Clean up stale approvals (keep them but they'll timeout naturally)
    active_sessions = all_sessions


async def scan_sessions_loop() -> None:
    """Periodic task that refreshes ``active_sessions`` every 5 seconds."""
    while True:
        try:
            await scan_sessions()
        except Exception:
            logger.exception("Session scan error")
        await asyncio.sleep(5)


# ---------------------------------------------------------------------------
# Background: balance checking
# ---------------------------------------------------------------------------

async def check_all_balances() -> None:
    """Query each configured provider and persist results to the database."""
    global db
    if db is None:
        return

    provider_cfgs = config.get("providers", {})
    provider_instances: dict[str, Any] = {}

    if "deepseek" in provider_cfgs:
        url = provider_cfgs["deepseek"].get("balance_url", "https://api.deepseek.com/user/balance")
        provider_instances["deepseek"] = DeepSeekProvider(balance_url=url)
    if "zhipu" in provider_cfgs:
        url = provider_cfgs["zhipu"].get("balance_url", "https://open.bigmodel.cn/api/biz/subscription/list")
        provider_instances["zhipu"] = ZhipuProvider(balance_url=url)

    for name, prov in provider_instances.items():
        try:
            result: BalanceInfo | None = await prov.check_balance()
            if result is not None:
                db.record_usage(
                    provider=result.provider,
                    model=result.model,
                    balance=result.balance,
                    currency=result.currency,
                    today_tokens=result.today_tokens,
                    month_used=result.month_used,
                )
                logger.info(
                    "Recorded balance for %s/%s: %.2f %s",
                    result.provider, result.model, result.balance, result.currency,
                )
        except Exception:
            logger.exception("Balance check failed for provider %s", name)


async def check_balances_loop() -> None:
    """Periodic task that checks provider balances at configured intervals."""
    provider_cfgs = config.get("providers", {})
    last_checked: dict[str, float] = {}

    while True:
        now = time.time()
        need_check = False
        for name, cfg in provider_cfgs.items():
            interval_sec = int(cfg.get("check_interval_min", 60)) * 60
            last = last_checked.get(name, 0.0)
            if now - last >= interval_sec:
                need_check = True
                last_checked[name] = now

        if need_check:
            await check_all_balances()

        await asyncio.sleep(30)


# ---------------------------------------------------------------------------
# HTTP handlers
# ---------------------------------------------------------------------------

async def handle_health(_request: web.Request) -> web.Response:
    """GET /health → {"status": "ok"}"""
    return web.json_response({"status": "ok"})


async def handle_get_usage(_request: web.Request) -> web.Response:
    """GET /api/usage → list of latest BalanceInfo records."""
    global db
    if db is None:
        return web.json_response([])
    records = db.get_latest_usage()
    return web.json_response(records)


async def handle_get_sessions(_request: web.Request) -> web.Response:
    """GET /api/sessions → list of SessionInfo dicts with approval state."""
    return web.json_response([_session_to_dict(s) for s in active_sessions])


async def handle_approve(request: web.Request) -> web.Response:
    """POST /approve

    Request body::

        {"harness": "claude-code", "session": "cury-51",
         "tool": "Bash", "command": "sudo ...", "cwd": "/home/cury"}

    Creates a pending approval and blocks up to 60 seconds for the user
    to respond via ``POST /approve/{id}/respond``.

    Returns ``{"allowed": true}`` or ``{"allowed": false}`` (timeout).
    """
    global _approval_counter, db

    try:
        body = await request.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return web.json_response({"error": "invalid JSON body"}, status=400)

    harness_name = body.get("harness", "")
    session_name = body.get("session", "")
    tool = body.get("tool", "")
    command = body.get("command", "")
    cwd = body.get("cwd", "")

    _approval_counter += 1
    approval_id = str(_approval_counter)

    loop = asyncio.get_running_loop()
    future: asyncio.Future[bool] = loop.create_future()

    pending_approvals[approval_id] = {
        "future": future,
        "harness": harness_name,
        "session_name": session_name,
        "tool": tool,
        "command": command,
        "cwd": cwd,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        allowed = await asyncio.wait_for(future, timeout=60.0)
        response: dict[str, Any] = {"allowed": allowed}
        return web.json_response(response)
    except asyncio.TimeoutError:
        logger.info("Approval %s timed out after 60s", approval_id)
        # Record the timeout as denied
        if db is not None:
            db.record_approval(
                harness=harness_name,
                session_name=session_name,
                command=command,
                cwd=cwd,
                allowed=False,
            )
        return web.json_response({"allowed": False})
    finally:
        pending_approvals.pop(approval_id, None)


async def handle_respond_approval(request: web.Request) -> web.Response:
    """POST /approve/{id}/respond

    Request body::

        {"allowed": true}

    Resolves the pending approval Future, which unblocks the ``POST /approve``
    handler so it can return the answer to the harness hook.
    """
    global db
    approval_id = request.match_info.get("id", "")

    if approval_id not in pending_approvals:
        return web.json_response({"error": "approval not found"}, status=404)

    try:
        body = await request.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return web.json_response({"error": "invalid JSON body"}, status=400)

    allowed = bool(body.get("allowed", False))
    entry = pending_approvals[approval_id]
    future: asyncio.Future[bool] = entry["future"]

    if not future.done():
        future.set_result(allowed)

    # Persist to DB
    if db is not None:
        db.record_approval(
            harness=entry["harness"],
            session_name=entry["session_name"],
            command=entry["command"],
            cwd=entry["cwd"],
            allowed=allowed,
        )

    logger.info("Approval %s resolved: allowed=%s", approval_id, allowed)
    return web.json_response({"status": "ok"})


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _session_to_dict(s: SessionInfo) -> dict[str, Any]:
    """Convert a ``SessionInfo`` dataclass to a JSON-serialisable dict."""
    return {
        "name": s.name,
        "harness": s.harness,
        "status": s.status,
        "cwd": s.cwd,
        "task": s.task,
        "api_provider": s.api_provider,
        "ctx_pct": s.ctx_pct,
        "memory_mb": s.memory_mb,
        "pid": s.pid,
        "uptime_seconds": s.uptime_seconds,
        "has_approval": s.has_approval,
        "pending_command": s.pending_command,
    }


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

def create_app(config_path: str | None = None) -> web.Application:
    """Create and configure the aiohttp web application."""
    app = web.Application()

    # Store config path for on_startup
    app["config_path"] = config_path

    app.router.add_get("/health", handle_health)
    app.router.add_get("/api/usage", handle_get_usage)
    app.router.add_get("/api/sessions", handle_get_sessions)
    app.router.add_post("/approve", handle_approve)
    app.router.add_post("/approve/{id}/respond", handle_respond_approval)

    app.on_startup.append(on_startup)

    return app


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

async def on_startup(_app: web.Application) -> None:
    """Application startup: init DB, start background loops."""
    global db, config

    config = load_config()
    logger.info("Configuration loaded")

    db = Database()
    db.init_db()

    # Kick off background tasks
    asyncio.create_task(scan_sessions_loop(), name="session-scan")
    asyncio.create_task(check_balances_loop(), name="balance-check")

    logger.info("Background tasks started")


# ---------------------------------------------------------------------------
# Entry point (standalone mode — normally loaded by main.py)
# ---------------------------------------------------------------------------

def main() -> None:
    """Start the harness-monitor HTTP server (standalone)."""
    cfg = load_config()
    server_cfg = cfg.get("server", {})
    host: str = server_cfg.get("host", "127.0.0.1")
    port: int = int(server_cfg.get("port", 18456))

    app = create_app()

    logger.info("Starting harness-monitor server on %s:%d", host, port)
    web.run_app(app, host=host, port=port)


if __name__ == "__main__":
    main()
