#!/usr/bin/env ts-node
/* eslint-scope runner -- branch TS-105.
 * Builds a scope tree over the planted dead-code fixture and reports, per
 * scope, how many variables are declared and how many are never referenced.
 * This is the structural counterpart to ts-prune's export-level view.
 */
import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

// eslint-scope and espree ship no type declarations; these are the parts used here.
interface ScopeVariable {
  readonly name: string;
  readonly references: readonly unknown[];
}
interface Scope {
  readonly type: string;
  readonly block: { readonly type: string; readonly loc?: { readonly start: { readonly line: number } } | null };
  readonly variables: readonly ScopeVariable[];
}
interface ScopeManager {
  readonly scopes: readonly Scope[];
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const escope = require("eslint-scope") as { analyze(ast: unknown, options: object): ScopeManager };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const espree = require("espree") as { parse(code: string, options: object): unknown };

interface ScopeRow {
  readonly type: string;
  readonly block: string;
  readonly line: number | null;
  readonly declared: number;
  readonly unreferenced: number;
  readonly names: string[];
}

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TARGET = path.join(REPO_ROOT, "src", "analysis", "dead-code.ts");

function pkgver(name: string): string {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "node_modules", name, "package.json"), "utf8"),
    ) as { version: string };
    return manifest.version;
  } catch {
    return "unresolved";
  }
}
console.log("[eslint-scope] version:", pkgver("eslint-scope"));

// eslint-scope consumes an ESTree AST, so transpile the TypeScript away first.
const source = fs.readFileSync(TARGET, "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.ESNext },
}).outputText;

const ast = espree.parse(js, { ecmaVersion: 2019, sourceType: "module", range: true, loc: true });
const scopeManager = escope.analyze(ast, { ecmaVersion: 2019, sourceType: "module" });

const rows: ScopeRow[] = [];
for (const scope of scopeManager.scopes) {
  const unused = scope.variables.filter((v) => v.references.length === 0 && v.name !== "arguments");
  rows.push({
    type: scope.type,
    block: scope.block.type,
    line: scope.block.loc ? scope.block.loc.start.line : null,
    declared: scope.variables.length,
    unreferenced: unused.length,
    names: unused.map((v) => v.name),
  });
}

fs.mkdirSync(path.join(REPO_ROOT, "reports"), { recursive: true });
fs.writeFileSync(path.join(REPO_ROOT, "reports", "eslint-scope.json"), JSON.stringify(rows, null, 2));

console.log("[eslint-scope] scopes analysed:", rows.length);
for (const r of rows) {
  if (r.unreferenced > 0) {
    console.log("   ", r.type, "scope @ line", r.line, "->", r.unreferenced, "unreferenced:", r.names.join(", "));
  }
}
const totalUnused = rows.reduce((a, r) => a + r.unreferenced, 0);
console.log("[eslint-scope] total unreferenced bindings:", totalUnused);
if (totalUnused === 0) {
  console.error("[eslint-scope] FAIL: planted dead code produced no unreferenced bindings");
  process.exit(1);
}
