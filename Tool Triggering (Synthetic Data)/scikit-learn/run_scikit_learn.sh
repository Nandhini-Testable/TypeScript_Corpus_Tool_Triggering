#!/usr/bin/env bash
# defect-risk runner -- branch TS-105 (Node 20, npm, Monolith).
# TypeScript port of the former scikit-learn wrapper: no Python, no virtualenv, no pip. See defect_probability.ts for
# what differs from the scikit-learn version (own isolation forest; no supervised branch).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
mkdir -p reports
node_modules/.bin/ts-node "Tool Triggering (Synthetic Data)/scikit-learn/defect_probability.ts"
