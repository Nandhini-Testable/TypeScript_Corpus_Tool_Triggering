#!/usr/bin/env ts-node
/* ts-complex: per-function Halstead + cyclomatic complexity and per-file maintainability for every file under src/.
 * Cross-check for Lizard / typhonjs-escomplex on the Maintainability Analysis metric. Writes reports/ts-complex.json. */
import * as fs from "fs";
import * as path from "path";

interface Maintainability {
  readonly averageMaintainability: number;
  readonly minMaintainability: number;
}
interface Halstead {
  readonly volume: number;
  readonly difficulty: number;
}
// ts-complex is installed on demand into reports/.tool-cache and ships no declarations.
interface TsComplex {
  calculateMaintainability(file: string): Maintainability;
  calculateCyclomaticComplexity(file: string): Record<string, number>;
  calculateHalstead(file: string): Record<string, Halstead>;
}

interface FunctionRow {
  readonly name: string;
  readonly cyclomatic: number;
  readonly halsteadVolume: number | null;
  readonly halsteadDifficulty: number | null;
}
interface FileRow extends Maintainability {
  readonly file: string;
  readonly functions: FunctionRow[];
}

const ROOT = process.cwd();
const cache = path.join(ROOT, "reports", ".tool-cache", "ts-complex");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tsc = require(require.resolve("ts-complex", { paths: [cache] })) as TsComplex;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".ts") && !e.name.endsWith(".d.ts") ? [p] : [];
  });
}

const files = walk(path.join(ROOT, "src")).sort();
const report: { tool: string; version: string; files: FileRow[]; errors: { file: string; error: string }[] } = {
  tool: "ts-complex",
  version: "1.0.0",
  files: [],
  errors: [],
};
for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join("/");
  try {
    const maint = tsc.calculateMaintainability(f);
    const cyclomatic = tsc.calculateCyclomaticComplexity(f);
    const halstead = tsc.calculateHalstead(f);
    report.files.push({
      file: rel,
      averageMaintainability: maint.averageMaintainability,
      minMaintainability: maint.minMaintainability,
      functions: Object.keys(cyclomatic).map((name) => ({
        name,
        cyclomatic: cyclomatic[name] as number,
        halsteadVolume: halstead[name] ? halstead[name].volume : null,
        halsteadDifficulty: halstead[name] ? halstead[name].difficulty : null,
      })),
    });
  } catch (e) {
    report.errors.push({ file: rel, error: String(e instanceof Error ? e.message : e).slice(0, 200) });
  }
}
fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "reports", "ts-complex.json"), JSON.stringify(report, null, 2));
const fns = report.files.reduce((n, f) => n + f.functions.length, 0);
console.log("[ts-complex] files:", report.files.length, "/", files.length, "| functions:", fns, "| errors:", report.errors.length);
report.files.forEach((f) => console.log("   ", String(f.averageMaintainability).padStart(7), f.file));
if (report.files.length === 0) {
  console.error("[ts-complex] FAIL: no file was analysed");
  process.exit(1);
}
