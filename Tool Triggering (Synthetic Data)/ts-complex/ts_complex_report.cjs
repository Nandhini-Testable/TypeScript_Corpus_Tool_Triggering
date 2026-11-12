"use strict";
/* ts-complex: per-function Halstead + cyclomatic complexity and per-file maintainability for every file under src/.
 * Cross-check for Lizard / typhonjs-escomplex on the Maintainability Analysis metric. Writes reports/ts-complex.json. */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const cache = path.join(ROOT, "reports", ".tool-cache", "ts-complex");
const tsc = require(require.resolve("ts-complex", { paths: [cache] }));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".ts") && !e.name.endsWith(".d.ts") ? [p] : [];
  });
}

const files = walk(path.join(ROOT, "src")).sort();
const report = { tool: "ts-complex", version: "1.0.0", files: [], errors: [] };
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
        cyclomatic: cyclomatic[name],
        halsteadVolume: halstead[name] ? halstead[name].volume : null,
        halsteadDifficulty: halstead[name] ? halstead[name].difficulty : null,
      })),
    });
  } catch (e) {
    report.errors.push({ file: rel, error: String(e && e.message ? e.message : e).slice(0, 200) });
  }
}
fs.writeFileSync(path.join(ROOT, "reports", "ts-complex.json"), JSON.stringify(report, null, 2));
const fns = report.files.reduce((n, f) => n + f.functions.length, 0);
console.log("[ts-complex] files:", report.files.length, "/", files.length, "| functions:", fns, "| errors:", report.errors.length);
report.files.forEach((f) => console.log("   ", String(f.averageMaintainability).padStart(7), f.file));
if (report.files.length === 0) {
  console.error("[ts-complex] FAIL: no file was analysed");
  process.exit(1);
}
