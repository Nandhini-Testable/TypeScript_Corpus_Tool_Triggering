#!/usr/bin/env ts-node
// usage: ts-node trace_driver.ts <tool install dir> <source root> <run dir>
// Emits TraceGraph events (function_call / return / error, parent-linked) for a real call path through the
// order service: OrderService.price -> validateOrder -> effectiveRate -> applyTax. One order is invalid on purpose.
// Run it under ts-node (TS_NODE_PROJECT=tsconfig.json): that is also what loads the order-service sources.
import * as fs from "fs";
import * as path from "path";

type Fn = (...args: never[]) => unknown;
// @tracegraph/* is installed on demand into reports/.tool-cache and ships no declarations here.
interface TraceCore {
  createTraceId(): string;
  createRunId(): string;
  createSessionId(): string;
}
interface TraceJs {
  traceFunction<T extends Fn>(name: string, fn: T): T;
}
interface OrderServiceLike {
  prototype: { price: Fn; priceAll: Fn };
  new (): { priceAll(orders: unknown[]): { priced: unknown[]; failures: unknown[] } };
}
interface TraceEvent {
  readonly type: string;
}

const [installDir, srcRoot, runDir] = process.argv.slice(2);
if (!installDir || !srcRoot || !runDir) {
  console.error("usage: trace_driver.ts <tool install dir> <source root> <run dir>");
  process.exit(2);
}
const nm = path.resolve(installDir, "node_modules");
/* eslint-disable @typescript-eslint/no-require-imports */
const core = require(path.join(nm, "@tracegraph/trace-core")) as TraceCore;
const js = require(path.join(nm, "@tracegraph/trace-js")) as TraceJs;

const traceId = core.createTraceId();
process.env.TRACEGRAPH_ENABLED = "1";
process.env.TRACEGRAPH_RUN_DIR = path.resolve(runDir);
process.env.TRACEGRAPH_TRACE_ID = traceId;
process.env.TRACEGRAPH_RUN_ID = core.createRunId();
process.env.TRACEGRAPH_SESSION_ID = core.createSessionId();

const svc = require(path.resolve(srcRoot, "services/order-service")) as { OrderService: OrderServiceLike };
const rules = require(path.resolve(srcRoot, "services/pricing-rules")) as { effectiveRate: Fn };
const models = require(path.resolve(srcRoot, "models/order-record")) as { validateOrder: Fn };
const tax = require(path.resolve(srcRoot, "models/tax-table")) as { applyTax: Fn };
/* eslint-enable @typescript-eslint/no-require-imports */

// wrap what the call path crosses (module exports and the class methods)
rules.effectiveRate = js.traceFunction("pricing-rules.effectiveRate", rules.effectiveRate);
tax.applyTax = js.traceFunction("tax-table.applyTax", tax.applyTax);
models.validateOrder = js.traceFunction("order-record.validateOrder", models.validateOrder);
svc.OrderService.prototype.price = js.traceFunction("OrderService.price", svc.OrderService.prototype.price);
svc.OrderService.prototype.priceAll = js.traceFunction("OrderService.priceAll", svc.OrderService.prototype.priceAll);

const order = (id: string, overrides: object = {}): object => ({
  id,
  channel: "retail",
  tier: "standard",
  lines: [{ sku: "SKU-A", quantity: 2, unitPrice: 50 }],
  placedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});
const result = new svc.OrderService().priceAll([
  order("ORD-1"),
  order("ORD-2", { tier: "gold", channel: "wholesale" }),
  order("ORD-3", { lines: [] }), // invalid: the error path is traced too
]);
console.log("[tracegraph] priced:", result.priced.length, "| rejected:", result.failures.length);

const file = path.join(path.resolve(runDir), `${traceId}.events.jsonl.tmp`);
const events: TraceEvent[] = fs.existsSync(file)
  ? fs
      .readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as TraceEvent)
  : [];
const by: Record<string, number> = {};
events.forEach((e) => {
  by[e.type] = (by[e.type] ?? 0) + 1;
});
console.log("[tracegraph] events:", events.length, JSON.stringify(by));
if (events.length === 0) {
  console.error("[tracegraph] FAIL: no events were written");
  process.exit(1);
}
