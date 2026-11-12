#!/usr/bin/env bash
# scikit-learn runner -- branch TS-105 (Node 20, npm, Monolith).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
mkdir -p reports

# scikit-learn 1.6.1 is a Python library, not an npm package. It is installed on demand into a virtualenv under
# reports/.tool-cache (git-ignored) so it never touches the system Python or package.json.
VENV="${SKLEARN_VENV:-reports/.tool-cache/scikit-learn-venv}"  # SKLEARN_VENV: override, e.g. a short path on Windows
if [ -x "$VENV/bin/python" ]; then PY="$VENV/bin/python"; elif [ -x "$VENV/Scripts/python.exe" ]; then PY="$VENV/Scripts/python.exe"; else PY=""; fi
if [ -z "$PY" ]; then
  # Take the first interpreter that really runs (on Windows `python3` can be a Microsoft Store stub that does not).
  BASE_PY=""
  for c in python3 python; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c "import sys" >/dev/null 2>&1; then BASE_PY="$c"; break; fi
  done
  [ -n "$BASE_PY" ] || { echo "[scikit-learn] SKIP -- no working python3 on PATH"; exit 0; }
  "$BASE_PY" -m venv "$VENV" || { echo "[scikit-learn] SKIP -- could not create a virtualenv"; exit 0; }
  if [ -x "$VENV/bin/python" ]; then PY="$VENV/bin/python"; else PY="$VENV/Scripts/python.exe"; fi
  "$PY" -m pip install --quiet --disable-pip-version-check -r "Tool Triggering (Synthetic Data)/scikit-learn/requirements.txt" \
    || { echo "[scikit-learn] SKIP -- could not install scikit-learn==1.6.1 (needs network and a pip that can reach PyPI; see the pip error above)"; exit 0; }
fi
"$PY" "Tool Triggering (Synthetic Data)/scikit-learn/defect_probability.py"
