#!/usr/bin/env bash
# typhonjs-escomplex runner -- branch TS-105 (Node 20, npm, Monolith).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
mkdir -p reports

# Installed on demand into reports/.tool-cache/<name> (git-ignored) and pinned below. It is deliberately NOT a
# package.json dependency: a new dependency would change the lockfile of every package manager on this branch.
tool_install() {  # tool_install <name> <check-path> <package@version>...
  local name="$1" check="$2"; shift 2
  if [ -e "reports/.tool-cache/$name/node_modules/$check" ]; then return 0; fi
  npm install --prefix "reports/.tool-cache/$name" --no-save --no-package-lock --no-audit --no-fund --ignore-scripts --loglevel=error "$@" >/dev/null
}

PIN="0.1.0"
tool_install typhonjs-escomplex typhonjs-escomplex/package.json "typhonjs-escomplex@$PIN" || { echo "[typhonjs-escomplex] SKIP -- could not install typhonjs-escomplex@$PIN (needs npm and network)"; exit 0; }
echo "[typhonjs-escomplex] version: $PIN"
node "Tool Triggering (Synthetic Data)/typhonjs-escomplex/typhonjs_escomplex_report.cjs"
