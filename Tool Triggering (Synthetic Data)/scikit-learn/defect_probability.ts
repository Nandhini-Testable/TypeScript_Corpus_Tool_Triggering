#!/usr/bin/env ts-node
/* Defect-risk wrapper -- branch TS-105.
 *
 * TypeScript port of defect_probability.py. Scores every TypeScript file under src/
 * for defect risk from its own git history and source shape, the signals the Risk
 * Detection / Defect Probability metric asks for. Writes reports/defect-probability.json.
 *
 * Features per file (identical to the Python version): commits, lines added, lines
 * deleted, distinct authors, source lines, and branch points (if / for / while / case /
 * catch / && / || / ?).
 *
 * What is NOT the same as the Python version, and why:
 *   - The Python version used scikit-learn. scikit-learn has no TypeScript equivalent,
 *     so the IsolationForest below is a from-scratch implementation of the published
 *     algorithm (Liu, Ting, Zhou 2008). It is seeded and deterministic, and ranks files
 *     the same way an isolation forest does, but its scores are not scikit-learn's.
 *   - The supervised RandomForest branch (used when both "fix-touched" and clean files
 *     exist) is not ported. This script is always `unsupervised`; the report still
 *     records the label counts, and `supervised_available` is false.
 *   - The score is an anomaly ranking rescaled to 0..1. It is NOT a calibrated probability.
 */
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface FileStats {
  commits: number;
  added: number;
  deleted: number;
  authors: Set<string>;
  fixCommits: number;
}

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const REPORTS = path.join(REPO_ROOT, "reports");
const FIX_RE = /\b(fix|fixes|fixed|bug|defect|hotfix|patch)\b/i;
const BRANCH_RE = /\b(if|for|while|case|catch)\b|&&|\|\||\?/g;
const FEATURES = ["commits", "lines_added", "lines_deleted", "authors", "source_lines", "branch_points"] as const;
const TREES = 200;
const SEED = 0;

function git(args: string[]): string {
  return execFileSync("git", ["-c", "core.longpaths=true", "-C", REPO_ROOT, ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) {
        out.push(path.relative(REPO_ROOT, p).split(path.sep).join("/"));
      }
    }
  };
  walk(path.join(REPO_ROOT, "src"));
  return out.sort();
}

function history(files: string[]): Map<string, FileStats> {
  const stats = new Map<string, FileStats>(
    files.map((f) => [f, { commits: 0, added: 0, deleted: 0, authors: new Set<string>(), fixCommits: 0 }]),
  );
  const log = git(["log", "--no-merges", "--numstat", "--format=@@%H\x1f%ae\x1f%s", "--", "src"]);
  let current: { email: string; fix: boolean } | undefined;
  for (const line of log.split(/\r?\n/)) {
    if (line.startsWith("@@")) {
      const [, email, subject] = line.slice(2).split("\x1f");
      current = { email: email ?? "", fix: FIX_RE.test(subject ?? "") };
    } else if (line.trim() !== "" && current) {
      const parts = line.split("\t");
      const s = parts.length === 3 ? stats.get(parts[2] as string) : undefined;
      if (s) {
        s.commits += 1;
        s.authors.add(current.email);
        if (current.fix) s.fixCommits += 1;
        if (/^\d+$/.test(parts[0] as string)) s.added += Number(parts[0]);
        if (/^\d+$/.test(parts[1] as string)) s.deleted += Number(parts[1]);
      }
    }
  }
  return stats;
}

/** mulberry32: a small seeded PRNG, so a rerun on the same commit gives the same scores. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Average path length of an unsuccessful BST search over n points: the isolation-forest normaliser c(n). */
function c(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
}

type Tree = { leaf: true; size: number } | { leaf: false; dim: number; split: number; left: Tree; right: Tree };

function grow(rows: number[][], depth: number, limit: number, rand: () => number): Tree {
  if (depth >= limit || rows.length <= 1) return { leaf: true, size: rows.length };
  const dims: number[] = [];
  for (let d = 0; d < (rows[0] as number[]).length; d++) {
    const col = rows.map((r) => r[d] as number);
    if (Math.min(...col) < Math.max(...col)) dims.push(d);
  }
  if (dims.length === 0) return { leaf: true, size: rows.length };
  const dim = dims[Math.floor(rand() * dims.length)] as number;
  const col = rows.map((r) => r[dim] as number);
  const lo = Math.min(...col);
  const hi = Math.max(...col);
  const split = lo + rand() * (hi - lo);
  return {
    leaf: false,
    dim,
    split,
    left: grow(rows.filter((r) => (r[dim] as number) < split), depth + 1, limit, rand),
    right: grow(rows.filter((r) => (r[dim] as number) >= split), depth + 1, limit, rand),
  };
}

function pathLength(tree: Tree, row: number[], depth = 0): number {
  if (tree.leaf) return depth + c(tree.size);
  return pathLength((row[tree.dim] as number) < tree.split ? tree.left : tree.right, row, depth + 1);
}

function isolationScores(rows: number[][]): number[] {
  const rand = rng(SEED);
  const sample = Math.min(256, rows.length);
  const limit = Math.ceil(Math.log2(Math.max(sample, 2)));
  const trees: Tree[] = [];
  for (let i = 0; i < TREES; i++) {
    const idx = rows.map((_, k) => k);
    for (let k = idx.length - 1; k > 0; k--) {
      const j = Math.floor(rand() * (k + 1));
      [idx[k], idx[j]] = [idx[j] as number, idx[k] as number];
    }
    trees.push(grow(idx.slice(0, sample).map((k) => rows[k] as number[]), 0, limit, rand));
  }
  const raw = rows.map((r) => 2 ** (-(trees.reduce((s, t) => s + pathLength(t, r), 0) / trees.length) / c(sample)));
  const lo = Math.min(...raw);
  const span = Math.max(...raw) - lo;
  return raw.map((v) => (span > 0 ? (v - lo) / span : 0));
}

function main(): number {
  const files = sourceFiles();
  if (files.length < 4) {
    console.log("[defect-risk] FAIL: fewer than 4 source files, nothing to model");
    return 1;
  }
  const stats = history(files);
  const rows = files.map((f) => {
    const s = stats.get(f) as FileStats;
    const text = fs.readFileSync(path.join(REPO_ROOT, f), "utf8");
    return [s.commits, s.added, s.deleted, s.authors.size, text.split(/\r?\n/).length, (text.match(BRANCH_RE) ?? []).length];
  });
  const fixTouched = files.filter((f) => (stats.get(f) as FileStats).fixCommits > 0).length;
  const risk = isolationScores(rows);

  const report = {
    tool: "defect-risk (TypeScript isolation forest)",
    mode: "unsupervised",
    calibrated_probability: false,
    supervised_available: false,
    seed: SEED,
    trees: TREES,
    labels: { fix_touched: fixTouched, not_fix_touched: files.length - fixTouched },
    features: FEATURES,
    files: files
      .map((file, i) => ({
        file,
        risk: Math.round((risk[i] as number) * 1e4) / 1e4,
        ...Object.fromEntries(FEATURES.map((name, k) => [name, (rows[i] as number[])[k]])),
      }))
      .sort((a, b) => b.risk - a.risk),
  };
  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(path.join(REPORTS, "defect-probability.json"), JSON.stringify(report, null, 2));

  console.log(
    `[defect-risk] mode: unsupervised (TypeScript isolation forest) | files: ${files.length} | fix-touched: ${fixTouched} / clean: ${files.length - fixTouched}`,
  );
  for (const d of report.files.slice(0, 8)) console.log(`    ${d.risk.toFixed(3)}  ${d.file}`);
  return 0;
}

process.exit(main());
