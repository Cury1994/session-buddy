#!/usr/bin/env python3
"""
Usage tab panel for harness-monitor.

Displays provider balance cards with cairo-drawn progress bars and a
30-day token usage trend chart.  Auto-refreshes by polling the backend
HTTP API every 30 seconds.
"""

from __future__ import annotations

import json
import math
import urllib.error
import urllib.request
from typing import Any, List, Optional, Tuple

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("cairo", "1.0")
from gi.repository import Gtk, GLib, cairo


# ---------------------------------------------------------------------------
# colour helpers
# ---------------------------------------------------------------------------

def _hex_to_rgb(hex_color: str) -> Tuple[float, float, float]:
    """Convert a '#rrggbb' string to (r, g, b) floats in [0, 1]."""
    h = hex_color.lstrip("#")
    return int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0


def _progress_color(pct: float) -> Tuple[float, float, float]:
    """Return (r, g, b) for a progress percentage."""
    if pct < 50:
        return _hex_to_rgb("#00c853")
    if pct < 85:
        return _hex_to_rgb("#ffab00")
    return _hex_to_rgb("#ff5252")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _format_tokens(count: int) -> str:
    """Pretty-print a token count (e.g. 1850000 -> '1.85M')."""
    if count >= 1_000_000:
        return f"{count / 1_000_000:.2f}M".rstrip("0").rstrip(".")
    if count >= 1_000:
        return f"{count / 1_000:.1f}K".rstrip("0").rstrip(".")
    return str(count)


# ===================================================================
# ProviderCard
# ===================================================================

class ProviderCard(Gtk.Box):
    """A single provider balance / usage card."""

    PROGRESS_H = 4

    def __init__(self, data: dict) -> None:
        super().__init__(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self._data = data
        self._pct: float = 0.0
        self._currency: str = data.get("currency", "¥")
        self._initials: str = self._compute_initials()
        self.set_css_classes(["provider-card"])
        self._build_ui()

    # -- public update ------------------------------------------------

    def update(self, data: dict) -> None:
        """Refresh displayed values and redraw the progress bar."""
        self._data = data
        self._currency = data.get("currency", self._currency)
        self._update_labels()
        self._progress_da.queue_draw()

    # -- ui construction -----------------------------------------------

    def _build_ui(self) -> None:
        # ---- header ----
        hdr = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=0)
        hdr.set_css_classes(["provider-card-header"])

        name_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        name_box.set_css_classes(["provider-name"])

        icon_label = Gtk.Label(label=self._initials)
        icon_label.set_css_classes(["provider-icon", f"icon-{self._initials.lower()}"])
        name_box.append(icon_label)

        col = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=1)
        self._name_lbl = Gtk.Label(label=self._data.get("provider", ""))
        self._name_lbl.set_css_classes(["provider-label"])
        self._name_lbl.set_halign(Gtk.Align.START)
        col.append(self._name_lbl)

        self._model_lbl = Gtk.Label(label=self._data.get("model", ""))
        self._model_lbl.set_css_classes(["provider-model"])
        self._model_lbl.set_halign(Gtk.Align.START)
        col.append(self._model_lbl)

        name_box.append(col)
        hdr.append(name_box)

        spacer = Gtk.Label()
        spacer.set_hexpand(True)
        hdr.append(spacer)

        bal_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        bal_box.set_css_classes(["provider-balance"])
        bal_box.set_halign(Gtk.Align.END)

        bal = self._data.get("balance", 0.0)
        self._bal_lbl = Gtk.Label(label=f"{self._currency}{bal:.2f}")
        self._bal_lbl.set_css_classes(["provider-balance-val"])
        bal_box.append(self._bal_lbl)

        bal_note = Gtk.Label(label="剩余余额")
        bal_note.set_css_classes(["provider-balance-label"])
        bal_box.append(bal_note)

        hdr.append(bal_box)
        self.append(hdr)

        # ---- stats row ----
        stats = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=16)
        stats.set_css_classes(["provider-stats"])

        today_tokens = self._data.get("today_tokens", 0)
        month_used = self._data.get("month_used", 0.0)
        total_budget = self._data.get("total_budget", 0.0)

        if total_budget > 0:
            self._pct = (month_used / total_budget) * 100.0

        self._today_lbl = self._mk_stat(_format_tokens(today_tokens), "今日 token")
        stats.append(self._today_lbl)

        self._month_lbl = self._mk_stat(
            f"{self._currency}{month_used:.2f}", "本月已用"
        )
        stats.append(self._month_lbl)

        if today_tokens > 0:
            avg = month_used / today_tokens * 1_000_000
            self._avg_lbl = self._mk_stat(f"{self._currency}{avg:.2f}", "均价/M")
            stats.append(self._avg_lbl)

        self.append(stats)

        # ---- progress bar ----
        wrap = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
        wrap.set_css_classes(["progress-wrap"])

        info = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=0)
        self._budget_lbl = Gtk.Label(
            label=f"本月预算 {self._currency}{total_budget:.2f}"
        )
        self._budget_lbl.set_css_classes(["progress-info-label"])
        info.append(self._budget_lbl)

        sp2 = Gtk.Label()
        sp2.set_hexpand(True)
        info.append(sp2)

        self._pct_lbl = Gtk.Label(label=f"{self._pct:.1f}%")
        self._pct_lbl.set_css_classes(["progress-info-label"])
        info.append(self._pct_lbl)
        wrap.append(info)

        self._progress_da = Gtk.DrawingArea()
        self._progress_da.set_size_request(-1, self.PROGRESS_H)
        self._progress_da.set_css_classes(["progress-bar"])
        self._progress_da.set_draw_func(self._draw_progress, None)
        wrap.append(self._progress_da)

        self.append(wrap)

    # -- internal helpers ----------------------------------------------

    def _compute_initials(self) -> str:
        name = self._data.get("provider", "")
        if "DeepSeek" in name:
            return "DS"
        if "智谱" in name or "zhipu" in name.lower():
            return "智"
        if len(name) >= 2:
            return name[:2]
        return "?"

    def _mk_stat(self, value: str, label: str) -> Gtk.Box:
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        box.set_css_classes(["provider-stat"])
        v = Gtk.Label(label=value)
        v.set_css_classes(["provider-stat-val"])
        box.append(v)
        l = Gtk.Label(label=label)
        l.set_css_classes(["provider-stat-lbl"])
        box.append(l)
        return box

    def _update_labels(self) -> None:
        self._name_lbl.set_label(self._data.get("provider", ""))
        self._model_lbl.set_label(self._data.get("model", ""))

        bal = self._data.get("balance", 0.0)
        self._bal_lbl.set_label(f"{self._currency}{bal:.2f}")

        today_tokens = self._data.get("today_tokens", 0)
        self._today_lbl.get_first_child().set_label(_format_tokens(today_tokens))

        month_used = self._data.get("month_used", 0.0)
        total_budget = self._data.get("total_budget", 0.0)
        self._month_lbl.get_first_child().set_label(
            f"{self._currency}{month_used:.2f}"
        )

        if total_budget > 0:
            self._pct = (month_used / total_budget) * 100.0
        else:
            self._pct = 0.0

        self._budget_lbl.set_label(f"本月预算 {self._currency}{total_budget:.2f}")
        self._pct_lbl.set_label(f"{self._pct:.1f}%")

    # -- cairo drawing -------------------------------------------------

    def _draw_progress(
        self, _da: Gtk.DrawingArea, ctx: cairo.Context, w: float, h: float, _data: Any
    ) -> None:
        if w < 2 or h < 2:
            return
        pct = max(0.0, min(1.0, self._pct / 100.0))

        # background track
        ctx.set_source_rgba(1, 1, 1, 0.06)
        r = h / 2.0
        ctx.new_path()
        ctx.arc(r, r, r, math.pi / 2, 3 * math.pi / 2)
        ctx.arc(w - r, r, r, 3 * math.pi / 2, math.pi / 2)
        ctx.close_path()
        ctx.fill()

        # fill
        if pct > 0:
            r_, g_, b_ = _progress_color(self._pct)
            ctx.set_source_rgb(r_, g_, b_)
            fw = max(0.0, w * pct)
            ctx.new_path()
            ctx.arc(r, r, r, math.pi / 2, 3 * math.pi / 2)
            ctx.arc(fw - r, r, r, 3 * math.pi / 2, math.pi / 2)
            ctx.close_path()
            ctx.fill()


# ===================================================================
# TrendChart
# ===================================================================

class TrendChart(Gtk.DrawingArea):
    """Cairo-drawn 30-day token usage trend chart."""

    CHART_H = 100
    PAD_L = 36
    PAD_R = 8
    PAD_T = 8
    PAD_B = 18

    def __init__(self) -> None:
        super().__init__()
        self._series: List[Tuple[str, str, List[float]]] = []
        self.set_vexpand(False)
        self.set_size_request(-1, self.CHART_H)
        self.set_draw_func(self._draw, None)

    # -- public api ----------------------------------------------------

    def set_series(self, series: List[Tuple[str, str, List[float]]]) -> None:
        self._series = series
        self.queue_draw()

    # -- cairo drawing -------------------------------------------------

    def _draw(
        self, _da: Gtk.DrawingArea, ctx: cairo.Context, w: float, h: float, _data: Any
    ) -> None:
        if w < 60 or h < 20 or not self._series:
            return

        pw = max(1.0, w - self.PAD_L - self.PAD_R)
        ph = max(1.0, h - self.PAD_T - self.PAD_B)

        n_points = len(self._series[0][2])
        if n_points < 2:
            return

        # collect all values for y-range
        all_vals: List[float] = []
        for _lbl, _clr, pts in self._series:
            all_vals.extend(pts)
        y_max = max(all_vals) * 1.2 if all_vals else 1.0
        if y_max <= 0:
            y_max = 1.0

        def x_pos(i: int) -> float:
            return self.PAD_L + (i / max(n_points - 1, 1)) * pw

        def y_pos(v: float) -> float:
            return self.PAD_T + ph - (v / y_max) * ph

        # ---- grid lines & y labels ----
        ctx.set_source_rgba(1, 1, 1, 0.04)
        ctx.set_line_width(0.5)
        for row in range(5):
            gy = self.PAD_T + (ph / 4.0) * row
            ctx.move_to(self.PAD_L, gy)
            ctx.line_to(w - self.PAD_R, gy)
            ctx.stroke()

            val = y_max * (4 - row) / 4.0
            label = f"{val:.1f}"
            ctx.set_source_rgb(0.35, 0.43, 0.51)
            ctx.select_font_face("Monospace", cairo.FontSlant.NORMAL, cairo.FontWeight.NORMAL)
            ctx.set_font_size(7)
            te = ctx.text_extents(label)
            ctx.move_to(self.PAD_L - te.width - 4, gy + te.height / 2.0 - te.y_bearing)
            ctx.show_text(label)

        # ---- x labels ----
        ctx.set_source_rgb(0.35, 0.43, 0.51)
        ctx.select_font_face("Monospace", cairo.FontSlant.NORMAL, cairo.FontWeight.NORMAL)
        ctx.set_font_size(7)
        for idx in (0, n_points // 3, 2 * n_points // 3, n_points - 1):
            te = ctx.text_extents(f"D{idx+1}")
            ctx.move_to(x_pos(idx) - te.width / 2.0, h - 3)
            ctx.show_text(f"D{idx+1}")

        # ---- draw each series ----
        dot_bg = (0.03, 0.04, 0.05)
        for _lbl, color, pts in self._series:
            r, g, b = _hex_to_rgb(color)

            # area fill
            ctx.new_path()
            ctx.move_to(x_pos(0), y_pos(pts[0]))
            for i in range(1, n_points):
                ctx.line_to(x_pos(i), y_pos(pts[i]))
            ctx.line_to(x_pos(n_points - 1), h - self.PAD_B)
            ctx.line_to(x_pos(0), h - self.PAD_B)
            ctx.close_path()
            ctx.set_source_rgba(r, g, b, 0.10)
            ctx.fill()

            # line
            ctx.new_path()
            ctx.move_to(x_pos(0), y_pos(pts[0]))
            for i in range(1, n_points):
                ctx.line_to(x_pos(i), y_pos(pts[i]))
            ctx.set_source_rgb(r, g, b)
            ctx.set_line_width(1.5)
            ctx.set_line_join(cairo.LineJoin.ROUND)
            ctx.stroke()

            # dots at key indices
            for idx in (0, n_points // 3, 2 * n_points // 3, n_points - 1):
                if idx >= len(pts):
                    continue
                cx, cy = x_pos(idx), y_pos(pts[idx])
                ctx.new_path()
                ctx.arc(cx, cy, 2.5, 0, 2 * math.pi)
                ctx.set_source_rgb(r, g, b)
                ctx.fill()
                ctx.new_path()
                ctx.arc(cx, cy, 2.5, 0, 2 * math.pi)
                ctx.set_source_rgb(*dot_bg)
                ctx.set_line_width(1)
                ctx.stroke()


# ===================================================================
# UsagePanel
# ===================================================================

class UsagePanel(Gtk.Box):
    """Tab 1 — API usage overview with auto-refresh."""

    REFRESH_S = 30

    def __init__(self, port: int = 18456) -> None:
        super().__init__(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self._port = port
        self._cards: dict[str, ProviderCard] = {}
        self._build_ui()
        # Caller must call start_refresh() to begin periodic updates.

    # -- ui construction -----------------------------------------------

    def _build_ui(self) -> None:
        scrolled = Gtk.ScrolledWindow()
        scrolled.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        scrolled.set_vexpand(True)
        scrolled.set_css_classes(["usage-scrolled"])

        content = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        content.set_css_classes(["usage-content"])

        self._card_list = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        content.append(self._card_list)

        # chart section
        chart_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        chart_box.set_css_classes(["chart-section"])
        chart_box.set_margin_start(8)
        chart_box.set_margin_end(8)
        chart_box.set_margin_top(8)
        chart_box.set_margin_bottom(8)

        chart_hdr = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=0)
        title = Gtk.Label(label="  30-Day Token Usage Trend")
        title.set_css_classes(["chart-title"])
        chart_hdr.append(title)

        sp = Gtk.Label()
        sp.set_hexpand(True)
        chart_hdr.append(sp)

        legend = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        legend.set_css_classes(["chart-legend"])
        for lbl, clr in (("v4-pro", "#448aff"), ("GLM-4", "#b388ff")):
            legend.append(self._legend_item(lbl, clr))
        chart_hdr.append(legend)
        chart_box.append(chart_hdr)

        self._chart = TrendChart()
        chart_box.append(self._chart)
        content.append(chart_box)

        scrolled.set_child(content)
        self.append(scrolled)

    @staticmethod
    def _legend_item(label: str, color: str) -> Gtk.Box:
        box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=3)
        box.set_css_classes(["chart-legend-item"])
        r, g, b = _hex_to_rgb(color)
        dot = Gtk.DrawingArea()
        dot.set_size_request(6, 6)

        def _draw_dot(da, ctx, dw, dh, _ud):
            ctx.set_source_rgb(r, g, b)
            ctx.arc(dw / 2, dh / 2, min(dw, dh) / 2 - 1, 0, 2 * math.pi)
            ctx.fill()

        dot.set_draw_func(_draw_dot, None)
        box.append(dot)
        lbl = Gtk.Label(label=label)
        lbl.set_css_classes(["chart-legend-item"])
        box.append(lbl)
        return box

    # -- refresh -------------------------------------------------------

    def start_refresh(self) -> None:
        """Begin periodic polling (called from the application)."""
        self.refresh()
        GLib.timeout_add_seconds(self.REFRESH_S, self._do_refresh)

    def refresh(self) -> None:
        """Trigger a single data-fetch on the next idle cycle."""
        self._do_refresh()

    def _do_refresh(self) -> bool:
        """Fetch usage data from the backend API.  Returns True to keep the timer alive."""
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{self._port}/api/usage")
            with urllib.request.urlopen(req, timeout=5) as resp:
                body = resp.read().decode("utf-8")
            data = json.loads(body)
            GLib.idle_add(self._update_ui, data)
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError):
            pass  # server unavailable — keep current data
        return True

    def _update_ui(self, data: list) -> bool:
        """Called on the main thread to rebuild / update cards."""
        if not isinstance(data, list):
            return GLib.SOURCE_REMOVE

        seen: set[str] = set()
        for item in data:
            prov = item.get("provider", "")
            if not prov:
                continue
            seen.add(prov)
            if prov in self._cards:
                self._cards[prov].update(item)
            else:
                card = ProviderCard(item)
                self._card_list.append(card)
                self._cards[prov] = card

        # remove stale cards
        for prov in list(self._cards.keys()):
            if prov not in seen:
                self._card_list.remove(self._cards.pop(prov))

        # feed chart if daily_usage is present
        if data and "daily_usage" in data[0]:
            series: list = []
            palette = ["#448aff", "#b388ff", "#00bcd4"]
            for i, item in enumerate(data):
                du = item.get("daily_usage")
                if du and isinstance(du, list):
                    series.append((
                        item.get("model", item.get("provider", f"S{i}")),
                        palette[i % len(palette)],
                        du,
                    ))
            if series:
                self._chart.set_series(series)

        return GLib.SOURCE_REMOVE
