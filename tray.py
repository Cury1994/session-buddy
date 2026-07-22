#!/usr/bin/env python3
"""
System tray icon for harness-monitor.

Provides a fallback chain for tray icon backends:
  1. AyatanaAppIndicator3  (recommended: install gir1.2-ayatanaappindicator3-0.1)
  2. AppIndicator3
  3. Fallback stub (no tray icon — app relies on window-based activation)

Usage:
    tray = HarnessTray(on_show=callback, on_hide=callback, on_quit=callback)
    tray.set_icon_color("green")  # green | amber | red | gray
    tray.cleanup()
"""

from __future__ import annotations

import math
import os
import subprocess
import tempfile
from typing import Any, Callable, Optional, Tuple

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
gi.require_version("Gio", "2.0")
gi.require_version("cairo", "1.0")
from gi.repository import Gtk, Gdk, GLib, Gio, cairo

# ---------------------------------------------------------------------------
# colour palette
# ---------------------------------------------------------------------------

_COLORS: dict[str, str] = {
    "green": "#00e676",
    "amber": "#ffab00",
    "red": "#ff5252",
    "gray": "#5a6d82",
}


def _hex_to_rgb(h: str) -> Tuple[float, float, float]:
    h = h.lstrip("#")
    return int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0


# ===================================================================
# icon rendering (cairo → PNG)
# ===================================================================

def _render_icon_png(color_name: str) -> str:
    """Write a coloured-circle PNG to a temp file and return its path."""
    path = os.path.join(
        tempfile.gettempdir(), f"harness-monitor-{color_name}.png"
    )
    hex_col = _COLORS.get(color_name, "#5a6d82")
    r, g, b = _hex_to_rgb(hex_col)
    size = 22

    surface = cairo.image_surface_create(cairo.FORMAT_ARGB32, size, size)
    ctx = cairo.Context(surface)

    # transparent background
    ctx.set_operator(cairo.Operator.CLEAR)
    ctx.paint()
    ctx.set_operator(cairo.Operator.OVER)

    # outer glow
    ctx.set_source_rgba(r, g, b, 0.25)
    ctx.arc(size / 2.0, size / 2.0, size / 2.0 - 1, 0, 2 * math.pi)
    ctx.fill()

    # solid circle
    ctx.set_source_rgb(r, g, b)
    ctx.arc(size / 2.0, size / 2.0, size / 2.0 - 3, 0, 2 * math.pi)
    ctx.fill()

    surface.write_to_png(path)
    return path


# ===================================================================
# indicator backends
# ===================================================================

def _try_backend(namespace: str, version: str) -> Any:
    """Return the indicator module (or None) for *namespace*."""
    try:
        gi.require_version(namespace, version)
        mod = __import__(f"gi.repository.{namespace}", fromlist=(namespace,))
        return getattr(mod, namespace)
    except (ImportError, ValueError, AttributeError):
        return None


def _create_indicator(mod: Any, on_show: Callable, on_quit: Callable) -> Any:
    """Build an AppIndicator instance with menu and callbacks."""
    Indicator = mod.Indicator
    Category = mod.IndicatorCategory
    Status = mod.IndicatorStatus

    ind = Indicator.new(
        "harness-monitor", "harness-monitor", Category.APPLICATION_STATUS
    )
    ind.set_icon_theme_path(tempfile.gettempdir())
    ind.set_status(Status.ACTIVE)

    # Pre-render the green icon
    _render_icon_png("green")
    ind.set_icon(os.path.join(tempfile.gettempdir(), "harness-monitor-green.png"))

    # Context menu
    menu = Gtk.Menu.new()

    show_item = Gtk.MenuItem.new_with_label("  Show Panel")
    show_item.connect("activate", lambda _: on_show())
    menu.append(show_item)

    quit_item = Gtk.MenuItem.new_with_label("  Quit")
    quit_item.connect("activate", lambda _: on_quit())
    menu.append(quit_item)

    menu.show_all()
    ind.set_menu(menu)

    # Left-click
    ind.connect("activate", lambda _ind: on_show())

    return ind


# ===================================================================
# HarnessTray
# ===================================================================

class HarnessTray:
    """
    Minimal tray-icon manager.

    Attempts to use an AppIndicator backend.  If none is available, the
    instance is still created but acts as a no-op stub — the application
    is expected to handle activation through other means (keyboard
    shortcut, launcher, etc.).
    """

    def __init__(
        self,
        on_show: Callable[[], None] = lambda: None,
        on_hide: Callable[[], None] = lambda: None,
        on_quit: Callable[[], None] = lambda: None,
    ) -> None:
        self._indicator: Any = None
        self._current_color: str = "green"
        self._available: bool = False

        for ns, ver in (("AyatanaAppIndicator3", "0.1"), ("AppIndicator3", "0.1")):
            mod = _try_backend(ns, ver)
            if mod is not None:
                self._indicator = _create_indicator(mod, on_show, on_quit)
                self._available = True
                break

    # -- public api ----------------------------------------------------------

    @property
    def available(self) -> bool:
        """``True`` when a real system-tray indicator was created."""
        return self._available

    def set_icon_color(self, color_name: str) -> None:
        """Update the tray-icon dot colour (green / amber / red / gray)."""
        if color_name == self._current_color or self._indicator is None:
            return
        self._current_color = color_name
        path = _render_icon_png(color_name)
        try:
            self._indicator.set_icon(path)
        except Exception:
            pass

    def cleanup(self) -> None:
        """Remove temporary icon PNG files."""
        for name in _COLORS:
            p = os.path.join(tempfile.gettempdir(), f"harness-monitor-{name}.png")
            try:
                os.remove(p)
            except FileNotFoundError:
                pass
