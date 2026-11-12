"use strict";
/* typhonjs-escomplex: Halstead / cyclomatic / maintainability for every file under src/ (its Babel parser reads the
 * TypeScript syntax used here). Primary for Maintainability Analysis next to Lizard.
 * Writes reports/typhonjs-escomplex.json. */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const cache = path.join(ROOT, "reports", ".tool-cache", "typhonjs-escomplex");
const escomplex = require(require.resolve("typhonjs-escomplex", { paths: [cache] }));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".ts") && !e.name.endsWith(".d.ts") ? [p] : [];
  });
}

const fn = (m) => ({
  name: m.name,
  line: m.lineStart,
  cyclomatic: m.cyclomatic,
  halsteadVolume: m.halstead && m.halstead.volume,
  halsteadDifficulty: m.halstead && m.halstead.difficulty,
  params: m.paramCount,
});

const files = walk(path.join(ROOT, "src")).sort();
const report = { tool: "typhonjs-escomplex", version: "0.1.0", files: [], errors: [] };
for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join("/");
  try {
    const r = escomplex.analyzeModule(fs.readFileSync(f, "utf8"));
    // Free functions are reported under methods[], class methods under classes[].methods.
    const functions = r.methods.map(fn).concat(r.classes.flatMap((c) => c.methods.map(fn)));
    report.files.push({
      file: rel,
      maintainability: r.maintainability,
      cyclomatic: r.aggregate.cyclomatic,
      sloc: r.aggregate.sloc && r.aggregate.sloc.logical,
      functions,
    });
  } catch (e) {
    report.errors.push({ file: rel, error: String(e && e.message ? e.message : e).slice(0, 200) });
  }
}
fs.writeFileSync(path.join(ROOT, "reports", "typhonjs-escomplex.json"), JSON.stringify(report, null, 2));
const fns = report.files.reduce((n, f) => n + f.functions.length, 0);
console.log("[typhonjs-escomplex] files:", report.files.length, "/", files.length, "| functions:", fns, "| errors:", report.errors.length);
report.files.forEach((f) => console.log("   ", String(f.maintainability).padStart(8), f.file));
if (report.files.length === 0) {
  console.error("[typhonjs-escomplex] FAIL: no file was analysed");
  process.exit(1);
}
