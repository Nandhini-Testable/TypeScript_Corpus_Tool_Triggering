# TypeScript Order Platform -- Microservices (TS_V22_ESBUILD_BUN_MICRO)

Tool-evaluation repository for **Node 22**, bundled with **esbuild**,
managed with **bun**, in a **Microservices** layout.

This is branch **TS_V22_ESBUILD_BUN_MICRO** of the consolidated `typescript-corpus` repository, which holds all 216 TypeScript branches across every Node version, bundler, package manager and architecture combination in this corpus.

## Project type

- **Language:** TypeScript 5.9.3
- **Runtime:** Node 22 (verified against 22.23.2)
- **Scenario:** 2 - Microservices
- **Architecture:** Microservices
- **Module layout:** workspace
- **Bundler:** esbuild 0.28.2 (esbuild transform and linker)
- **Package manager:** bun 1.3.13
- **Source root:** `packages/domain/src`

Each tool is pinned to the release that was resolved for Node 22; `dataset.json`
records the tools that were skipped and why. Every version in this
repository was resolved against the live npm registry and then executed on a
real Node 22.23.2 interpreter. None was written from memory.

## Supported tools

49 tool families are wired. Each has a folder under `Tool Triggering (Synthetic Data)/` containing a
`trigger.yaml` manifest, a runner, and its configuration.

| Family | Pinned | Family | Pinned |
|---|---|---|---|
| TypeScript (tsc) | 5.9.3 | ts-morph | 27.0.2 |
| esbuild | 0.28.2 | ts-prune | 0.10.3 |
| mocha | 11.8.0 | madge | 8.0.0 |
| c8 (coverage, primary) | 12.0.0 | dependency-cruiser | 18.2.0 |
| nyc + ts-node (cross-check) | 18.0.0 | Stryker | 10.0.0 |
| eslint | 10.9.1 | fast-check | 4.9.0 |
| @typescript-eslint | 8.68.0 | cdxgen | 12.8.4 |
| eslint-plugin-sonarjs | 4.2.0 | ORT (cdxgen licence proxy) | n/a |
| eslint-plugin-security | 4.0.1 | npm-check-updates | 23.1.0 |
| eslint-scope | 9.1.2 | bun audit / ls | 1.3.13 |
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
# bun is a standalone binary, not an npm package -- see Tool Triggering (Synthetic Data)/npm-audit/run_npm_audit.sh
bun install --frozen-lockfile
bun run build
bun run bundle
```

`bun run build` type-checks with `tsc --noEmit` and emits CommonJS + declarations to
`dist/`; `bun run bundle` then bundles with **esbuild 0.28.2 (esbuild transform and linker)** and **executes the bundle**.
Emitting is not proof; running it is.

## Run

```bash
node dist/packages/domain/src/index.js
```

Each service is independently runnable:

```bash
node dist/services/gateway-service/src/index.js
node dist/services/pricing-service/src/index.js
```

## Test

```bash
bun run test        # mocha over tests/
bun run coverage    # c8 (primary) AND nyc + ts-node (cross-check)
```

Both coverage tools must report non-zero. They deliberately disagree: c8 reads
V8 coverage of the emitted output and remaps it, while nyc instruments the
TypeScript AST directly through `ts-node/register`. Identical numbers would mean
one of them is not an independent second opinion.

`nyc` here never reports through a source-map remap. Doing so silently yields
0% -- the file is remapped to `.ts`, an `--include` written against `dist/**`
stops matching, and the report empties while the process still exits 0.

## Architecture

**Microservices.** Three independently deployable services over a shared domain
package, wired through a workspace root.

```
packages/
  domain/         @orderkit/domain     -- models, services, analysis fixtures
  contracts/      @orderkit/contracts  -- inter-service message types
services/
  gateway-service/    accepts payloads, emits order.submitted
  order-service/      validates and prices, emits order.priced / order.rejected
  pricing-service/    owns tier and volume rates (leaf -- calls no one)
```

Each service has its own `package.json`, its own `src/index.ts` entry point and
its own start script. The workspace root lists them under `workspaces`.

**Documented inter-service call path:**

```
http.request -> gateway-service -> order.submitted
                order-service   -> pricing.quote -> pricing-service
                pricing-service -> pricing.rate  -> order-service
                order-service   -> order.priced | order.rejected
```

This matters because of what the JavaScript corpus got wrong: FlintAtlas's sheet
said `Microservices` while the repository was a flat monolith with no
workspaces, and its own README and `dataset.json` both said "monolith". Nothing
in that repo compared the two. Here `Tool Triggering (Synthetic Data)/full_check.ts` fails the build if the
declared architecture and the actual layout disagree.


## Planted fixtures

Nothing in `packages/domain/src/analysis/` is production code. Each file exists so exactly one
tool family has something real to find, **using the committed configuration,
with no extra flags**.

| Fixture | Found by |
|---|---|
| `packages/domain/src/services/retail-order-processor.ts` + `wholesale-order-processor.ts` | jscpd -- a duplicate pair, at default thresholds |
| [`packages/domain/src/analysis/complexity-sample.ts`](packages/domain/src/analysis/complexity-sample.ts) | eslint + sonarjs -- cyclomatic 27, cognitive 74 |
| [`packages/domain/src/analysis/sast-fixture.ts`](packages/domain/src/analysis/sast-fixture.ts) | eslint-plugin-security |
| [`packages/domain/src/analysis/taint-fixture.ts`](packages/domain/src/analysis/taint-fixture.ts) | 4 taint flows + 1 sanitised control |
| [`packages/domain/src/analysis/dead-code.ts`](packages/domain/src/analysis/dead-code.ts) | ts-prune, eslint-scope |
| [`packages/domain/src/analysis/call-graph-sample.ts`](packages/domain/src/analysis/call-graph-sample.ts) | madge, dependency-cruiser -- depth 5, fan-out 6 |
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

<!-- dummy PR 2026-11-05 11:16:37 -->
