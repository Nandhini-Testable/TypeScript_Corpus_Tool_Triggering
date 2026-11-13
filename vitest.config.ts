import { defineConfig } from "vitest/config";

/**
 * vitest 4.1.11 (Node ^20.19 || ^22.12 || >=24, matching this branch's engines).
 *
 * It runs the SAME spec files as mocha rather than replacing it. Two
 * independent runners over one suite keep the test suite identical across
 * every Node version in the corpus, and give coverage a third independent
 * number next to c8 and nyc.
 *
 * Coverage uses the ISTANBUL provider (@vitest/coverage-istanbul): it
 * instruments the AST, so statement, branch and function maps are exact and
 * `coverage-final.json` is a real Istanbul map -- the artifact the path,
 * all-defs/uses and coverage-delta tools read. @vitest/coverage-v8 stays
 * installed as an independent cross-check: run `--coverage.provider=v8`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "json-summary", "json", "cobertura"],
      reportsDirectory: "coverage-vitest",
      include: ["src/**/*.ts"],
      exclude: ["src/analysis/**", "tests/**", "Tool Triggering (Synthetic Data)/**"],
    },
  },
});
