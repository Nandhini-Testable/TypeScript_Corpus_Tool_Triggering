#!/usr/bin/env ts-node
/* Data-flow driver -- branch TS-105.
 *
 * usage: dataflow.ts <output json> <file.ts> [<file.ts> ...]
 *
 * TypeScript replacement for dataflow.py. The Python driver only called red-dragon
 * (a third-party tree-sitter -> IR -> CFG -> reaching-definitions library), so there
 * was no logic of its own to port. This script answers the same questions from the
 * TypeScript compiler API instead, and is a DIFFERENT analysis:
 *
 *   - Definitions and uses are resolved by symbol through the type checker.
 *   - It is flow-INSENSITIVE: `defUsePairs` pairs every definition of a variable with
 *     every use of it, an upper bound on red-dragon's flow-sensitive def-use chains.
 *   - There is no IR or basic-block count, because there is no IR.
 *   - `maybeUninitialisedReads` comes from the compiler's own definite-assignment
 *     check (TS2454), which is flow-sensitive.
 *
 * `deadStores` are variables that are assigned and never read. Parameters are never
 * reported, and a variable that is exported is treated as read.
 */
import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

interface FileRow {
  readonly file: string;
  readonly variables: number;
  readonly definitions: number;
  readonly uses: number;
  readonly defUsePairs: number;
  readonly deadStores: string[];
  readonly maybeUninitialisedReads: string[];
  readonly error?: string;
}

interface Tally {
  defs: number;
  uses: number;
  isParameter: boolean;
  exported: boolean;
}

const DEFINITE_ASSIGNMENT_CODE = 2454; // "Variable 'x' is used before being assigned."
const ASSIGNMENT_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

function analyse(program: ts.Program, sf: ts.SourceFile, rel: string): FileRow {
  const checker = program.getTypeChecker();
  const tallies = new Map<ts.Symbol, Tally>();
  const names = new Map<ts.Symbol, string>();

  const tally = (symbol: ts.Symbol): Tally | undefined => {
    const flags = symbol.flags;
    if (!(flags & (ts.SymbolFlags.Variable | ts.SymbolFlags.FunctionScopedVariable | ts.SymbolFlags.BlockScopedVariable))) {
      return undefined;
    }
    const decl = symbol.declarations?.[0];
    if (!decl || decl.getSourceFile() !== sf) return undefined;
    let t = tallies.get(symbol);
    if (!t) {
      t = {
        defs: 0,
        uses: 0,
        isParameter: ts.isParameter(decl),
        exported: (ts.getCombinedModifierFlags(decl as ts.Declaration) & ts.ModifierFlags.Export) !== 0,
      };
      tallies.set(symbol, t);
      names.set(symbol, symbol.getName());
    }
    return t;
  };

  const isAssignTarget = (id: ts.Identifier): "plain" | "compound" | undefined => {
    const parent = id.parent;
    if (ts.isBinaryExpression(parent) && parent.left === id && ASSIGNMENT_OPERATORS.has(parent.operatorToken.kind)) {
      return parent.operatorToken.kind === ts.SyntaxKind.EqualsToken ? "plain" : "compound";
    }
    if ((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
        (parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken)) {
      return "compound";
    }
    return undefined;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const symbol = checker.getSymbolAtLocation(node.name);
      const t = symbol && tally(symbol);
      // `let x;` is a declaration without a definition; for-of / for-in bind a value each iteration.
      const bindsValue = node.initializer !== undefined ||
        ts.isForOfStatement(node.parent.parent) || ts.isForInStatement(node.parent.parent);
      if (t && bindsValue) t.defs += 1;
    } else if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
      const symbol = checker.getSymbolAtLocation(node.name);
      const t = symbol && tally(symbol);
      if (t) t.defs += 1;
    } else if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const isDeclarationName = (ts.isVariableDeclaration(parent) || ts.isParameter(parent)) && parent.name === node;
      if (!isDeclarationName) {
        const symbol = checker.getSymbolAtLocation(node);
        const t = symbol && tally(symbol);
        if (t) {
          const assign = isAssignTarget(node);
          if (assign) t.defs += 1;
          if (assign !== "plain") t.uses += 1; // a compound assignment or ++ also reads the variable
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const deadStores: string[] = [];
  let definitions = 0;
  let uses = 0;
  let defUsePairs = 0;
  for (const [symbol, t] of tallies) {
    definitions += t.defs;
    uses += t.uses;
    defUsePairs += t.defs * t.uses;
    if (!t.isParameter && !t.exported && t.defs > 0 && t.uses === 0) deadStores.push(names.get(symbol) as string);
  }

  const maybeUninitialisedReads = [
    ...new Set(
      program
        .getSemanticDiagnostics(sf)
        .filter((d) => d.code === DEFINITE_ASSIGNMENT_CODE)
        .map((d) => /'([^']+)'/.exec(ts.flattenDiagnosticMessageText(d.messageText, "\n"))?.[1] ?? "?"),
    ),
  ].sort();

  return {
    file: rel,
    variables: tallies.size,
    definitions,
    uses,
    defUsePairs,
    deadStores: deadStores.sort(),
    maybeUninitialisedReads,
  };
}

function main(): number {
  const [out, ...files] = process.argv.slice(2);
  if (!out || files.length === 0) {
    console.error("usage: dataflow.ts <output json> <file.ts> [<file.ts> ...]");
    return 2;
  }
  const root = path.resolve(__dirname, "..", "..");
  const program = ts.createProgram(
    files.map((f) => path.resolve(root, f)),
    // strict turns on the definite-assignment check the maybe-uninitialised report is read from.
    { strict: true, noEmit: true, target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS, skipLibCheck: true, types: ["node"], typeRoots: [path.join(root, "node_modules", "@types")] },
  );

  const rows: FileRow[] = [];
  for (const file of files) {
    const abs = path.resolve(root, file);
    const sf = program.getSourceFile(abs);
    if (!sf) {
      rows.push({ file, variables: 0, definitions: 0, uses: 0, defUsePairs: 0, deadStores: [], maybeUninitialisedReads: [], error: "source file not found" });
      console.log(`[dataflow] ${file}: not analysed -- source file not found`);
      continue;
    }
    const row = analyse(program, sf, file);
    rows.push(row);
    console.log(
      `[dataflow] ${file}: ${row.variables} vars, ${row.definitions} defs, ${row.uses} uses, ${row.defUsePairs} def-use pairs | ` +
        `dead stores: ${row.deadStores.join(", ") || "none"} | maybe-uninitialised reads: ${row.maybeUninitialisedReads.join(", ") || "none"}`,
    );
  }

  fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
  fs.writeFileSync(
    path.resolve(root, out),
    JSON.stringify({ tool: "typescript-compiler-dataflow", flowSensitive: false, files: rows }, null, 2),
  );
  return rows.some((r) => r.error) ? 1 : 0;
}

process.exit(main());
