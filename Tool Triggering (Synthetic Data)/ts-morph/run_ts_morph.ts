#!/usr/bin/env ts-node
/* ts-morph runner -- branch TS-105.
 * Type-aware inventory: one row per function with parameter count, statement
 * count and maximum block depth. This is the primary structural source; Lizard
 * is the tokeniser cross-check, and the two are expected to disagree on
 * generic-heavy code (Lizard under-counts).
 */
import * as fs from "fs";
import * as path from "path";
import { Node, Project, SyntaxKind, ts } from "ts-morph";

interface CallableRow {
  readonly file: string;
  readonly name: string;
  readonly line: number;
  readonly params: number;
  readonly statements: number;
  readonly depth: number;
  readonly isGeneric: boolean;
}

const REPO_ROOT = path.resolve(__dirname, "..", "..");

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

console.log("[ts-morph] version:", pkgver("ts-morph"), "| bundled TypeScript:", ts.version);

const project = new Project({ tsConfigFilePath: path.join(REPO_ROOT, "tsconfig.json") });

function maxDepth(node: Node, depth: number): number {
  let best = depth;
  node.forEachChild((child) => {
    const isBlock = child.getKind() === SyntaxKind.Block;
    const d = maxDepth(child, depth + (isBlock ? 1 : 0));
    if (d > best) best = d;
  });
  return best;
}

const rows: CallableRow[] = [];
for (const sf of project.getSourceFiles()) {
  const rel = path.relative(REPO_ROOT, sf.getFilePath());
  if (rel.startsWith("node_modules") || rel.startsWith("dist")) continue;

  const callables = [
    ...sf.getFunctions(),
    ...sf.getClasses().flatMap((c) => [...c.getMethods(), ...c.getGetAccessors()]),
  ];
  for (const fn of callables) {
    const body = fn.getBody();
    rows.push({
      file: rel,
      name: fn.getName() || "(anonymous)",
      line: fn.getStartLineNumber(),
      params: fn.getParameters().length,
      statements: body && Node.isBlock(body) ? body.getStatements().length : 0,
      depth: maxDepth(fn, 0),
      isGeneric: fn.getTypeParameters().length > 0,
    });
  }
}

fs.mkdirSync(path.join(REPO_ROOT, "reports"), { recursive: true });
fs.writeFileSync(path.join(REPO_ROOT, "reports", "ts-morph.json"), JSON.stringify(rows, null, 2));

console.log("[ts-morph] callables inventoried:", rows.length);
const deepest = rows.slice().sort((a, b) => b.depth - a.depth)[0];
const widest = rows.slice().sort((a, b) => b.params - a.params)[0];
if (deepest) console.log("[ts-morph] deepest:", deepest.name, "depth", deepest.depth, "in", deepest.file);
if (widest) console.log("[ts-morph] most parameters:", widest.name, widest.params, "in", widest.file);
console.log("[ts-morph] generic callables:", rows.filter((r) => r.isGeneric).length);
if (rows.length === 0) {
  console.error("[ts-morph] FAIL: no callables found");
  process.exit(1);
}
