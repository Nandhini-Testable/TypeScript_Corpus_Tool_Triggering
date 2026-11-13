#!/usr/bin/env ts-node
// usage: ts-node instrument.ts <source root> <path to oxc-coverage-instrument> <output json>
// Istanbul-compatible instrumentation (Oxc parser) of every .ts file; writes the per-file coverage-map sizes.
import * as fs from "fs";
import * as path from "path";

// oxc-coverage-instrument is installed on demand into reports/.tool-cache and ships no declarations here.
interface OxcInstrument {
  instrument(source: string, filename: string, options: { coverageVariable: string }): { coverageMap: string };
}
interface CoverageMap {
  readonly statementMap?: Record<string, unknown>;
  readonly fnMap?: Record<string, unknown>;
  readonly branchMap?: Record<string, unknown>;
}
interface Row {
  readonly file: string;
  readonly statements: number;
  readonly functions: number;
  readonly branches: number;
}

const [root, libArg, out] = process.argv.slice(2);
if (!root || !libArg || !out) {
  console.error("usage: instrument.ts <source root> <path to oxc-coverage-instrument> <output json>");
  process.exit(2);
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { instrument } = require(path.resolve(libArg)) as OxcInstrument;

function walk(dir: string, acc: string[]): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules") walk(p, acc);
    } else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

const files = walk(root, []).sort();
const rows: Row[] = [];
const totals = { statements: 0, functions: 0, branches: 0 };
for (const f of files) {
  const res = instrument(fs.readFileSync(f, "utf8"), f, { coverageVariable: "__coverage__" });
  const m = JSON.parse(res.coverageMap) as CoverageMap;
  const row: Row = {
    file: f,
    statements: Object.keys(m.statementMap ?? {}).length,
    functions: Object.keys(m.fnMap ?? {}).length,
    branches: Object.keys(m.branchMap ?? {}).length,
  };
  totals.statements += row.statements;
  totals.functions += row.functions;
  totals.branches += row.branches;
  rows.push(row);
}
fs.writeFileSync(out, JSON.stringify({ files: rows.length, totals, rows }, null, 2));
console.log("[oxc-coverage-instrument] files:", rows.length, "| statements:", totals.statements, "| functions:", totals.functions, "| branches:", totals.branches);
if (rows.length === 0) {
  console.error(`[oxc-coverage-instrument] FAIL: no .ts files under ${root}`);
  process.exit(1);
}
