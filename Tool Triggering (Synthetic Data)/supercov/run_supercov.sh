#!/usr/bin/env bash
# supercov runner -- branch TS-105 (Node 20, npm, Monolith).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
mkdir -p reports

# supercov measures line, statement, function, branch and MC/DC (condition) coverage of the full mocha command, with
# per-test attribution. Installed on demand into reports/.tool-cache/<name> (git-ignored) and pinned below. It is
# deliberately NOT a package.json dependency: every supercov release declares engines.node >=22, and a dependency
# would break `npm ci` for the Node >=20.19 <21 this branch is locked to.
PIN="4.19.0"
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "[supercov] SKIP -- supercov@$PIN needs Node >=22 (this is Node $(node -v)); run it from a Node 22+ shell"
  exit 0
fi
if [ ! -e "reports/.tool-cache/supercov/node_modules/supercov/package.json" ]; then
  npm install --prefix "reports/.tool-cache/supercov" --no-save --no-package-lock --no-audit --no-fund --ignore-scripts --loglevel=error "supercov@$PIN" >/dev/null \
    || { echo "[supercov] SKIP -- could not install supercov@$PIN (needs npm and network)"; exit 0; }
fi
SUPERCOV="reports/.tool-cache/supercov/node_modules/.bin/supercov"
echo "[supercov] version: $PIN"

# The wrapped command's own exit code is a test result, not a runner failure: supercov still records coverage.
"$SUPERCOV" -- node node_modules/mocha/bin/mocha.js --config "Tool Triggering (Synthetic Data)/mocha/.mocharc.cjs" > reports/supercov.log 2>&1 || true
tail -3 reports/supercov.log | sed 's/^/   /'

"$SUPERCOV" runs latest --json > reports/supercov.json
node -e "
  const r = JSON.parse(require('fs').readFileSync('reports/supercov.json', 'utf8'));
  if (!r.ok) { console.error('[supercov] FAIL: no run summary'); process.exit(1); }
  const c = r.data.coverage;
  const pct = (m) => (c[m] && c[m].percentage) + '%';
  console.log('[supercov] lines', pct('lines'), '| branches', pct('branches'), '| functions', pct('functions'),
    '| MC/DC conditions', c.conditionCoveragePct + '%', '| tests', r.data.tests);
  if (!(c.lines.percentage > 0)) { console.error('[supercov] FAIL: zero coverage'); process.exit(1); }
  console.log('[supercov] OK -- non-zero');
"
