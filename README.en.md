# SessionBuddy

> Run four or five `claude code` terminal tasks at once — no more toggling between approval prompts.

SessionBuddy is the answer: a small system-tray desktop tool. All Claude Code sessions fold into one floating panel, and Bash command approvals move out of the terminal into a pop-up card, auto-approving what it can.

<p align="center">
  <img src="assets/readme/hero.svg" width="100%" alt="SessionBuddy: a cockpit for Claude Code in your tray — multi-session monitoring, centralized Bash approval, multi-card API balance tracking, with a green/orange/red/gray tray icon for status">
</p>

[![status](https://img.shields.io/badge/status-production--ready-green)](#roadmap)
[![Linux](https://img.shields.io/badge/Linux-ready-brightgreen)](#platform-support)
[![macOS](https://img.shields.io/badge/macOS-experimental-orange)](#platform-support)
[![License](https://img.shields.io/badge/license-ISC-blue)](#license)

## Table of Contents

- [Why SessionBuddy](#why-sessionbuddy)
- [What it does](#what-it-does)
- [Without it vs with it](#without-it-vs-with-it)
- [Supported API providers](#supported-api-providers)
- [Roadmap](#roadmap)
- [Install](#install)
- [Configuration](#configuration)
- [Security](#security)
- [Tech stack](#tech-stack)
- [License](#license)

---

## Why SessionBuddy

This tool grew out of three recurring annoyances:

1. **Multiple sessions fly blind.** Running four or five `claude` sessions at once is normal, but the terminal offers no at-a-glance state: which is running, which is stuck, how much context is left, how many subagents are in flight — you're guessing. To-do lists live in your head and get forgotten.

2. **Balances are checked by eye.** When you use Claude Code with third-party APIs, balances live in a handful of cloud dashboards. Each card has its own site, its own login, and a single check takes a minute or more. Worse, nobody warns you before you run out; `Insufficient Balance` pops up mid-run and kills the session on the spot.

3. **Command approvals break your flow.** Every command the agent runs triggers a permission prompt. When you're away from the terminal, the ten-second timeout leaves the session waiting on you; but if you blindly hit enter, commands like `sudo rm -rf` are hard to feel good about.

SessionBuddy folds all of this into a small panel in the tray: balance at a glance, every session as a card, approvals funneled into one pop-up. What can be auto-approved, is.

---

## What it does

### 1. Centralized approval

Moving all Bash command approvals out of the terminal and into the tray, auto-approving what it can.

`PreToolUse` hook → `approve.sh` → tray card:

- **Auto-approval switch** — flip it on for a session you trust; its routine commands pass through directly, no more repeated interruptions
- **Dangerous commands still confirm** — `sudo` / `rm` / `chmod` / `dd` still pop a highlighted card; read it before allowing
- **Mirror filtering** — commands that would never prompt in the terminal (silently approved by the proxy) are recorded here too, so no blind spots
- **Desktop notifications + timeout fallback** — a three-layer hook timeout chain `70000ms > curl -m 65 > server 60s auto-deny`; nothing hangs undecided
- **Persistent approval history** — what you approved and when is stored in SQLite for later review

With auto-approval on, the agent runs, and you read code, answer messages, do something else — no longer sitting at the terminal clicking "Allow" over and over. It only calls you back for genuinely dangerous commands.

Say the agent wants to run `sudo docker compose up`. The card pops up, the red `sudo` is right there. You look at it, confirm it's fine, click "Allow", and the session continues — instead of blindly hitting enter in the terminal.

### 2. One panel, every session

The real pain of running multiple `claude` sessions is not seeing what's happening. SessionBuddy scans `~/.claude/sessions/` every 3 seconds and shows every session in one floating panel, one card each:

- **Pulse status light** — alive or hung, at a glance
- **Session name + uptime + API provider** — which model each session is running, visible directly
- **Context usage `ctx%`** — read from the last usage entry in the transcript, the same source as the terminal's bottom indicator; the progress bar tells you how much longer the session can talk
- **Memory + working directory** — how much memory it uses, which project it's working in
- **Subagent collaboration structure** — how many lanes run in parallel and what each is doing, no more flying blind
- **Task list + live messages** — current task progress and recent message flow, synced in real time
- **Per-card auto-approval switch** — approve policy decided per session

Four sessions left running before you leave work; you glance at the panel when you're back. Which finished, which is stuck, which is running low on context — you know in ten seconds without flipping through terminal windows.

### 3. Low balance turns the tray red

After approvals, SessionBuddy keeps an eye on your API balance too. The tray icon uses colors to show the state:

| Color | Meaning |
|-------|---------|
| Green | All good |
| Orange | Commands awaiting approval |
| Red | An API card is running low |
| Gray | Backend service isn't up |

- Multi-card balance tracking: DeepSeek and Alibaba Cloud Bailian built in, `usage_sources` is pluggable
- **30-day balance trend line** — native SVG, hover for values; steady decline or a cliff drop, the curve tells the story
- Low-balance alerts: set a threshold; it notifies when the tray goes red

---

## Without it vs with it

| Scenario | Without SessionBuddy | With SessionBuddy |
|----------|----------------------|--------------------|
| Approving Bash commands | A line of small text in the terminal; blind enter, miss the timeout | Card pops up + dangerous commands highlighted, read before allowing |
| Frequent approvals | Every command interrupts you; glued to the terminal | Auto-approval per session; safe commands don't bother you, work in parallel |
| Watching multiple sessions | Flipping between six or seven terminal windows, guessing the state | One panel lists all: status light, ctx%, memory, task list |
| Low-balance warning | Found out when it's burnt; `Insufficient Balance` suddenly errors | Tray turns red + desktop notification, warned early |
| Approval history | Whatever you approved, from memory | Persisted in SQLite, reviewable later |

---

## Supported API providers

Two cards are built in: **DeepSeek** (pay-as-you-go balance) and **Alibaba Cloud Bailian** (subscription plan). Balance sources are pluggable — configure one JSON block in `usage_sources` to add a new provider, no code changes needed.

---

## Roadmap

- Claude Code session monitoring + centralized approval (production-ready)
- Codex session support (planned): the current version focuses on Claude Code; Codex CLI session monitoring is on the roadmap
- macOS packaging (code adapted, awaiting real-device verification)

---

## Screenshots

> Screenshots pending — the project has no official UI screenshots yet. The following are placeholders; you'll know what it looks like once you run it.

![Session monitoring screenshot](docs/screenshots/sessions.png "pending")

![Bash approval card screenshot](docs/screenshots/approval.png "pending")

![Balance card screenshot](docs/screenshots/usage.png "pending")

---

## Install

### Platform support

| Platform | Status | Notes |
|----------|--------|-------|
| Linux | ✅ Production-ready | Primary platform, tested daily |
| macOS | ⚗️ Experimental | Code adapted, **not tested on real macOS hardware**; additionally run `brew install jq curl` |

### Prerequisites

- **Node.js ≥ 18** + npm
- **System build tools** — `better-sqlite3` is a native module and compiles locally when no prebuild is available:
  ```bash
  sudo apt install build-essential python3   # Debian / Ubuntu
  ```
- **Linux tray** — GNOME desktops need the appindicator extension, otherwise the tray icon won't show:
  ```bash
  sudo apt install gnome-shell-extension-appindicator   # Ubuntu
  ```

### Run from source (recommended)

```bash
git clone https://github.com/Cury1994/session-buddy.git
cd session-buddy
npm install        # auto-rebuilds better-sqlite3 to the Electron ABI (postinstall)
npm run dev        # dev mode (electron-vite dev)
```

> In regions where downloading the Electron binary times out (`ETIMEDOUT`), install via a mirror instead:
>
> ```bash
> ELECTRON_MIRROR="https://registry.npmmirror.com/-/binary/electron/" npm install
> ```
>
> Some GPUs have compatibility issues with the Electron dev build (AMD integrated graphics). If it crashes, use the built output:
>
> ```bash
> npm run build
> ./node_modules/.bin/electron . --disable-gpu --in-process-gpu
> ```

### Package & distribute (optional)

```bash
npm run dist:linux   # deb / AppImage
npm run dist:mac     # dmg / zip (experimental)
```

Output goes to `dist/`. **No official prebuilt release is provided yet** (no CI auto-build); if you want an installer, build it yourself.

---

## Configuration

### Config file location

Linux user config path (YAML):

```
~/.config/harness-monitor/config.yaml
```

Config load order (low → high priority): built-in defaults → user `config.yaml`. Missing keys fall back to defaults automatically; no need to write the full config.

### Main config options

| Section | Key | Default | Description |
|---------|-----|---------|-------------|
| `server` | `port` | `18456` | Local HTTP server port (loopback only) |
| `usage_sources[]` | `id` / `name` / `kind` | DeepSeek + Bailian | Balance source list; `kind`: `http-json` / `bss` / `subscription` |
| `usage_sources[].auth` | `type` / `key_env` | `bearer` | With `type: bearer`, `key_env` names the API key env var |
| `usage_sources[].remaining` | `path` | — | Balance JSON extraction path (supports array indices like `balance_infos[0].total_balance`) |
| `detection.cc_switch` | `enabled` / `db_path` | `true` / `~/.cc-switch/cc-switch.db` | Detect model switching in the local cc-switch proxy |
| `harnesses.claude-code` | `refresh_interval_sec` | `3` | Session scan interval (seconds) |
| `harnesses.claude-code` | `config_dirs` | `["~/.claude"]` | Claude config directories to scan |
| `notifications` | `enabled` / `approve_timeout_sec` | `true` / `60` | Desktop notification toggle / approval timeout seconds |
| `window` | `width` / `height` | `420` / `650` | Floating panel window size |
| `context_lengths` | — | `{}` | Model context-length table (`model id → len`; empty falls back to auto-detection) |

### API keys: environment variables only

Keys live only in environment variables, **never in code or config files**:

```bash
export DEEPSEEK_API_KEY=sk-xxx
export ALIYUN_BAILIAN_API_KEY=sk-xxx
npm run dev
```

### Approval hook: auto-registered

The app registers the approval hook into `~/.claude/settings.local.json` on startup — **no manual setup needed**. If you want to wire it by hand, here's an example:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "/path/to/session-buddy/resources/hooks/approve.sh" }
        ]
      }
    ]
  }
}
```

### Health check

The backend listens on `127.0.0.1:18456`:

```bash
curl http://127.0.0.1:18456/health   # 200 = alive
```

---

## Security

An app that monitors a Bash approval stream has to hold up to scrutiny itself:

- The local HTTP service **listens only on `127.0.0.1`**, not exposed on any port
- **No data leaves your machine** — balances, sessions, approval records all stay in local SQLite
- Electron's renderer uses `contextBridge` + `contextIsolation`, with **`nodeIntegration` disabled**
- Keys exist only in environment variables; zero residue in code or config

---

## Tech stack

Electron 32 · electron-vite 2 · React 19 · TypeScript 5.9 · Tailwind 3.4 · better-sqlite3 11 · Express 4 · yaml

---

## Credits

Thanks to every programmer in the Claude Code ecosystem who treats the terminal as home. This project is written for them (and for us).

---

## License

ISC — see [LICENSE](LICENSE) · [GitHub repo](https://github.com/Cury1994/session-buddy)
