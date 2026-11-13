#!/usr/bin/env ts-node
/* history runner -- branch TS-105.
 *
 * Mines this repository's own history for the three signals the history-tool
 * family is assigned to produce: churn, change coupling and ownership.
 *
 * The history is synthetic but structurally real -- see README, "History design".
 * Ownership is carried in Co-authored-by trailers, so a tool that counts only the
 * author field will report a single contributor and be wrong.
 *
 * This is the TypeScript port of run_pydriller.py. PyDriller itself is a Python
 * library, so it is not used: the port reads the same `git log --numstat` data
 * PyDriller is built on (the Python runner's own `git` fallback) and writes the
 * same reports/history.json document.
 */
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

type Pair = readonly [string, number];

interface History {
  readonly commits: number;
  readonly churn: Map<string, number>;
  readonly touchedPerCommit: string[][];
  readonly authors: Map<string, number>;
}

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const REPORTS = path.join(REPO_ROOT, "reports");
/* Change coupling pairs every file of a commit with every other, which is quadratic in the commit's size. A bulk
 * import (this repository's history has commits of 22,000+ files) would need hundreds of millions of pairs, and
 * is not a meaningful co-change signal anyway, so commits touching more files than this are left out of coupling
 * only. Churn and ownership still count them. The Python runner had no such guard and could not finish here. */
const COUPLING_MAX_FILES = Number(process.env.HISTORY_COUPLING_MAX_FILES ?? 100);

/** Counter.most_common: highest count first, ties in first-seen order (Array.sort is stable). */
function mostCommon(counter: ReadonlyMap<string, number>, limit?: number): Pair[] {
  const sorted = [...counter.entries()].sort((a, b) => b[1] - a[1]);
  return limit === undefined ? sorted : sorted.slice(0, limit);
}

function bump(counter: Map<string, number>, key: string, by = 1): void {
  counter.set(key, (counter.get(key) ?? 0) + by);
}

function readHistory(): History {
  // Record layout:  <sha>  <email>  <full body>  <numstat>.
  // The body is MULTI-LINE, so it needs its own terminator (\x03). Splitting a
  // record on the first newline would treat everything after the commit SUBJECT
  // as numstat, so the Co-authored-by: trailers -- the entire point of the
  // ownership metric -- would never be counted and the commit total would
  // collapse. The report would still be written, still derived from a real git
  // log, and still wrong.
  const log = execFileSync(
    "git",
    ["-c", "core.longpaths=true", "-C", REPO_ROOT, "log", "--pretty=format:%x02%H%x01%ae%x01%B%x03", "--numstat"],
    // stderr is captured, not inherited: git's path warnings stay quiet and a real failure still throws with its message.
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
  );

  const churn = new Map<string, number>();
  const authors = new Map<string, number>();
  const touchedPerCommit: string[][] = [];
  let commits = 0;

  for (const block of log.split("\x02")) {
    if (block.trim() === "") continue;
    const split = block.indexOf("\x03");
    const head = split === -1 ? block : block.slice(0, split);
    const stats = split === -1 ? "" : block.slice(split + 1);
    const parts = head.split("\x01");
    if (parts.length < 3) continue;
    commits += 1;
    bump(authors, parts[1] as string);
    for (const trailer of (parts[2] as string).matchAll(/Co-authored-by:\s*.+?<(.+?)>/gi)) {
      bump(authors, (trailer[1] as string).trim());
    }
    const files: string[] = [];
    for (const line of stats.split(/\r?\n/)) {
      const cols = line.split("\t");
      if (cols.length === 3 && /^\d+$/.test(cols[0] as string) && /^\d+$/.test(cols[1] as string)) {
        files.push(cols[2] as string);
        bump(churn, cols[2] as string, Number(cols[0]) + Number(cols[1]));
      }
    }
    if (files.length > 0) touchedPerCommit.push(files);
  }
  return { commits, churn, touchedPerCommit, authors };
}

function main(): number {
  const { commits, churn, touchedPerCommit, authors } = readHistory();

  const coupling = new Map<string, number>();
  const pairs = new Map<string, [string, string]>();
  let skippedBulk = 0;
  for (const files of touchedPerCommit) {
    if (files.length > COUPLING_MAX_FILES) {
      skippedBulk += 1;
      continue;
    }
    const uniq = [...new Set(files)].sort();
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const key = `${uniq[i]}\x00${uniq[j]}`;
        pairs.set(key, [uniq[i] as string, uniq[j] as string]);
        bump(coupling, key);
      }
    }
  }

  const totalCommits = [...authors.values()].reduce((a, b) => a + b, 0) || 1;
  const ownership: Record<string, number> = {};
  for (const [who, n] of mostCommon(authors)) ownership[who] = Math.round((1000 * n) / totalCommits) / 10;
  const topCoupling = mostCommon(coupling, 10);

  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(
    path.join(REPORTS, "history.json"),
    JSON.stringify(
      {
        backend: "git (TypeScript port; PyDriller not used)",
        commits,
        coupling_commits_skipped_as_bulk: skippedBulk,
        churn: mostCommon(churn, 15),
        coupling: topCoupling.map(([key, n]) => ({ pair: pairs.get(key), co_changes: n })),
        ownership_pct: ownership,
      },
      null,
      2,
    ),
  );

  console.log("[history] backend: git (TypeScript port)");
  console.log(`[history] commits analysed: ${commits}`);
  console.log("[history] top churn:");
  for (const [name, lines] of mostCommon(churn, 5)) console.log(`    ${String(lines).padStart(6)}  ${name}`);
  console.log("[history] top change coupling:");
  for (const [key, n] of topCoupling.slice(0, 5)) {
    const [left, right] = pairs.get(key) as [string, string];
    console.log(`    ${String(n).padStart(3)}x  ${left}  <->  ${right}`);
  }
  console.log("[history] ownership (author field + Co-authored-by trailers):");
  for (const [who, pct] of Object.entries(ownership).slice(0, 6)) {
    console.log(`    ${pct.toFixed(1).padStart(5)}%  ${who}`);
  }

  if (Object.keys(ownership).length < 2) {
    console.error("[history] FAIL: only one contributor found -- trailers were not counted");
    return 1;
  }
  return 0;
}

process.exit(main());
