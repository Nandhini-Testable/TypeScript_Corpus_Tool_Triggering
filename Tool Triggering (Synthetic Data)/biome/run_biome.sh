#!/usr/bin/env bash
# biome runner -- branch TS-105 (Node 20, npm, Monolith).
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

# biome 2.5.11 -- engines >=14.21.3. A Rust binary with its own parser: it never
# loads tsc, so it is independent of the TypeScript version in a way eslint is not.
#
# The formatter is ENABLED in biome.json (indent/EOL come from .editorconfig) so the
# 'formatter' use of Biome produces output. src/analysis is excluded from it: those
# planted fixtures must keep their exact shape for the other tools that measure them.
# Import-assist stays DISABLED -- import order is owned by eslint.
echo "[biome] version:"; node_modules/.bin/biome --version
echo
echo "[biome] 1/3 real source -- expect clean"
node_modules/.bin/biome check src/models src/services || true
echo
echo "[biome] 2/3 formatter report (real source + tests)"
node_modules/.bin/biome format src tests --reporter=json > reports/biome-format.json 2>/dev/null || true
node -e "
  let r; try { r = require('./reports/biome-format.json'); } catch (e) { console.log('[biome] no formatter JSON report'); process.exit(0); }
  console.log('[biome] formatter diagnostics:', (r.diagnostics || []).length);
"
echo
echo "[biome] 3/3 planted fixtures -- expect findings"
node_modules/.bin/biome check src/analysis --reporter=json > reports/biome.json 2>/dev/null || true
node -e "
  let r; try { r = require('./reports/biome.json'); } catch (e) { console.log('[biome] no JSON report'); process.exit(0); }
  const byRule = {};
  (r.diagnostics || []).forEach(d => { const k = d.category || 'unknown'; byRule[k] = (byRule[k]||0)+1; });
  Object.entries(byRule).slice(0,12).forEach(([k,v]) => console.log('[biome]', k, '->', v));
  const n = (r.diagnostics || []).length;
  console.log('[biome] total diagnostics:', n);
  if (n === 0) { console.error('[biome] FAIL: planted fixtures produced no findings'); process.exit(1); }
"
