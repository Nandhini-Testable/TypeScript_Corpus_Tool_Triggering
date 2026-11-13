#!/usr/bin/env ts-node
/**
 * Tool integration entry point -- branch TS-105.
 *
 * The direct analogue of the Python family's tool_integration.py, which
 * is itself the ToolIntegration.targets analogue from the C# reference repo.
 * One command proves every tool is wired.
 *
 *   ts-node "Tool Triggering (Synthetic Data)/tool_integration.ts"            print the wiring banner
 *   ts-node "Tool Triggering (Synthetic Data)/tool_integration.ts" --list     machine-readable tool list
 *   ts-node "Tool Triggering (Synthetic Data)/tool_integration.ts" --verify   every tool has folder+manifest+runner
 *   ts-node "Tool Triggering (Synthetic Data)/tool_integration.ts" --run TOOL run one tool's runner
 *   ts-node "Tool Triggering (Synthetic Data)/tool_integration.ts" --run-all  run every runner in order
 *
 * FlintAtlas and WillowBrook had no equivalent of this file, no trigger
 * manifests and no runners; their CI ran `npm install && npm test` and invoked
 * none of their declared tools. Gate G6.
 */
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..");
const TOOLS_DIR = path.join(REPO_ROOT, "Tool Triggering (Synthetic Data)");

export const NODE_TARGET = "20";
export const TYPESCRIPT_VERSION = "5.9.3";
export const BUNDLER_NAME = "vite";
export const PACKAGE_MANAGER = "npm";
export const ARCHITECTURE = "Monolith";

interface Wiring {
  readonly dir: string;
  readonly label: string;
  readonly wiring: string;
}

export const TOOL_WIRING: readonly Wiring[] = [
  { dir: "typescript", label: "TypeScript compiler (tsc)", wiring: "pinned 5.9.3 -> type diagnostics (must be empty)" },
  { dir: "vite", label: "Vite (esbuild-backed)", wiring: "pinned 8.2.2 -> build/bundle.cjs -- emitted by Vite (Rollup + its own esbuild transform), and the bundle is executed" },
  { dir: "mocha", label: "mocha", wiring: "pinned 11.8.0 -> test results (all must pass)" },
  { dir: "vitest", label: "vitest + @vitest/coverage-istanbul", wiring: "pinned 4.1.11 -> coverage-vitest/coverage-summary.json -- a THIRD independent coverage number, alongside c8 and nyc; istanbul provider, v8 as cross-check" },
  { dir: "biome", label: "biome", wiring: "pinned 2.5.10 -> planted findings expected" },
  { dir: "c8", label: "c8 (V8 coverage, primary)", wiring: "pinned 12.0.0 -> coverage/coverage-summary.json -- MUST be non-zero (gate G2)" },
  { dir: "nyc", label: "nyc + ts-node (coverage cross-check)", wiring: "pinned 18.0.0 -> coverage-nyc/coverage-summary.json -- instruments .ts directly, never via source-map remap" },
  { dir: "eslint", label: "eslint", wiring: "pinned 10.9.1 -> planted findings expected" },
  { dir: "sonarjs", label: "eslint-plugin-sonarjs", wiring: "pinned 4.2.0 -> planted findings expected" },
  { dir: "security", label: "eslint-plugin-security", wiring: "pinned 4.0.1 -> planted findings expected" },
  { dir: "eslint-scope", label: "eslint-scope", wiring: "pinned 9.1.2 -> scope/variable inventory per function" },
  { dir: "jscpd", label: "jscpd", wiring: "pinned 5.0.16 -> planted findings expected" },
  { dir: "ts-morph", label: "ts-morph", wiring: "pinned 27.0.2 -> per-function inventory: name, params, statements, depth" },
  { dir: "ts-prune", label: "ts-prune", wiring: "pinned 0.10.3 -> planted findings expected" },
  { dir: "knip", label: "knip", wiring: "pinned 6.32.2 -> reports/knip.json -- unused files, exports and dependencies" },
  { dir: "madge", label: "madge", wiring: "pinned 8.0.0 -> module graph, circular check, orphan list" },
  { dir: "dependency-cruiser", label: "dependency-cruiser", wiring: "pinned 17.4.3 -> dependency graph + rule violations + fan-in/fan-out" },
  { dir: "stryker", label: "@stryker-mutator/core", wiring: "pinned 9.6.1 -> reports/mutation/mutation.json -- mutation score" },
  { dir: "fast-check", label: "fast-check", wiring: "pinned 4.9.0 -> property-based test results, 200 runs per property" },
  { dir: "cdxgen", label: "@cyclonedx/cdxgen", wiring: "pinned 12.8.4 -> reports/sbom.json -- CycloneDX SBOM" },
  { dir: "ort", label: "OSS Review Toolkit (cdxgen license proxy)", wiring: "not an npm package -> reports/licenses.json -- license inventory derived from the cdxgen SBOM" },
  { dir: "ncu", label: "npm-check-updates", wiring: "pinned 22.2.9 -> reports/outdated.json -- available upgrades" },
  { dir: "npm-audit", label: "npm audit / npm ls", wiring: "not an npm package -> planted findings expected" },
  { dir: "opentelemetry", label: "@opentelemetry/sdk-node", wiring: "pinned 0.221.0 -> reports/otel-spans.json -- spans emitted by an instrumented run" },
  { dir: "grype", label: "Grype", wiring: "not an npm package -> planted findings expected" },
  { dir: "lizard", label: "Lizard", wiring: "not an npm package -> reports/lizard.csv -- CCN and token counts. See the caveat in the README" },
  { dir: "pydriller", label: "git-history (TypeScript port of pydriller)", wiring: "git CLI, no PyDriller -> reports/history.json -- churn, coupling and ownership" },
  { dir: "github-advisories", label: "Dependabot / GitHub Security Advisories API", wiring: "not an npm package -> planted findings expected" },
  { dir: "github-api", label: "GitHub API (repos + releases)", wiring: "not an npm package -> reports/upstream.json -- repo metadata and latest release" },
  { dir: "cccc", label: "cccc", wiring: "not an npm package -> reports/cccc/cccc.xml -- C/C++/Java metrics; no TypeScript front end (see the runner)" },
  { dir: "debtmap", label: "debtmap", wiring: "not an npm package -> reports/debtmap.json -- technical-debt and complexity items" },
  { dir: "oxlint", label: "oxlint", wiring: "pinned 1.87.0 -> reports/oxlint.json -- diagnostics; installed on demand, not a package.json dependency" },
  { dir: "bearer", label: "Bearer CLI", wiring: "not an npm package -> reports/bearer.json -- SAST and data-flow findings" },
  { dir: "cve-lite", label: "CVE Lite CLI", wiring: "pinned 1.38.0 -> reports/cve-lite.json -- known-vulnerable packages from the lockfile (needs api.osv.dev)" },
  { dir: "license-checker", label: "license-checker-rseidelsohn", wiring: "pinned 4.4.2 -> reports/license-checker.json -- licence of every production package" },
  { dir: "osv-scanner", label: "OSV-Scanner", wiring: "not an npm package -> reports/osv.json -- known-vulnerable packages via POST api.osv.dev/v1/querybatch" },
  { dir: "monocart", label: "monocart-coverage-reports", wiring: "pinned 2.13.2 -> reports/monocart/coverage-summary.json -- V8 coverage of the mocha run" },
  { dir: "oxc-coverage", label: "oxc-coverage-instrument", wiring: "pinned 0.13.0 -> reports/oxc-coverage.json -- Istanbul coverage map of every source file (library; no CLI)" },
  { dir: "mewt", label: "mewt", wiring: "not an npm package -> reports/mewt.sqlite -- mutants killed or surviving the mocha suite" },
  { dir: "diff-cover", label: "diff-cover", wiring: "not an npm package -> reports/diff-cover.json -- coverage of the lines changed since the previous commit" },
  { dir: "ts-unused-exports", label: "ts-unused-exports", wiring: "pinned 11.0.1 -> reports/ts-unused-exports.txt -- exports no module imports" },
  { dir: "red-dragon", label: "data-flow (TypeScript replacement for red-dragon)", wiring: "TypeScript compiler API -> reports/dataflow.json -- definitions, uses, def-use pairs, dead stores; flow-insensitive" },
  { dir: "opengrep", label: "Opengrep", wiring: "not an npm package -> reports/opengrep.json -- local-rule findings on the planted fixtures" },
  { dir: "covgate", label: "covgate", wiring: "not an npm package -> reports/covgate.md -- diff-coverage gate on Istanbul JSON" },
  { dir: "reson", label: "reson", wiring: "not an npm package -> reports/reson.json -- AST-level duplicate blocks" },
  { dir: "depscout", label: "DepScout", wiring: "pinned 1.0.0 -> reports/depscout.txt -- maintainability indicators for every dependency (needs the npm registry and GitHub API)" },
  { dir: "tracegraph", label: "TraceGraph (@tracegraph/trace-js)", wiring: "pinned 0.3.1 -> reports/tracegraph/*.events.jsonl.tmp -- traced call path through the order service" },
  { dir: "git-hot", label: "git-hot", wiring: "not an npm package -> reports/git-hot.txt -- live-line churn and age per file" },
  { dir: "npm-downloads", label: "npm downloads API", wiring: "not an npm package -> reports/npm-downloads.json -- weekly downloads of every direct dependency" },
  { dir: "supercov", label: "supercov", wiring: "pinned 4.19.0 -> reports/supercov.json -- line, branch, function and MC/DC condition coverage of the mocha run; installed on demand, needs Node >=22" },
  { dir: "typhonjs-escomplex", label: "typhonjs-escomplex", wiring: "pinned 0.1.0 -> reports/typhonjs-escomplex.json -- Halstead, cyclomatic complexity and maintainability; installed on demand" },
  { dir: "ts-complex", label: "ts-complex", wiring: "pinned 1.0.0 -> reports/ts-complex.json -- per-function Halstead + cyclomatic complexity, per-file maintainability; installed on demand" },
  { dir: "scikit-learn", label: "defect-risk (TypeScript replacement for scikit-learn)", wiring: "TypeScript isolation forest -> reports/defect-probability.json -- per-file defect risk from git history and source shape; unsupervised ranking" },
];

function runnerFor(dir: string): string | null {
  const folder = path.join(TOOLS_DIR, dir);
  if (!fs.existsSync(folder)) return null;
  const found = fs
    .readdirSync(folder)
    .filter((f) => /^run_.*\.(sh|js|py|ts)$/.test(f))
    .sort();
  return found.length > 0 ? path.join(folder, found[0]) : null;
}

function banner(): number {
  console.log(
    `=== Tool integration -- branch TS-105 ` +
      `(Node ${NODE_TARGET} / TypeScript ${TYPESCRIPT_VERSION} / ` +
      `${BUNDLER_NAME} / ${PACKAGE_MANAGER} / ${ARCHITECTURE}) ===`,
  );
  for (const t of TOOL_WIRING) {
    console.log(`[${t.label}] ${t.wiring}`);
  }
  console.log(`=== ${TOOL_WIRING.length} tools wired ===`);
  return 0;
}

function list(): number {
  for (const t of TOOL_WIRING) console.log(`${t.dir}\t${t.label}`);
  return 0;
}

function verify(): number {
  const problems: string[] = [];
  for (const t of TOOL_WIRING) {
    const folder = path.join(TOOLS_DIR, t.dir);
    if (!fs.existsSync(folder)) {
      problems.push(`${t.label}: missing folder Tool Triggering (Synthetic Data)/${t.dir}`);
      continue;
    }
    if (!fs.existsSync(path.join(folder, "trigger.yaml"))) {
      problems.push(`${t.label}: missing Tool Triggering (Synthetic Data)/${t.dir}/trigger.yaml`);
    }
    if (runnerFor(t.dir) === null) {
      problems.push(`${t.label}: no runner script in Tool Triggering (Synthetic Data)/${t.dir}`);
    }
  }
  if (problems.length > 0) {
    console.log("FAILED");
    for (const p of problems) console.log(`  - ${p}`);
    return 1;
  }
  console.log(`OK -- all ${TOOL_WIRING.length} tools have a folder, a manifest and a runner.`);
  return 0;
}

function invoke(runner: string): void {
  const ext = path.extname(runner);
  const rel = path.relative(REPO_ROOT, runner);
  if (ext === ".sh") execFileSync("bash", [rel], { cwd: REPO_ROOT, stdio: "inherit" });
  else if (ext === ".js") execFileSync("node", [rel], { cwd: REPO_ROOT, stdio: "inherit" });
  else if (ext === ".py") execFileSync("python3", [rel], { cwd: REPO_ROOT, stdio: "inherit" });
  else execFileSync("node_modules/.bin/ts-node", [rel], { cwd: REPO_ROOT, stdio: "inherit" });
}

function run(name: string): number {
  const match = TOOL_WIRING.find((t) => t.dir.toLowerCase() === name.toLowerCase());
  if (match === undefined) {
    console.error(`unknown tool: ${name}`);
    console.error("known tools: " + TOOL_WIRING.map((t) => t.dir).join(", "));
    return 2;
  }
  const runner = runnerFor(match.dir);
  if (runner === null) {
    console.error(`${match.label}: no runner script`);
    return 1;
  }
  invoke(runner);
  return 0;
}

function runAll(): number {
  const failed: string[] = [];
  for (const t of TOOL_WIRING) {
    const runner = runnerFor(t.dir);
    if (runner === null) { failed.push(t.dir); continue; }
    console.log(`\n========== ${t.label} ==========`);
    try {
      invoke(runner);
    } catch (error) {
      console.error(`[${t.label}] runner exited non-zero`);
      failed.push(t.dir);
    }
  }
  console.log(`\n=== ${TOOL_WIRING.length - failed.length}/${TOOL_WIRING.length} runners succeeded ===`);
  if (failed.length > 0) {
    console.log("failed: " + failed.join(", "));
    return 1;
  }
  return 0;
}

function main(argv: string[]): number {
  const [flag, value] = argv;
  if (flag === undefined) return banner();
  if (flag === "--list") return list();
  if (flag === "--verify") return verify();
  if (flag === "--run-all") return runAll();
  if (flag === "--run") {
    if (value === undefined) { console.error("--run needs a tool name"); return 2; }
    return run(value);
  }
  console.error(`unknown flag: ${flag}`);
  return 2;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
