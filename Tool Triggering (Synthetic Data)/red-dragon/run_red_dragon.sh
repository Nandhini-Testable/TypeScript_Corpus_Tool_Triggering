#!/usr/bin/env bash
# data-flow runner -- branch TS-105 (Node 20, npm, Monolith).
# TypeScript replacement for the former red-dragon driver (Python >= 3.13, uv, a git clone of red-dragon). It uses the
# TypeScript compiler API instead and is a different, flow-insensitive analysis -- see dataflow.ts for the differences.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
mkdir -p reports
node_modules/.bin/ts-node "Tool Triggering (Synthetic Data)/red-dragon/dataflow.ts" reports/dataflow.json \
  src/analysis/call-graph-sample.ts src/analysis/complexity-sample.ts src/analysis/taint-fixture.ts src/analysis/dead-code.ts
