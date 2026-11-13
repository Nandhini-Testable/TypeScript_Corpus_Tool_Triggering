#!/usr/bin/env bash
# ts-complex runner -- branch TS-105 (Node 20, npm, Monolith).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
mkdir -p reports

# Installed on demand into reports/.tool-cache/<name> (git-ignored) and pinned below. It is deliberately NOT a
# package.json dependency: ts-complex bundles its own TypeScript 2.x, which must not be hoisted next to the 5.9.3
# this branch is pinned to, and a new dependency would change the lockfile of every package manager on this branch.
tool_install() {  # tool_install <name> <check-path> <package@version>...
  local name="$1" check="$2"; shift 2
  if [ -e "reports/.tool-cache/$name/node_modules/$check" ]; then return 0; fi
  npm install --prefix "reports/.tool-cache/$name" --no-save --no-package-lock --no-audit --no-fund --ignore-scripts --loglevel=error "$@" >/dev/null
}

PIN="1.0.0"
tool_install ts-complex ts-complex/package.json "ts-complex@$PIN" || { echo "[ts-complex] SKIP -- could not install ts-complex@$PIN (needs npm and network)"; exit 0; }
echo "[ts-complex] version: $PIN"
npx --no-install ts-node "Tool Triggering (Synthetic Data)/ts-complex/ts_complex_report.ts"
