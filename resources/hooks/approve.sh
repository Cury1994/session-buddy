#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# harness-monitor — Claude Code PreToolUse 审批钩子（DESIGN §6.13 / TASKS §15 M12）
#
# 审批镜像轮终态：matcher 空串 = 匹配所有工具。本脚本是**全工具薄中继**——
# 对"永不询问"工具（Glob/Grep/LS/Task/TodoWrite）走快速通道立即放行，其余工具
# 原样透传到 server 的 POST /approve，由 §6.14 permission-mirror 镜像过滤判定弹卡与否。
# mirror 逻辑集中在 server（TS 可测），脚本保持薄、版本漂移隔离在字段兼容层。
#
# 字段两路兼容：当前 Claude Code 2.1.207 发**顶层 tool_input**；旧版曾嵌套在
#   tool_use.input 下。脚本两路读取（`.tool_input // .tool_use.input`），隔离漂移。
#
# 响应三态（§6.13.4）：
#   {"action":"passthrough"}  镜像过滤判定终端不会弹 → exit 0（不输出 JSON，引擎按规则走）
#   {"allowed":true}          用户在工具批准 → stdout 输出 permissionDecision allow + exit 0
#                             → 引擎跳过原生询问（Plan A，2026-08-03 01:26 零干扰实测确认）
#   {"allowed":false}         拒绝 / 超时 auto-deny → exit 2 拦截（拦截不托付 JSON：
#                             JSON deny 解析失败会 fail-open 出安全洞；exit 2 fail-safe）
#
# 退出码遵循 Claude Code PreToolUse hook 规范（只有 exit 2 真正拦截，exit 1 非阻塞照跑）：
#   exit 0 → 放行 | exit 2 → 拦截（stderr 回传 Claude）| 其它非零 → 非阻塞错误
#
# Fail-open：server 不可达（连接拒绝 / 超时 / 异常）一律放行，避免监控宕机卡死会话。
#
# 环境变量：HARNESS_MONITOR_PORT — server 端口（默认 18456，与 src/main/config.ts 一致）
# 依赖：jq、curl
# ---------------------------------------------------------------------------
set -uo pipefail # 不用 -e：curl 失败需自行兜底，不能直接中断

# 固定端口（v3.2：无端口重试、无运行时端口文件，见 §6.5）
PORT="${HARNESS_MONITOR_PORT:-18456}"
SERVER="http://127.0.0.1:${PORT}"
# 客户端超时要 > 服务端 approve_timeout_sec(60s)，否则客户端先超时误判
CURL_MAX=65

# 读取 Claude Code 通过 stdin 传入的 hook 输入 JSON。
input="$(cat)"

# 工具名（两路 schema 都在顶层 .tool_name）。空 → 异常输入，exit 0 放行（§6.13.2）。
# jq 缺失 / 输入非法 JSON 时降级为空串 → 同样走放行分支，不中断工作流。
tool="$(printf '%s' "${input}" | jq -r '.tool_name // empty' 2>/dev/null || true)"
if [[ -z "${tool}" ]]; then
  exit 0
fi

# 快速通道：永不询问工具直接放行（§6.13.2）。在任何字段重解析与 curl 之前退出——
# 结构性免疫 server 故障/延迟对高频只读工具的影响。
# ⚠️ 绝不把会弹询问的工具（Bash/Read/Edit/Write/WebFetch/WebSearch/Skill/mcp__*）放进此列表。
case "${tool}" in
  Glob | Grep | LS | Task | TodoWrite) exit 0 ;;
esac

# 原始 tool_input 对象整体透传（两路兼容，缺失 → {}）；command 由 server 从 toolInput 构建。
tool_input="$(printf '%s' "${input}" | jq -c '(.tool_input // .tool_use.input // {})' 2>/dev/null || echo '{}')"
description="$(printf '%s' "${input}" | jq -r '(.tool_input // .tool_use.input).description // empty' 2>/dev/null || true)"
permission_mode="$(printf '%s' "${input}" | jq -r '.permission_mode // empty' 2>/dev/null || true)"
cwd="$(printf '%s' "${input}" | jq -r '.cwd // empty' 2>/dev/null || true)"
session="$(printf '%s' "${input}" | jq -r '.session_id // "unknown"' 2>/dev/null || echo unknown)"

# 阻塞式 POST /approve。BODY 携带 tool / toolInput(原始对象 --argjson) / description /
# permissionMode / session / cwd / harness。
response="$(curl -sS -m "${CURL_MAX}" \
  -X POST "${SERVER}/approve" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg h claude-code --arg t "${tool}" --arg s "${session}" \
    --arg w "${cwd}" --arg d "${description}" --arg m "${permission_mode}" \
    --argjson ti "${tool_input}" \
    '{harness:$h, tool:$t, session:$s, cwd:$w, description:$d,
      permissionMode:$m, toolInput:$ti}')" \
  2>/dev/null)"
curl_status=$?

# server 未启动 / 超时 / 网络错误 → fail-open 放行（监控不应成为开发的硬阻塞）。
if [[ "${curl_status}" -ne 0 ]]; then
  echo "harness-monitor 未运行或不可达，放行 ${tool} 调用" >&2
  exit 0
fi

# 响应三态解析（§6.13.4）。
action="$(printf '%s' "${response}" | jq -r '.action // empty' 2>/dev/null || true)"
allowed="$(printf '%s' "${response}" | jq -r '.allowed // empty' 2>/dev/null || true)"

if [[ "${action}" == "passthrough" ]]; then
  # 镜像过滤判定终端不会弹 → 不输出 JSON，交还引擎原生权限流。
  exit 0
elif [[ "${allowed}" == "true" ]]; then
  # 用户在工具批准 → 输出权限 JSON 压制终端原生二问（§6.13.4 末行 printf 逐字照抄）。
  # JSON 解析失败时引擎降级为正常流程（终端再问一次，无害）。
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Approved in harness-monitor"}}\n'
  exit 0
else
  # allowed:false / 超时 auto-deny / 异常响应 → exit 2 拦截（stderr 回传 Claude）。
  echo "harness-monitor 已拒绝: ${tool} 调用" >&2
  exit 2
fi
