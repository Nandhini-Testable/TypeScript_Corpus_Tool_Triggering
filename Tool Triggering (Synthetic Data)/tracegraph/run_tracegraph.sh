#!/usr/bin/env bash
# TraceGraph runner -- branch TS-105 (Node 20, npm, Monolith).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
mkdir -p reports

# Installed on demand into reports/.tool-cache/<name> (git-ignored) and pinned below. It is deliberately NOT a
# package.json dependency: a new dependency would change the lockfile of every package manager on this branch.
tool_install() {  # tool_install <name> <bin> <package@version>...
  local name="$1" bin="$2"; shift 2
  if [ -d "reports/.tool-cache/$name/node_modules/@tracegraph/trace-js" ]; then return 0; fi
  npm install --prefix "reports/.tool-cache/$name" --no-save --no-package-lock --no-audit --no-fund --loglevel=error "$@" >/dev/null
}

PIN="0.3.1"
tool_install tracegraph "" "@tracegraph/trace-js@$PIN" || { echo "[tracegraph] SKIP -- could not install @tracegraph/trace-js@$PIN"; exit 0; }
# @tracegraph/trace-js is an instrumentation library (no CLI): trace_driver.ts wraps this branch's order-service
# functions with traceFunction() and runs them, so the call path is written as JSONL events to reports/tracegraph.
rm -rf reports/tracegraph && mkdir -p reports/tracegraph
TS_NODE_PROJECT=tsconfig.json node_modules/.bin/ts-node "Tool Triggering (Synthetic Data)/tracegraph/trace_driver.ts" reports/.tool-cache/tracegraph src reports/tracegraph
