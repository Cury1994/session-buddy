#!/usr/bin/env python3
"""
harness-monitor — System tray tool for AI coding harness monitoring.

Monitors Claude Code / Codex CLI sessions, API provider balances,
and handles bash command approvals through a unified system-tray panel.

Usage:
    python main.py [--port PORT] [--config PATH]
"""

from __future__ import annotations

import argparse
import fcntl
import logging
import os
import signal
import sys
import threading
import asyncio
from pathlib import Path

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")
gi.require_version("Gdk", "4.0")
gi.require_version("Gio", "2.0")
from gi.repository import Gtk, Gdk, GLib, Adw, Gio

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("harness-monitor")

APP_ID = "com.harness-monitor.app"
PORT = 18456
POPUP_W = 380
POPUP_H = 520

# ---------------------------------------------------------------------------
# CSS
# ---------------------------------------------------------------------------

DARK_CSS = """
window, .window { background: #080b0e; }
.notebook { background: transparent; }
.notebook tab { background: #11161c; border: none; padding: 6px 12px; font-size: 11px; color: #5a6d82; }
.notebook tab:checked { color: #00e676; border-bottom: 2px solid #00e676; }
.notebook tab label { font-weight: 500; }

.provider-card {
    background: #161b23; border: 1px solid #1e2733; border-radius: 8px;
    padding: 12px 14px; margin: 6px 8px;
}
.provider-header { margin-bottom: 6px; }
.provider-name {
    font-family: monospace; font-size: 12px; font-weight: bold; color: #e2e8f0;
}
.provider-model {
    font-family: monospace; font-size: 10px; color: #5a6d82;
}
.provider-balance {
    font-family: monospace; font-size: 15px; font-weight: bold; color: #e2e8f0;
}
.provider-stat-val {
    font-family: monospace; font-size: 12px; font-weight: 600; color: #8899b4;
}
.provider-stat-lbl {
    font-family: monospace; font-size: 8px; color: #5a6d82;
}
.session-card {
    background: #161b23; border: 1px solid #1e2733; border-radius: 8px;
    padding: 10px 12px; margin: 4px 8px;
}
.session-name {
    font-family: monospace; font-size: 12px; font-weight: bold; color: #e2e8f0;
}
.session-harness {
    font-family: monospace; font-size: 9px; color: #5a6d82;
    background: rgba(255,255,255,0.04); border-radius: 3px; padding: 1px 5px;
}
.session-meta { font-family: monospace; font-size: 10px; color: #8899b4; }
.session-cwd { font-family: monospace; font-size: 9px; color: #5a6d82; }
.session-task { font-family: monospace; font-size: 10px; color: #8899b4; }

.approval-block {
    background: rgba(255,171,0,0.06); border: 1px solid rgba(255,171,0,0.2);
    border-radius: 6px; padding: 10px; margin-top: 8px;
}
.approval-cmd {
    font-family: monospace; font-size: 11px; font-weight: 500; color: #ffe082;
    background: rgba(0,0,0,0.3); border-radius: 4px; padding: 6px 8px;
}
.approval-warn { font-family: monospace; font-size: 8px; color: #ffab00; }

.btn-approve {
    background: rgba(0,230,118,0.1); color: #00e676;
    border: 1px solid rgba(0,230,118,0.3); border-radius: 6px;
    padding: 6px 12px; font-size: 10px; font-weight: bold;
}
.btn-deny {
    background: rgba(255,82,82,0.08); color: #ff5252;
    border: 1px solid rgba(255,82,82,0.2); border-radius: 6px;
    padding: 6px 12px; font-size: 10px; font-weight: bold;
}
.btn-copy {
    background: transparent; border: 1px solid #1e2733; border-radius: 6px;
    color: #5a6d82; padding: 4px 8px; font-size: 12px;
}
.btn-session {
    background: transparent; border: 1px solid #1e2733; border-radius: 6px;
    color: #8899b4; padding: 5px 8px; font-size: 9px; font-weight: 500;
}
.btn-session.terminate { color: #8899b4; }
.footer {
    background: #11161c; border-top: 1px solid #1e2733; padding: 4px 12px;
}
.footer-label { font-family: monospace; font-size: 9px; color: #5a6d82; }
.chart-section {
    background: #161b23; border: 1px solid #1e2733; border-radius: 8px;
    padding: 10px; margin: 8px;
}
"""


# ---------------------------------------------------------------------------
# Main Application
# ---------------------------------------------------------------------------

class HarnessMonitorApp(Gtk.Application):
    """GTK4 Application wrapping the harness-monitor tray tool."""

    def __init__(self, port: int = PORT, config_path: str | None = None) -> None:
        super().__init__(application_id=APP_ID)
        self._port = port
        self._config_path = config_path
        self._server_loop: asyncio.AbstractEventLoop | None = None
        self._server_thread: threading.Thread | None = None
        self._tray = None
        self._popup: Gtk.Window | None = None
        self._usage_panel = None
        self._sessions_panel = None
        self._pin_btn: Gtk.Button | None = None
        self._pinned: bool = False
        self._footer_time: Gtk.Label | None = None

    def do_activate(self) -> None:
        """GTK application activated — build the UI."""
        self._load_css()
        self._start_server()
        self._build_tray()
        GLib.timeout_add_seconds(30, self._update_footer_time)
        self.hold()

    def do_shutdown(self) -> None:
        """Clean shutdown."""
        logger.info("Shutting down...")
        self._stop_server()
        Gtk.Application.do_shutdown(self)

    def _load_css(self) -> None:
        provider = Gtk.CssProvider()
        provider.load_from_string(DARK_CSS)
        display = Gdk.Display.get_default()
        if display:
            Gtk.StyleContext.add_provider_for_display(
                display, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            )

    def _start_server(self) -> None:
        """Launch aiohttp server in a daemon thread."""
        self._server_loop = asyncio.new_event_loop()

        async def _serve() -> None:
            from server import create_app
            from aiohttp import web
            app_obj = create_app(self._config_path)
            runner = web.AppRunner(app_obj)
            await runner.setup()
            site = web.TCPSite(runner, "127.0.0.1", self._port)
            await site.start()
            logger.info("HTTP API listening on http://127.0.0.1:%d", self._port)
            await asyncio.Event().wait()

        def _run_loop() -> None:
            asyncio.set_event_loop(self._server_loop)
            self._server_loop.run_until_complete(_serve())

        self._server_thread = threading.Thread(
            target=_run_loop, name="http-server", daemon=True
        )
        self._server_thread.start()

    def _stop_server(self) -> None:
        if self._server_loop:
            self._server_loop.call_soon_threadsafe(self._server_loop.stop)
        if self._server_thread:
            self._server_thread.join(timeout=3)

    def _build_tray(self) -> None:
        """Create the system tray icon and popup window."""
        from tray import HarnessTray

        self._tray = HarnessTray(
            on_show=self._show_popup,
            on_hide=self._hide_popup,
            on_quit=self.quit,
        )

        self._popup = Gtk.Window()
        self._popup.set_title("harness-monitor")
        self._popup.set_default_size(POPUP_W, POPUP_H)
        self._popup.set_resizable(False)
        self._popup.set_decorated(False)
        # GTK4: no set_skip_taskbar_hint

        focus_ctrl = Gtk.EventControllerFocus()
        focus_ctrl.connect("leave", self._on_focus_lost)
        self._popup.add_controller(focus_ctrl)

        self._popup.set_child(self._build_content())
        self._popup.present()

    def _build_content(self) -> Gtk.Widget:
        """Build the popup window: header + notebook + footer."""
        root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)

        # Header
        header = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL)
        header.set_margin_start(12); header.set_margin_end(8)
        header.set_margin_top(8); header.set_margin_bottom(4)

        title_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        title = Gtk.Label(label="harness-monitor")
        title.set_css_classes(["provider-name"]); title.set_halign(Gtk.Align.START)
        subtitle = Gtk.Label(label=f"v0.1.0 · 127.0.0.1:{self._port}")
        subtitle.set_css_classes(["provider-model"]); subtitle.set_halign(Gtk.Align.START)
        title_box.append(title); title_box.append(subtitle)
        header.append(title_box)

        spacer = Gtk.Box(); spacer.set_hexpand(True); header.append(spacer)

        refresh_btn = Gtk.Button(label="↻")
        refresh_btn.set_css_classes(["btn-copy"])
        refresh_btn.connect("clicked", lambda _b: self._refresh_all())
        header.append(refresh_btn)

        self._pin_btn = Gtk.Button(label="📌")
        self._pin_btn.set_css_classes(["btn-copy"])
        self._pin_btn.connect("clicked", self._toggle_pin)
        header.append(self._pin_btn)

        root.append(header)

        # Notebook
        notebook = Gtk.Notebook()
        notebook.set_css_classes(["notebook"])

        from panels.usage_panel import UsagePanel
        self._usage_panel = UsagePanel(port=self._port)
        self._usage_panel.start_refresh()
        notebook.append_page(self._usage_panel, Gtk.Label(label="💰 用量"))

        from panels.sessions_panel import SessionsPanel
        self._sessions_panel = SessionsPanel(port=self._port)
        self._sessions_panel.start_refresh()
        notebook.append_page(self._sessions_panel, Gtk.Label(label="📡 Sessions"))

        root.append(notebook)

        # Footer
        footer = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL)
        footer.set_css_classes(["footer"])
        footer.set_margin_start(12); footer.set_margin_end(12)
        footer.set_margin_top(2); footer.set_margin_bottom(4)

        left = Gtk.Label(label=f"🟢 HTTP :{self._port}")
        left.set_css_classes(["footer-label"]); left.set_halign(Gtk.Align.START)
        footer.append(left)

        f_spacer = Gtk.Box(); f_spacer.set_hexpand(True); footer.append(f_spacer)

        right = Gtk.Label(label="更新于 --:--")
        right.set_css_classes(["footer-label"]); right.set_halign(Gtk.Align.END)
        self._footer_time = right; footer.append(right)
        root.append(footer)

        return root

    def _show_popup(self) -> None:
        if self._popup:
            self._popup.present()
            self._refresh_all()

    def _hide_popup(self) -> None:
        if self._popup and not self._pinned:
            self._popup.hide()

    def _on_focus_lost(self, _ctrl, _event) -> None:
        if not self._pinned:
            self._hide_popup()

    def _toggle_pin(self, btn: Gtk.Button) -> None:
        self._pinned = not self._pinned
        if self._popup:
            if self._pinned:
                self._popup.set_decorated(True)
                # GTK4: no set_skip_taskbar_hint
                btn.set_label("📍")
            else:
                self._popup.set_decorated(False)
                # GTK4: no set_skip_taskbar_hint
                btn.set_label("📌")

    def _refresh_all(self) -> None:
        if self._usage_panel:
            self._usage_panel.refresh()
        if self._sessions_panel:
            self._sessions_panel.refresh()
        self._update_footer_time()

    def _update_footer_time(self) -> bool:
        import datetime
        now = datetime.datetime.now().strftime("%H:%M")
        if self._footer_time:
            self._footer_time.set_label(f"更新于 {now}")
        return True


# ---------------------------------------------------------------------------
# Single-instance lock
# ---------------------------------------------------------------------------

_lock_fd = None


def _acquire_lock() -> bool:
    lock_dir = os.path.expanduser("~/.local/share/claude-monitor")
    os.makedirs(lock_dir, exist_ok=True)
    lock_path = os.path.join(lock_dir, "instance.lock")
    global _lock_fd
    _lock_fd = open(lock_path, "w")
    try:
        fcntl.flock(_lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        _lock_fd.write(str(os.getpid()))
        _lock_fd.flush()
        return True
    except BlockingIOError:
        logger.error("Another instance of harness-monitor is already running.")
        return False


# ---------------------------------------------------------------------------
# CLI entry
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="harness-monitor")
    parser.add_argument("--port", type=int, default=PORT, help="HTTP API port")
    parser.add_argument("--config", type=str, help="Path to config.yaml")
    args = parser.parse_args()

    if not _acquire_lock():
        sys.exit(1)

    Adw.init()

    app = HarnessMonitorApp(port=args.port, config_path=args.config)

    def _signal_handler(sig: int, _frame: object) -> None:
        logger.info("Received signal %d, quitting...", sig)
        app.quit()

    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    try:
        app.run(None)
    except KeyboardInterrupt:
        pass
    finally:
        if _lock_fd:
            _lock_fd.close()

    logger.info("harness-monitor stopped.")


if __name__ == "__main__":
    main()
