# TypeScript Order Platform -- Monolith (TS_V20_VITE_NPM_MONO)
#fummy
Tool-evaluation repository for **Node 20**, bundled with **vite**,
managed with **npm**, in a **Monolith** layout.

This is branch **TS_V20_VITE_NPM_MONO** of the consolidated `typescript-corpus` repository, which holds all 216 TypeScript branches across every Node version, bundler, package manager and architecture combination in this corpus.

## Project type

- **Language:** TypeScript 5.9.3
- **Runtime:** Node 20 (verified against 20.20.2)
- **Scenario:** 1 - Monolithic
- **Architecture:** Monolith
- **Module layout:** flat
- **Bundler:** Vite 8.2.2 (Rollup linker + its own bundled esbuild transform)
- **Package manager:** npm 11.19.1
- **Source root:** `src`

Each tool is pinned to the release that was resolved for Node 20; `dataset.json`
records the tools that were skipped and why. Every version in this
repository was resolved against the live npm registry and then executed on a
real Node 20.20.2 interpreter. None was written from memory.

## Supported tools

49 tool families are wired. Each has a folder under `Tool Triggering (Synthetic Data)/` containing a
`trigger.yaml` manifest, a runner, and its configuration.

| Family | Pinned | Family | Pinned |
|---|---|---|---|
| TypeScript (tsc) | 5.9.3 | ts-morph | 27.0.2 |
| vite | 8.2.2 | ts-prune | 0.10.3 |
| mocha | 11.8.0 | madge | 8.0.0 |
| c8 (coverage, primary) | 12.0.0 | dependency-cruiser | 17.4.3 |
| nyc + ts-node (cross-check) | 18.0.0 | Stryker | 9.6.1 |
| eslint | 10.9.1 | fast-check | 4.9.0 |
| @typescript-eslint | 8.68.0 | cdxgen | 12.8.4 |
| eslint-plugin-sonarjs | 4.2.0 | ORT (cdxgen licence proxy) | n/a |
| eslint-plugin-security | 4.0.1 | npm-check-updates | 22.2.9 |
| eslint-scope | 9.1.2 | npm audit / ls | 11.19.1 |
| jscpd | 5.0.16 | OpenTelemetry sdk-node | 0.221.0 |
| Grype | v0.110.0 (binary) | Lizard | pip |
| pydriller | pip | GitHub Advisories + API | REST |
| knip | 6.32.2 | vitest + @vitest/coverage-v8 | 4.1.11 |
| @biomejs/biome | 2.5.10 | cccc | 3.2.0 (apt) |
| debtmap | 0.24.1 (cargo) | oxlint | 1.87.0 |
| Bearer CLI | v2.1.1 (binary) | CVE Lite CLI | 1.38.0 |
| license-checker-rseidelsohn | 4.4.2 | OSV-Scanner | OSV API v1 (CLI v2.6.0) |
| monocart-coverage-reports | 2.13.2 | oxc-coverage-instrument | 0.13.0 |
| mewt | 4.0.0 (cargo) | diff-cover | 10.6.0 (pip) |
| ts-unused-exports | 11.0.1 | red-dragon | c287bb2 (git) |
| Opengrep | v1.30.1 (binary) | covgate | 0.2.0 (cargo) |
| reson | v1.4.1 (cargo) | DepScout | 1.0.0 |
| TraceGraph (@tracegraph/trace-js) | 0.3.1 | git-hot | 0.11.1 (pip) |
| npm downloads API | api.npmjs.org |  |  |

### Tools deliberately NOT wired

Skipping these is a finding, not an omission. See [`dataset.json`](dataset.json).

| Tool | Reason |
|---|---|
| (none) | every tool is wired on this branch |

Declaring any of these would have produced a metric that cannot be computed.

## Build

```bash
npm i -g npm@11.19.1
npm ci
npm run build
npm run bundle
```

`npm run build` type-checks with `tsc --noEmit` and emits CommonJS + declarations to
`dist/`; `npm run bundle` then bundles with **Vite 8.2.2 (Rollup linker + its own bundled esbuild transform)** and **executes the bundle**.
Emitting is not proof; running it is.

## Run

```bash
node dist/src/index.js
```

## Test

```bash
npm run test        # mocha over tests/
npm run coverage    # c8 (primary) AND nyc + ts-node (cross-check)
```

Both coverage tools must report non-zero. They deliberately disagree: c8 reads
V8 coverage of the emitted output and remaps it, while nyc instruments the
TypeScript AST directly through `ts-node/register`. Identical numbers would mean
one of them is not an independent second opinion.

`nyc` here never reports through a source-map remap. Doing so silently yields
0% -- the file is remapped to `.ts`, an `--include` written against `dist/**`
stops matching, and the report empties while the process still exits 0.

## Architecture

**Monolith.** One deployable package. `package.json` declares **no**
`workspaces` field, the module tree under `src/` is flat, and there is no
`services/` directory. Those are exactly the properties an auditor reads to
classify a repository, so they are the ones held true here.

```
src/
  index.ts            public surface + sample runner
  models/             domain records and tax table (leaf layer)
  services/           pricing rules, order service, the duplicate pair
  platform/           integrations that use the planted dependency pins
  analysis/           planted fixtures -- never imported by real code
```

`dependency-cruiser` enforces the layering: `models/` may not import
`services/`, and nothing outside `analysis/` may import `analysis/`.


## Planted fixtures

Nothing in `src/analysis/` is production code. Each file exists so exactly one
tool family has something real to find, **using the committed configuration,
with no extra flags**.

| Fixture | Found by |
|---|---|
| `src/services/retail-order-processor.ts` + `wholesale-order-processor.ts` | jscpd -- a duplicate pair, at default thresholds |
| [`src/analysis/complexity-sample.ts`](src/analysis/complexity-sample.ts) | eslint + sonarjs -- cyclomatic 27, cognitive 74 |
| [`src/analysis/sast-fixture.ts`](src/analysis/sast-fixture.ts) | eslint-plugin-security |
| [`src/analysis/taint-fixture.ts`](src/analysis/taint-fixture.ts) | 4 taint flows + 1 sanitised control |
| [`src/analysis/dead-code.ts`](src/analysis/dead-code.ts) | ts-prune, eslint-scope |
| [`src/analysis/call-graph-sample.ts`](src/analysis/call-graph-sample.ts) | madge, dependency-cruiser -- depth 5, fan-out 6 |
| Five pinned dependencies | npm audit, Grype, GitHub Advisories -- see [`Tool Triggering (Synthetic Data)/grype/PLANTED-CVES.md`](<Tool Triggering (Synthetic Data)/grype/PLANTED-CVES.md>) |

The duplicate pair sits in real service code, not in `analysis/`, because
duplication inside a fixtures folder is trivially dismissed.


## Tool entry points

```bash
ts-node "Tool Triggering (Synthetic Data)/tool_integration.ts"             # wiring banner
ts-node "Tool Triggering (Synthetic Data)/tool_integration.ts" --list      # machine-readable list
ts-node "Tool Triggering (Synthetic Data)/tool_integration.ts" --verify    # folder + manifest + runner for every tool
ts-node "Tool Triggering (Synthetic Data)/tool_integration.ts" --run jscpd # one tool
ts-node "Tool Triggering (Synthetic Data)/tool_integration.ts" --run-all   # every tool, in order
ts-node "Tool Triggering (Synthetic Data)/full_check.ts"                   # cross-file consistency audit
```

Every tool can also be run directly: `bash "Tool Triggering (Synthetic Data)/<tool>/run_<tool>.sh"`.

CI runs **every one of these runners** and uploads their output as artifacts.
A CI file that only installs and tests would leave the declared tools unproven.

## Verification

Every claim in this README is checked by `ts-node "Tool Triggering (Synthetic Data)/full_check.ts"`, which
reads its expectations **from the repository** rather than from a hard-coded
list -- including that `.nvmrc`, `package.json` engines, `dataset.json`, the CI
workflow and all 26 `trigger.yaml` manifests agree on the Node version, the
branch, and the architecture.

<!-- dummy PR 2026-11-05 08:07:08 -->
<!-- dummy PR 2026-11-05 09:55:19 -->
<!-- dummy PR 2026-11-05 15:38:17 -->
<!-- dummy PR 2026-11-06 11:27:35 -->
