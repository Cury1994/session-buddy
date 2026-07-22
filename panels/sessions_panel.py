#!/usr/bin/env python3
"""
Sessions tab panel for harness-monitor.

Displays a scrollable list of session cards with embedded approval blocks,
action buttons, and a collapsible approval-history section.
Auto-refreshes by polling the backend HTTP API every 3 seconds.
"""

from __future__ import annotations

import json
import math
import os
import signal
import subprocess
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("cairo", "1.0")
gi.require_version("Gdk", "4.0")
from gi.repository import Gtk, GLib, Gdk, cairo


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

DANGER_WORDS = ("sudo", "rm ", "chmod", "chown", "dd ", "mkfs", "> ")


def format_uptime(seconds: int) -> str:
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}h {m:02d}m"
    return f"{m}m {s:02d}s"


def format_reltime(timestamp: float) -> str:
    delta = time.time() - timestamp
    if delta < 60:
        return f"{int(delta)}s"
    if delta < 3600:
        return f"{int(delta // 60)}m"
    return f"{int(delta // 3600)}h"


def _hex_rgb(h: str) -> Tuple[float, float, float]:
    h = h.lstrip("#")
    return int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0


def _is_dangerous(cmd: str) -> List[str]:
    return [w for w in DANGER_WORDS if w in cmd]


def _truncate(path: str, max_len: int = 48) -> str:
    if len(path) <= max_len:
        return path
    head, tail = os.path.split(path)
    if not head:
        return path[-max_len:]
    avail = max_len - len(tail) - 4
    if avail < 8:
        return "... " + tail
    return head[:avail] + " ... " + tail


# ===================================================================
# StatusDot
# ===================================================================

class StatusDot(Gtk.DrawingArea):
    """A small cairo-drawn circle that pulses for 'busy' sessions."""

    SIZE = 7
    PULSE_PERIOD_S = 2.0

    def __init__(self, is_busy: bool = True) -> None:
        super().__init__()
        self._busy = is_busy
        self.set_size_request(self.SIZE, self.SIZE)
        self.set_draw_func(self._draw, None)

    def set_busy(self, busy: bool) -> None:
        self._busy = busy
        self.queue_draw()

    def advance(self) -> None:
        """Call periodically to animate the pulse."""
        if self._busy:
            self.queue_draw()

    def _draw(
        self, _da: Gtk.DrawingArea, ctx: cairo.Context, w: float, h: float, _ud: Any
    ) -> None:
        if w < 1 or h < 1:
            return
        cx, cy = w / 2.0, h / 2.0
        r = min(w, h) / 2.0 - 1

        if self._busy:
            pulse = (math.sin(time.monotonic() * 2 * math.pi / self.PULSE_PERIOD_S) + 1) / 2.0
            glow = 0.3 + 0.7 * pulse
            ctx.set_source_rgb(0, 0.9 * glow, 0.4 * glow)
            ctx.arc(cx, cy, r, 0, 2 * math.pi)
            ctx.fill()
        else:
            ctx.set_source_rgb(0.35, 0.43, 0.51)
            ctx.arc(cx, cy, r, 0, 2 * math.pi)
            ctx.fill()


# ===================================================================
# ContextGauge
# ===================================================================

class ContextGauge(Gtk.DrawingArea):
    """Thin cyan progress bar drawn with cairo."""

    H = 3

    def __init__(self, pct: float = 0) -> None:
        super().__init__()
        self._pct = max(0.0, min(100.0, pct))
        self.set_size_request(-1, self.H)
        self.set_draw_func(self._draw, None)

    def set_pct(self, pct: float) -> None:
        self._pct = max(0.0, min(100.0, pct))
        self.queue_draw()

    def _draw(
        self, _da: Gtk.DrawingArea, ctx: cairo.Context, w: float, h: float, _ud: Any
    ) -> None:
        if w < 2 or h < 2:
            return
        r_ = h / 2.0

        # track background
        ctx.set_source_rgba(1, 1, 1, 0.06)
        ctx.new_path()
        ctx.arc(r_, r_, r_, math.pi / 2, 3 * math.pi / 2)
        ctx.arc(w - r_, r_, r_, 3 * math.pi / 2, math.pi / 2)
        ctx.close_path()
        ctx.fill()

        # fill
        c, g, b = _hex_rgb("#00bcd4")
        fw = max(0.0, w * (self._pct / 100.0))
        if fw > 0:
            ctx.set_source_rgb(c, g, b)
            ctx.new_path()
            ctx.arc(r_, r_, r_, math.pi / 2, 3 * math.pi / 2)
            ctx.arc(fw - r_, r_, r_, 3 * math.pi / 2, math.pi / 2)
            ctx.close_path()
            ctx.fill()


# ===================================================================
# ApprovalBlock
# ===================================================================

class ApprovalBlock(Gtk.Box):
    """Embedded approval widget inside a session card."""

    def __init__(
        self,
        session_id: str,
        command: str,
        on_resolve: callable,
        port: int = 18456,
    ) -> None:
        super().__init__(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self._session_id = session_id
        self._command = command
        self._on_resolve = on_resolve
        self._port = port
        self._resolved = False
        self.set_css_classes(["approval-block"])
        self._build_ui()

    def _build_ui(self) -> None:
        # floating label "Pending approval"
        lbl = Gtk.Label(label="  Pending  ")
        lbl.set_css_classes(["approval-float-label"])
        self.append(lbl)

        # command block
        cmd_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        cmd_box.set_css_classes(["approval-command-box"])
        cmd_lbl = Gtk.Label(label=self._command)
        cmd_lbl.set_css_classes(["approval-command"])
        cmd_lbl.set_wrap(True)
        cmd_lbl.set_selectable(True)
        cmd_lbl.set_xalign(0)
        cmd_box.append(cmd_lbl)
        self.append(cmd_box)

        # warning
        dangers = _is_dangerous(self._command)
        if dangers:
            warn = Gtk.Label(
                label=f"  {'  '.join(dangers)} detected — proceed with caution"
            )
            warn.set_css_classes(["approval-warning"])
            self.append(warn)

        # buttons
        btn_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        btn_row.set_css_classes(["approval-actions"])

        approve_btn = Gtk.Button(label="  Approve  ")
        approve_btn.set_css_classes(["btn-approve"])
        approve_btn.connect("clicked", lambda b: self._respond(True))
        btn_row.append(approve_btn)

        deny_btn = Gtk.Button(label="  Deny  ")
        deny_btn.set_css_classes(["btn-deny"])
        deny_btn.connect("clicked", lambda b: self._respond(False))
        btn_row.append(deny_btn)

        copy_btn = Gtk.Button(label="  Copy  ")
        copy_btn.set_css_classes(["btn-copy"])
        copy_btn.connect("clicked", lambda b: self._copy_cmd())
        btn_row.append(copy_btn)

        self.append(btn_row)

    def _respond(self, allowed: bool) -> None:
        if self._resolved:
            return
        self._resolved = True

        # POST to backend
        try:
            body = json.dumps({"allowed": allowed}).encode("utf-8")
            req = urllib.request.Request(
                f"http://127.0.0.1:{self._port}/approve/{self._session_id}/respond",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=5)
        except (urllib.error.URLError, urllib.error.HTTPError, OSError):
            pass  # best-effort

        # visual feedback
        self._show_result(allowed)
        self._on_resolve(self._session_id, allowed, self._command)

    def _show_result(self, allowed: bool) -> None:
        # remove existing children
        child = self.get_first_child()
        while child:
            nxt = child.get_next_sibling()
            self.remove(child)
            child = nxt

        text = "Approved — executing ..." if allowed else "Denied"
        color = "#00e676" if allowed else "#ff5252"
        result_lbl = Gtk.Label(label=text)
        result_lbl.set_css_classes(["approval-result"])
        ctx = result_lbl.get_style_context()
        ctx.add_class("approved" if allowed else "denied")
        # override colour via CSS provider
        css = f"label.approval-result {{ color: {color}; }}"
        prov = Gtk.CssProvider()
        prov.load_from_string(css)
        result_lbl.get_style_context().add_provider(prov, 800)
        result_lbl.set_margin_top(6)
        result_lbl.set_margin_bottom(6)
        self.append(result_lbl)

        # auto-remove after 2s
        GLib.timeout_add(2000, self._fade_out)

    def _fade_out(self) -> bool:
        parent = self.get_parent()
        if parent:
            parent.remove(self)
        return GLib.SOURCE_REMOVE

    def _copy_cmd(self) -> None:
        clipboard = Gdk.Display.get_default().get_clipboard()
        clipboard.set_text(self._command)


# ===================================================================
# SessionCard
# ===================================================================

class SessionCard(Gtk.Box):
    """A single session card with status, meta, actions, and optional approval."""

    PULSE_MS = 200  # how often we pulse the status dot (ms)

    def __init__(self, data: dict, port: int, on_resolve: callable) -> None:
        super().__init__(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self._port = port
        self._on_resolve = on_resolve
        self._session_id = data.get("id", data.get("name", ""))
        self._actions_row: Optional[Gtk.Widget] = None
        self._approval_block: Optional[ApprovalBlock] = None
        self._pulse_id: Optional[int] = None
        self._setup(data)
        self._start_pulse()

    def _setup(self, data: dict) -> None:
        self.set_css_classes(["session-card"])
        if data.get("has_approval"):
            self.get_style_context().add_class("has-approval")

        self.set_margin_start(8)
        self.set_margin_end(8)
        self.set_margin_top(4)
        self.set_margin_bottom(4)

        # -- top row --
        top = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=0)
        top.set_css_classes(["session-top"])

        left = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        left.set_css_classes(["session-left"])

        self._dot = StatusDot(data.get("status") == "busy")
        left.append(self._dot)

        name = data.get("name", "?")
        self._name_lbl = Gtk.Label(label=name)
        self._name_lbl.set_css_classes(["session-name"])
        left.append(self._name_lbl)

        harness = data.get("harness", "")
        if harness:
            badge = Gtk.Label(label=harness)
            badge.set_css_classes(["session-harness"])
            left.append(badge)

        top.append(left)

        sp1 = Gtk.Label()
        sp1.set_hexpand(True)
        top.append(sp1)

        self._runtime_lbl = Gtk.Label(
            label=format_uptime(data.get("uptime_seconds", 0))
        )
        self._runtime_lbl.set_css_classes(["session-runtime"])
        top.append(self._runtime_lbl)
        self.append(top)

        # -- meta row --
        meta = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        meta.set_css_classes(["session-meta"])

        api_provider = data.get("api_provider", "")
        api_lbl = Gtk.Label(label=f"  {api_provider}")
        api_lbl.set_css_classes(["session-meta-api"])
        meta.append(api_lbl)

        ctx_pct = data.get("ctx_pct", 0)
        ctx_lbl = Gtk.Label(label=f"  {ctx_pct}%")
        ctx_lbl.set_css_classes(["session-meta-ctx"])
        meta.append(ctx_lbl)

        mem_mb = data.get("memory_mb", 0)
        mem_lbl = Gtk.Label(label=f"  {mem_mb} MB")
        mem_lbl.set_css_classes(["session-meta-mem"])
        meta.append(mem_lbl)

        self.encode_meta_labels = (api_lbl, ctx_lbl, mem_lbl)
        self._data_meta = data
        self.append(meta)

        # -- cwd row --
        cwd = data.get("cwd", "")
        self._cwd_lbl = Gtk.Label(label=f"  {_truncate(cwd)}")
        self._cwd_lbl.set_css_classes(["session-cwd"])
        self._cwd_lbl.set_xalign(0)
        self._cwd_lbl.set_tooltip_text(cwd)
        self.append(self._cwd_lbl)

        # -- task row --
        task = data.get("task", "") or "   Waiting for input ..."
        self._task_lbl = Gtk.Label(label=task)
        self._task_lbl.set_css_classes(["session-task"])
        self._task_lbl.set_xalign(0)
        self._task_lbl.set_ellipsize(True)
        self.append(self._task_lbl)

        # -- gauges --
        gauges = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
        gauges.set_css_classes(["session-gauges"])

        ctx_gauge_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=3)
        ctx_gauge_box.set_css_classes(["session-gauge"])
        ctx_gauge_hdr = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=0)
        ctx_l = Gtk.Label(label="Context")
        ctx_l.set_css_classes(["session-gauge-label"])
        ctx_gauge_hdr.append(ctx_l)
        sp_g = Gtk.Label()
        sp_g.set_hexpand(True)
        ctx_gauge_hdr.append(sp_g)
        self._ctx_pct_lbl = Gtk.Label(label=f"{ctx_pct}%")
        self._ctx_pct_lbl.set_css_classes(["session-gauge-label"])
        ctx_gauge_hdr.append(self._ctx_pct_lbl)
        ctx_gauge_box.append(ctx_gauge_hdr)

        self._ctx_gauge = ContextGauge(ctx_pct)
        ctx_gauge_box.append(self._ctx_gauge)
        gauges.append(ctx_gauge_box)

        self.append(gauges)

        # -- approval block --
        if data.get("has_approval") and data.get("pending_command"):
            self._add_approval(data)

        # -- action buttons --
        actions = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        actions.set_css_classes(["session-actions"])
        self._actions_row = actions

        jump_btn = Gtk.Button(label="  Jump to Terminal  ")
        jump_btn.set_css_classes(["btn-session"])
        jump_btn.connect("clicked", lambda b: self._jump_terminal(cwd))
        actions.append(jump_btn)

        pid = data.get("pid")
        term_btn = Gtk.Button(label="  Terminate  ")
        term_btn.set_css_classes(["btn-session", "btn-terminate"])
        term_btn.connect("clicked", lambda b: self._terminate(pid))
        actions.append(term_btn)

        self.append(actions)

    def _add_approval(self, data: dict) -> None:
        cmd = data.get("pending_command", "")
        self._approval_block = ApprovalBlock(
            self._session_id, cmd, self._on_resolve, self._port
        )
        self.append(self._approval_block)

        # Reorder approval_block to appear just before the actions row
        if self._actions_row is not None and self._actions_row.get_parent() is self:
            prev = self._actions_row.get_prev_sibling()
            if prev is not None and prev is not self._approval_block:
                self.reorder_child_after(self._approval_block, prev)
            elif prev is None:
                # actions row is the very first child — move approval to position 0
                self.reorder_child_after(self._approval_block, None)

    def update(self, data: dict) -> None:
        """Refresh fields in-place (preserves approval block state)."""
        busy = data.get("status") == "busy"
        self._dot.set_busy(busy)

        self._name_lbl.set_label(data.get("name", ""))
        self._runtime_lbl.set_label(format_uptime(data.get("uptime_seconds", 0)))

        if self.encode_meta_labels:
            api_lbl, ctx_lbl, mem_lbl = self.encode_meta_labels
            api_lbl.set_label(f"  {data.get('api_provider', '')}")
            ctx_lbl.set_label(f"  {data.get('ctx_pct', 0)}%")
            mem_lbl.set_label(f"  {data.get('memory_mb', 0)} MB")

        cwd = data.get("cwd", "")
        self._cwd_lbl.set_label(f"  {_truncate(cwd)}")
        self._cwd_lbl.set_tooltip_text(cwd)

        task = data.get("task", "") or "   Waiting for input ..."
        self._task_lbl.set_label(task)

        ctx_pct = data.get("ctx_pct", 0)
        self._ctx_pct_lbl.set_label(f"{ctx_pct}%")
        self._ctx_gauge.set_pct(ctx_pct)

        # approval state
        has_approval = data.get("has_approval", False)
        pending_cmd = data.get("pending_command", "")
        if has_approval and pending_cmd and self._approval_block is None:
            self._add_approval(data)
            self.get_style_context().add_class("has-approval")
        elif not has_approval and self._approval_block is not None:
            # approval was resolved externally
            self._remove_approval()

    def _remove_approval(self) -> None:
        if self._approval_block and self._approval_block.get_parent():
            self.remove(self._approval_block)
        self._approval_block = None
        self.get_style_context().remove_class("has-approval")

    def _start_pulse(self) -> None:
        def _pulse() -> bool:
            self._dot.advance()
            return True
        self._pulse_id = GLib.timeout_add(self.PULSE_MS, _pulse)

    def _stop_pulse(self) -> None:
        if self._pulse_id is not None:
            GLib.source_remove(self._pulse_id)
            self._pulse_id = None

    # -- actions -------------------------------------------------------

    @staticmethod
    def _jump_terminal(cwd: str) -> None:
        if not cwd or not os.path.isdir(cwd):
            return
        terminals = [
            ("kgx", ["--working-directory", cwd]),
            ("gnome-terminal", ["--working-directory", cwd]),
            ("xterm", ["-e", f"cd {cwd} && $SHELL"]),
        ]
        for term, args in terminals:
            try:
                subprocess.Popen([term, *args])
                return
            except FileNotFoundError:
                continue

    @staticmethod
    def _terminate(pid: Optional[int]) -> None:
        if pid is None:
            return
        try:
            os.kill(pid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            pass

    def cleanup(self) -> None:
        self._stop_pulse()


# ===================================================================
# ApprovalHistory
# ===================================================================

class ApprovalHistory(Gtk.Box):
    """Collapsible approval history section at the bottom of the sessions tab."""

    MAX_ENTRIES = 20

    def __init__(self) -> None:
        super().__init__(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self._entries: List[Dict] = []
        self._expanded = False
        self.set_css_classes(["history-section"])
        self._build_ui()

    def _build_ui(self) -> None:
        # toggle button
        self._toggle_btn = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=0)
        self._toggle_btn.set_css_classes(["history-toggle"])
        pass  # cursor not critical
        self._toggle_btn.add_controller(Gtk.GestureClick.new())

        # Make clickable via event controller
        controller = Gtk.GestureClick.new()

        def _on_click(_g, _n, _x, _y):
            self._toggle()
        controller.connect("pressed", _on_click)
        self._toggle_btn.add_controller(controller)

        icon_lbl = Gtk.Label(label="  Approval History  ")
        icon_lbl.set_css_classes(["history-toggle-text"])
        self._toggle_btn.append(icon_lbl)

        count_lbl = Gtk.Label(label="  last 20")
        count_lbl.set_css_classes(["history-toggle-count"])
        self._toggle_btn.append(count_lbl)

        sp = Gtk.Label()
        sp.set_hexpand(True)
        self._toggle_btn.append(sp)

        self._arrow_lbl = Gtk.Label(label="  >  ")
        self._arrow_lbl.set_css_classes(["history-arrow"])
        self._toggle_btn.append(self._arrow_lbl)

        self.append(self._toggle_btn)

        # revealer for list
        self._revealer = Gtk.Revealer()
        self._revealer.set_transition_type(Gtk.RevealerTransitionType.SLIDE_DOWN)
        self._revealer.set_transition_duration(200)
        self._revealer.set_reveal_child(False)

        self._list_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self._list_box.set_css_classes(["history-list"])
        self._revealer.set_child(self._list_box)
        self.append(self._revealer)

    def _toggle(self) -> None:
        self._expanded = not self._expanded
        self._revealer.set_reveal_child(self._expanded)
        self._arrow_lbl.set_label("  v  " if self._expanded else "  >  ")

    def add_entry(self, session: str, command: str, allowed: bool) -> None:
        self._entries.insert(0, {
            "session": session,
            "command": command,
            "allowed": allowed,
            "timestamp": time.time(),
        })
        if len(self._entries) > self.MAX_ENTRIES:
            self._entries.pop()
        self._rebuild_list()

    def _rebuild_list(self) -> None:
        # clear
        child = self._list_box.get_first_child()
        while child:
            nxt = child.get_next_sibling()
            self._list_box.remove(child)
            child = nxt

        for entry in self._entries:
            row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
            row.set_css_classes(["history-item"])

            icon = "  +  " if entry["allowed"] else "  -  "
            icon_cls = "history-icon-ok" if entry["allowed"] else "history-icon-no"
            icon_lbl = Gtk.Label(label=icon)
            icon_lbl.set_css_classes(["history-icon", icon_cls])
            row.append(icon_lbl)

            cmd_lbl = Gtk.Label(label=entry["command"])
            cmd_lbl.set_css_classes(["history-cmd"])
            cmd_lbl.set_ellipsize(True)
            row.append(cmd_lbl)

            sess_lbl = Gtk.Label(label=entry["session"])
            sess_lbl.set_css_classes(["history-session"])
            row.append(sess_lbl)

            time_lbl = Gtk.Label(label=format_reltime(entry["timestamp"]))
            time_lbl.set_css_classes(["history-time"])
            row.append(time_lbl)

            self._list_box.append(row)


# ===================================================================
# SessionsPanel
# ===================================================================

class SessionsPanel(Gtk.Box):
    """Tab 2 — sessions overview with embedded approvals and history."""

    REFRESH_S = 3

    def __init__(self, port: int = 18456) -> None:
        super().__init__(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self._port = port
        self._cards: Dict[str, SessionCard] = {}
        self._build_ui()
        # Caller must call start_refresh() to begin periodic updates.

    def _build_ui(self) -> None:
        scrolled = Gtk.ScrolledWindow()
        scrolled.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        scrolled.set_vexpand(True)
        scrolled.set_css_classes(["sessions-scrolled"])

        content = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        content.set_css_classes(["sessions-content"])

        self._card_list = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        content.append(self._card_list)

        # history section pinned below the card list (inside scroll)
        self._history = ApprovalHistory()
        content.append(self._history)

        scrolled.set_child(content)
        self.append(scrolled)

    def _on_approval_resolve(self, session_id: str, allowed: bool, command: str) -> None:
        self._history.add_entry(session_id, command, allowed)

    def start_refresh(self) -> None:
        """Begin periodic polling (called from the application)."""
        self.refresh()
        GLib.timeout_add_seconds(self.REFRESH_S, self._do_refresh)

    def refresh(self) -> None:
        """Trigger a single data-fetch on the next idle cycle."""
        self._do_refresh()

    def _do_refresh(self) -> bool:
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{self._port}/api/sessions")
            with urllib.request.urlopen(req, timeout=5) as resp:
                body = resp.read().decode("utf-8")
            data = json.loads(body)
            GLib.idle_add(self._update_ui, data)
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError):
            pass
        return True

    def _update_ui(self, data: list) -> bool:
        if not isinstance(data, list):
            return GLib.SOURCE_REMOVE

        seen: set[str] = set()
        for item in data:
            sid = item.get("id", item.get("name", ""))
            if not sid:
                continue
            seen.add(sid)
            if sid in self._cards:
                self._cards[sid].update(item)
            else:
                card = SessionCard(item, self._port, self._on_approval_resolve)
                self._card_list.append(card)
                self._cards[sid] = card

        # remove stale
        for sid in list(self._cards.keys()):
            if sid not in seen:
                self._cards[sid].cleanup()
                self._card_list.remove(self._cards.pop(sid))

        return GLib.SOURCE_REMOVE
