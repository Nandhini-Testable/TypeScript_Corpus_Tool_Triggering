#!/usr/bin/env bash
# oxc-coverage-instrument runner -- branch TS-105 (Node 20, npm, Monolith).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
mkdir -p reports

# Installed on demand into reports/.tool-cache/<name> (git-ignored) and pinned below. It is deliberately NOT a
# package.json dependency: a new dependency would change the lockfile of every package manager on this branch.
tool_install() {  # tool_install <name> <bin> <package@version>...
  local name="$1" bin="$2"; shift 2
  if [ -x "reports/.tool-cache/$name/node_modules/.bin/$bin" ]; then return 0; fi
  npm install --prefix "reports/.tool-cache/$name" --no-save --no-package-lock --no-audit --no-fund --loglevel=error "$@" >/dev/null
}

PIN="0.13.0"
tool_install oxc-coverage oxc-coverage-instrument "oxc-coverage-instrument@$PIN" || { echo "[oxc-coverage-instrument] SKIP -- could not install oxc-coverage-instrument@$PIN"; exit 0; }
# The npm package is a library (no bin): instrument.ts instruments every .ts file under the source root and
# tallies the Istanbul coverage map (statements, functions, branches) the instrumenter produced.
node_modules/.bin/ts-node "Tool Triggering (Synthetic Data)/oxc-coverage/instrument.ts" src reports/.tool-cache/oxc-coverage/node_modules/oxc-coverage-instrument reports/oxc-coverage.json
