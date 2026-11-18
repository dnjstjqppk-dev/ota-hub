#!/usr/bin/env bash
# CI-only E2E server lifecycle helper (sourced by .github/workflows/deploy.yml).
# Local QA never uses this: local runs use :8798 + isolated DBs, while CI owns
# :8799 on a disposable runner. Keep this file LF-only (bash + CRLF breaks).
#
# Why this exists (2026-11-17): each CI E2E pass used to boot with
# `npx wrangler dev ... &` and stop with `kill $!`. That kills only the npx
# shim — wrangler + workerd survive, keep :8799, and the next pass's
# health-check loop passes instantly against the STALE server. The Stripe pass
# then ran against pass 1's sandbox server and failed its provider assertion
# (CI run 44083053723: boot-to-failure in the same second). Every function
# below is fail-closed: a stale server blocks the next boot instead of
# silently poisoning it.

CI_E2E_PORT="${CI_E2E_PORT:-8799}"
CI_E2E_BASE="http://127.0.0.1:${CI_E2E_PORT}"
CI_E2E_PIDFILE="${CI_E2E_PIDFILE:-/tmp/wrangler.pid}"

# Stop any server on the CI E2E port. Returns nonzero if the port still
# answers afterwards (fails the step under `set -e`).
ci_stop_server() {
  kill "$(cat "${CI_E2E_PIDFILE}" 2>/dev/null)" 2>/dev/null || true
  # Both the npx shim and the wrangler child carry the config path + port in
  # argv (workerd does not — it dies with its wrangler parent on SIGTERM).
  pkill -f "wrangler.local.jsonc --port ${CI_E2E_PORT}" 2>/dev/null || true
  sleep 3
  if curl -sf "${CI_E2E_BASE}/api/v1/health" >/dev/null 2>&1; then
    pkill -9 -f "wrangler.local.jsonc --port ${CI_E2E_PORT}" 2>/dev/null || true
    # Last resort: an orphaned workerd still holding the socket. The runner
    # executes only this job, so no foreign workerd can match here.
    pkill -9 -f "workerd" 2>/dev/null || true
    sleep 3
  fi
  if curl -sf "${CI_E2E_BASE}/api/v1/health" >/dev/null 2>&1; then
    echo "ci-e2e-server: stale server still answering on :${CI_E2E_PORT}, refusing to continue" >&2
    return 1
  fi
}

# Boot a server and verify it is the one just started.
# Usage: ci_boot_server <expected-provider> <logfile> -- <wrangler dev args...>
ci_boot_server() {
  local expect="$1" log="$2"
  shift 2
  if [ "${1:-}" != "--" ]; then
    echo "ci-e2e-server: usage: ci_boot_server <provider> <logfile> -- <wrangler args...>" >&2
    return 1
  fi
  shift
  ci_stop_server || return 1
  npx wrangler dev "$@" >"${log}" 2>&1 &
  echo $! > "${CI_E2E_PIDFILE}"
  local i
  for i in $(seq 1 36); do
    curl -sf "${CI_E2E_BASE}/api/v1/health" >/dev/null 2>&1 && break
    sleep 5
  done
  curl -sf "${CI_E2E_BASE}/api/v1/health" >/dev/null 2>&1 || {
    echo "ci-e2e-server: server never became healthy (see ${log})" >&2
    tail -30 "${log}" >&2 || true
    return 1
  }
  local got
  got="$(curl -sf "${CI_E2E_BASE}/api/v1/payments/config" 2>/dev/null | grep -o '"provider"[ ]*:[ ]*"[a-z]*"' | head -1 || true)"
  if [ "${got}" != "\"provider\":\"${expect}\"" ] && [ "${got}" != "\"provider\": \"${expect}\"" ]; then
    echo "ci-e2e-server: expected provider '${expect}' but server says ${got:-<unreadable>} — stale server? (see ${log})" >&2
    tail -30 "${log}" >&2 || true
    return 1
  fi
}
