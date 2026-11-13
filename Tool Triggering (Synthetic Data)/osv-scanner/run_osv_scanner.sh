#!/usr/bin/env bash
# OSV-Scanner runner -- branch TS-105 (Node 20, npm, Monolith).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
mkdir -p reports

# OSV-Scanner. The metric sheet names the OSV REST API (POST https://api.osv.dev/v1/querybatch), so that is what
# this runner calls, with every package of the CycloneDX SBOM that cdxgen produces for this branch.
# If the osv-scanner CLI (v2.6.0, GitHub release) is on PATH it is run too, on this branch's lockfile only.
test -f reports/sbom.json || bash "Tool Triggering (Synthetic Data)/cdxgen/run_cdxgen.sh"
node_modules/.bin/ts-node "Tool Triggering (Synthetic Data)/osv-scanner/osv_query.ts" reports/sbom.json reports/osv.json || echo "[osv-scanner] REST query did not complete (needs api.osv.dev)"
if command -v osv-scanner >/dev/null 2>&1; then
  echo "[osv-scanner] CLI: $(osv-scanner --version 2>&1 | head -1)"
  osv-scanner scan source --format json --output reports/osv-scanner.json -L "package-lock.json" || true
else
  echo "[osv-scanner] CLI not installed -- REST result only (CLI: github.com/google/osv-scanner releases, v2.6.0)"
fi
