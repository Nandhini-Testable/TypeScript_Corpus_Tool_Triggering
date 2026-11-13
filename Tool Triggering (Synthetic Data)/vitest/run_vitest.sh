#!/usr/bin/env bash
# vitest + @vitest/coverage-v8 runner -- branch TS-105 (Node 20, npm, Monolith).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
mkdir -p reports

# Read a dependency's version WITHOUT require()-ing its package.json.
# Modern packages declare an "exports" map that omits "./package.json", so
# require('<pkg>/package.json') throws ERR_PACKAGE_PATH_NOT_EXPORTED --
# @rollup/plugin-typescript 12.x is one. Reading the file directly works under
# every package manager, because these are all DIRECT dependencies.
pkgver() {
  node -e "try{console.log(JSON.parse(require('fs').readFileSync('node_modules/'+process.argv[1]+'/package.json','utf8')).version)}catch(e){console.log('unresolved')}" "$1"
}

# vitest 4.1.11 (needs Node ^20.19 || ^22.12 || >=24, the engines of this branch).
#
# vitest does NOT replace mocha. It runs the SAME spec files as an independent
# second runner, so the suite stays identical across every Node version in the
# corpus. It also yields a third coverage number alongside c8 and nyc.
#
# Coverage comes from @vitest/coverage-istanbul (vitest.config.ts): an AST-instrumented
# Istanbul map, which is what the path, all-defs/uses and coverage-delta tools read.
# @vitest/coverage-v8 stays installed as the independent cross-check:
#   node_modules/.bin/vitest run --coverage --coverage.provider=v8
echo "[vitest] version: $(pkgver vitest)"
node_modules/.bin/vitest run --config vitest.config.ts --coverage 2>&1 | tail -25
node -e "
  const s = require('./coverage-vitest/coverage-summary.json').total;
  console.log('[vitest] stmts', s.statements.pct + '%', '| branch', s.branches.pct + '%', '| funcs', s.functions.pct + '%');
  if (!(s.statements.pct > 0)) { console.error('[vitest] FAIL: zero coverage'); process.exit(1); }
  console.log('[vitest] OK -- non-zero, and independent of both c8 and nyc');
"
