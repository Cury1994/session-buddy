#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# harness-monitor approval hook
#
# Called from a harness's pre-tool-use hook (e.g. Claude Code preToolUse).
# Reads the tool-call JSON on stdin, forwards it to the harness-monitor
# HTTP server, and exits 0 (allow) or 1 (deny) based on the response.
#
# Environment variables:
#   CLAUDE_MONITOR_PORT  – the server port (default 18456)
# ---------------------------------------------------------------------------
set -euo pipefail

PORT="${CLAUDE_MONITOR_PORT:-18456}"

# Read the JSON payload the harness provides on stdin
INPUT=$(cat)

# Send to the tray tool's approval endpoint; wait up to 65 seconds.
# The server holds the connection open until the user responds (max 60s).
RESPONSE=$(curl -s -X POST "http://127.0.0.1:${PORT}/approve" \
  -H "Content-Type: application/json" \
  -d "$INPUT" \
  --max-time 65 2>/dev/null || echo '{"allowed": false}')

# Check if the server responded with allowed: true
if echo "$RESPONSE" | grep -q '"allowed":[[:space:]]*true'; then
  exit 0   # approved
else
  exit 1   # denied or timeout
fi
