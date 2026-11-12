import { OrderService } from "./services/order-service";
import { RetailOrderProcessor } from "./services/retail-order-processor";
import { WholesaleOrderProcessor } from "./services/wholesale-order-processor";
import { snapshot } from "./platform/integrations";
import type { OrderRecord, PricedOrder } from "./models/order-record";

export { OrderService } from "./services/order-service";
export { RetailOrderProcessor } from "./services/retail-order-processor";
export { WholesaleOrderProcessor } from "./services/wholesale-order-processor";
export { discountRate, volumeBonus, effectiveRate } from "./services/pricing-rules";
export { taxRateFor, applyTax, round2 } from "./models/tax-table";
export { parseOptions, snapshot, describeExportStack } from "./platform/integrations";
export * from "./models/order-record";

/** Deterministic sample book -- the same input every run, so tool output is comparable. */
export function sampleOrders(): OrderRecord[] {
  return [
    {
      id: "ORD-1001",
      channel: "retail",
      tier: "gold",
      lines: [{ sku: "SKU-A", quantity: 4, unitPrice: 25 }],
      placedAt: "2026-01-05T09:00:00.000Z",
    },
    {
      id: "ORD-1002",
      channel: "retail",
      tier: "standard",
      lines: [{ sku: "SKU-B", quantity: 30, unitPrice: 12.5 }],
      placedAt: "2026-01-05T10:15:00.000Z",
    },
    {
      id: "ORD-1003",
      channel: "wholesale",
      tier: "silver",
      lines: [
        { sku: "SKU-C", quantity: 150, unitPrice: 8 },
        { sku: "SKU-D", quantity: 40, unitPrice: 19.99 },
      ],
      placedAt: "2026-01-06T08:30:00.000Z",
    },
    {
      id: "ORD-1004",
      channel: "partner",
      tier: "bronze",
      lines: [{ sku: "SKU-E", quantity: 12, unitPrice: 44.5 }],
      placedAt: "2026-01-06T14:45:00.000Z",
    },
  ];
}

export interface RunSummary {
  readonly runtime: string;
  readonly priced: PricedOrder[];
  readonly retail: { count: number; gross: number; net: number; rejected: number };
  readonly wholesale: { count: number; gross: number; net: number; rejected: number };
}

export function run(): RunSummary {
  // Defensive copy via lodash -- this is what makes the planted dependency
  // pins genuinely reachable rather than merely declared. knip reports
  // declared-but-unreachable dependencies, so an unused pin would contradict
  // tools/grype/PLANTED-CVES.md.
  const orders = snapshot(sampleOrders());
  const service = new OrderService();
  const retail = new RetailOrderProcessor(service);
  const wholesale = new WholesaleOrderProcessor(service);

  retail.process(orders);
  wholesale.process(orders);

  return {
    runtime: process.version,
    priced: service.priceAll(orders).priced,
    retail: retail.summarise(),
    wholesale: wholesale.summarise(),
  };
}

/* istanbul ignore next -- entry point guard, exercised by the CLI smoke test */
if (require.main === module) {
  const summary = run();
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}
