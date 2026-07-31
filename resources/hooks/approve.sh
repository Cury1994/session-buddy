#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# harness-monitor — Claude Code PreToolUse 审批钩子（DESIGN §6.13 / TASKS §12）
#
# Claude Code 在执行工具前调用本脚本，hook 输入的 JSON 从 stdin 传入。
# 本脚本把待审批命令转发给 harness-monitor HTTP server 的 POST /approve，
# 该路由会阻塞等待用户在桌面端点击「允许 / 拒绝」（server 侧 60s 超时 auto-deny）。
#
# 退出码遵循 Claude Code hook 规范：
#   exit 0  → 放行（allowed:true，或 fail-open 降级）
#   exit 2  → 拦截（allowed:false —— 仅此退出码真正拦截，exit 1 不拦截）
#
# Fail-open 策略：server 不可达（连接拒绝 / 超时 / 异常响应）时一律放行，
#   避免监控进程宕机把所有 Claude Code 会话卡死。宁可漏审，不可误杀工作流。
#
# 环境变量：
#   HARNESS_MONITOR_PORT — server 端口（默认 18456，与 src/main/config.ts 一致）
#
# 依赖：jq、curl
# ---------------------------------------------------------------------------
set -euo pipefail

PORT="${HARNESS_MONITOR_PORT:-18456}"

# 读取 Claude Code 通过 stdin 传入的 hook 输入 JSON。
INPUT="$(cat)"

# 用 jq 解析出审批所需字段；字段缺失时降级为空串（// empty），不中断。
COMMAND="$(printf '%s' "${INPUT}" | jq -r '.tool_use.input.command // empty' 2>/dev/null || true)"
SESSION="$(printf '%s' "${INPUT}" | jq -r '.session_id // empty' 2>/dev/null || true)"
CWD="$(printf '%s' "${INPUT}" | jq -r '.cwd // empty' 2>/dev/null || true)"
# 命令的人类可读摘要（Bash 工具 hook 输入自带 .tool_use.input.description；可空）。
# 仅用于桌面端实时展示，不落审批历史库（避免 schema 迁移）。
DESCRIPTION="$(printf '%s' "${INPUT}" | jq -r '.tool_use.input.description // empty' 2>/dev/null || true)"

# 构造 /approve 请求体。
# 三个核心字段 command/session/cwd 来自 hook 输入；harness/tool 按
# shared/types.ts ApprovalPayload 的约定补全（server 缺省会记 'unknown'/'Bash'，
# 显式带上让审批历史落库更准确）。description 为命令摘要，缺省空串。
BODY="$(jq -n \
  --arg command "${COMMAND}" \
  --arg session "${SESSION}" \
  --arg cwd "${CWD}" \
  --arg description "${DESCRIPTION}" \
  '{harness: "claude-code", tool: "Bash", command: $command, session: $session, cwd: $cwd, description: $description}')"

# POST 到 server，阻塞等待审批结果。
# curl -m 65：总超时 65s = server 60s auto-deny + 5s 网络余量，确保正常情况下
#            是 server 先返回 allowed:false，而非 curl 先超时。
# fail-open：curl 失败（连接拒绝 exit 7 / 超时 exit 28 等）→ 放行 exit 0。
if ! RESPONSE="$(curl -s -m 65 -X POST "http://127.0.0.1:${PORT}/approve" \
  -H "Content-Type: application/json" \
  -d "${BODY}" 2>/dev/null)"; then
  echo "harness-monitor not running, allowing" >&2
  exit 0
fi

# 解析 server 响应 {"id":"...","allowed":true/false} 中的 allowed 字段。
ALLOWED="$(printf '%s' "${RESPONSE}" | jq -r '.allowed' 2>/dev/null || true)"

case "${ALLOWED}" in
  true)
    exit 0 # 用户批准 → 放行
    ;;
  false)
    exit 2 # 用户拒绝 / server 超时 auto-deny → 拦截（exit 2 才真正拦截）
    ;;
  *)
    # 异常 / 无法解析的响应 → fail-open 放行。
    echo "harness-monitor returned unexpected response, allowing" >&2
    exit 0
    ;;
esac
