#!/usr/bin/env python3
"""scikit-learn defect-risk wrapper -- branch TS-105.

Scores every TypeScript file under src/ for defect risk from its own git history
and source shape, the signals the Risk Detection / Defect Probability metric asks
for. Writes reports/defect-probability.json.

Features per file: commits, lines added, lines deleted, distinct authors, source
lines, and branch points (if / for / while / case / && / || / ?).

Two modes, chosen from the data and recorded in the report:
  supervised    a RandomForest on "touched by a fix commit" labels, scored out of
                fold so a file never predicts its own label. Used only when both
                classes exist with at least 2 members each.
  unsupervised  an IsolationForest anomaly score, rescaled to 0..1. Used when the
                history carries no usable fix labels (the usual case for a synthetic
                history). It ranks files by how unusual they are; it is NOT a
                calibrated probability.

Both are seeded (random_state=0), so a rerun on the same commit gives the same scores.
"""
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REPORTS = os.path.join(REPO_ROOT, "reports")
FIX_RE = re.compile(r"\b(fix|fixes|fixed|bug|defect|hotfix|patch)\b", re.IGNORECASE)
BRANCH_RE = re.compile(r"\b(if|for|while|case|catch)\b|&&|\|\||\?")


def git(*args):
    return subprocess.run(
        ["git", *args], cwd=REPO_ROOT, capture_output=True, text=True, check=True
    ).stdout


def source_files():
    out = []
    for root, _dirs, names in os.walk(os.path.join(REPO_ROOT, "src")):
        for n in names:
            if n.endswith(".ts") and not n.endswith(".d.ts"):
                out.append(os.path.relpath(os.path.join(root, n), REPO_ROOT).replace(os.sep, "/"))
    return sorted(out)


def history(files):
    stats = {f: {"commits": 0, "added": 0, "deleted": 0, "authors": set(), "fix_commits": 0} for f in files}
    wanted = set(files)
    log = git("log", "--no-merges", "--numstat", "--format=@@%H\x1f%ae\x1f%s", "--", "src")
    cur = None
    for line in log.splitlines():
        if line.startswith("@@"):
            _h, email, subject = line[2:].split("\x1f", 2)
            cur = (email, bool(FIX_RE.search(subject)))
        elif line.strip() and cur:
            parts = line.split("\t")
            if len(parts) == 3 and parts[2] in wanted:
                s = stats[parts[2]]
                s["commits"] += 1
                s["authors"].add(cur[0])
                s["fix_commits"] += 1 if cur[1] else 0
                s["added"] += int(parts[0]) if parts[0].isdigit() else 0
                s["deleted"] += int(parts[1]) if parts[1].isdigit() else 0
    return stats


def main():
    try:
        import numpy as np
        import sklearn
        from sklearn.ensemble import IsolationForest, RandomForestClassifier
        from sklearn.model_selection import StratifiedKFold, cross_val_predict
    except ImportError:
        print("[scikit-learn] SKIP -- scikit-learn is not installed (run_scikit_learn.sh installs it)")
        return 0

    os.makedirs(REPORTS, exist_ok=True)
    files = source_files()
    if len(files) < 4:
        print("[scikit-learn] FAIL: fewer than 4 source files, nothing to model")
        return 1
    stats = history(files)

    rows = []
    for f in files:
        with open(os.path.join(REPO_ROOT, f), encoding="utf-8") as fh:
            text = fh.read()
        s = stats[f]
        rows.append([
            s["commits"], s["added"], s["deleted"], len(s["authors"]),
            len(text.splitlines()), len(BRANCH_RE.findall(text)),
        ])
    X = np.array(rows, dtype=float)
    y = np.array([1 if stats[f]["fix_commits"] > 0 else 0 for f in files])

    pos, neg = int(y.sum()), int((1 - y).sum())
    if min(pos, neg) >= 2:
        mode = "supervised"
        folds = StratifiedKFold(n_splits=min(5, pos, neg), shuffle=True, random_state=0)
        model = RandomForestClassifier(n_estimators=200, random_state=0)
        risk = cross_val_predict(model, X, y, cv=folds, method="predict_proba")[:, 1]
    else:
        mode = "unsupervised"
        model = IsolationForest(n_estimators=200, random_state=0).fit(X)
        raw = -model.score_samples(X)  # higher = more anomalous
        span = float(raw.max() - raw.min())
        risk = (raw - raw.min()) / span if span else np.zeros_like(raw)

    names = ["commits", "lines_added", "lines_deleted", "authors", "source_lines", "branch_points"]
    report = {
        "tool": "scikit-learn",
        "version": sklearn.__version__,
        "mode": mode,
        "calibrated_probability": mode == "supervised",
        "labels": {"fix_touched": pos, "not_fix_touched": neg},
        "features": names,
        "files": sorted(
            (
                {"file": f, "risk": round(float(r), 4), **dict(zip(names, map(int, row)))}
                for f, r, row in zip(files, risk, rows)
            ),
            key=lambda d: -d["risk"],
        ),
    }
    with open(os.path.join(REPORTS, "defect-probability.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)

    print(f"[scikit-learn] version: {sklearn.__version__} | mode: {mode} | files: {len(files)} "
          f"| fix-touched: {pos} / clean: {neg}")
    for d in report["files"][:8]:
        print(f"    {d['risk']:.3f}  {d['file']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
