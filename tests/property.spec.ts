import { expect } from "chai";
import fc from "fast-check";
import { OrderService } from "../src/services/order-service";
import { effectiveRate } from "../src/services/pricing-rules";
import type { OrderRecord, Tier } from "../src/models/order-record";

const TIERS: Tier[] = ["gold", "silver", "bronze", "standard"];

describe("pricing properties (fast-check)", () => {
  it("effectiveRate never exceeds the 20 percent cap", () => {
    fc.assert(
      fc.property(fc.constantFrom(...TIERS), fc.integer({ min: 0, max: 100000 }), (tier, units) => {
        const rate = effectiveRate(tier, units);
        return rate >= 0 && rate <= 0.2;
      }),
      { numRuns: 200 },
    );
  });

  it("total is never negative and never below the discounted subtotal", () => {
    const line = fc.record({
      sku: fc.constantFrom("A", "B", "C"),
      quantity: fc.integer({ min: 1, max: 500 }),
      unitPrice: fc.integer({ min: 0, max: 10000 }).map((n) => n / 100),
    });
    fc.assert(
      fc.property(
        fc.array(line, { minLength: 1, maxLength: 6 }),
        fc.constantFrom(...TIERS),
        (lines, tier) => {
          const order: OrderRecord = {
            id: "PROP",
            channel: "retail",
            tier,
            lines,
            placedAt: "2026-01-01T00:00:00.000Z",
          };
          const priced = new OrderService().price(order);
          return priced.total >= 0 && priced.discount <= priced.subtotal;
        },
      ),
      { numRuns: 200 },
    );
  });
});
