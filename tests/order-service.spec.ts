import { expect } from "chai";
import { OrderService } from "../src/services/order-service";
import { OrderValidationError, type OrderRecord } from "../src/models/order-record";

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "ORD-1",
    channel: "retail",
    tier: "standard",
    lines: [{ sku: "SKU-A", quantity: 2, unitPrice: 50 }],
    placedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("OrderService", () => {
  it("prices a simple retail order with tax", () => {
    const priced = new OrderService().price(order());
    expect(priced.subtotal).to.equal(100);
    expect(priced.discount).to.equal(0);
    expect(priced.tax).to.equal(8.25);
    expect(priced.total).to.equal(108.25);
  });

  it("applies the gold tier discount", () => {
    const priced = new OrderService().price(order({ tier: "gold" }));
    expect(priced.discount).to.equal(15);
    expect(priced.total).to.equal(92.01);
  });

  it("adds a volume bonus above 25 units", () => {
    const priced = new OrderService().price(
      order({ tier: "standard", lines: [{ sku: "SKU-B", quantity: 30, unitPrice: 10 }] }),
    );
    expect(priced.subtotal).to.equal(300);
    expect(priced.discount).to.equal(3);
  });

  it("charges no tax on the partner channel", () => {
    const priced = new OrderService().price(order({ channel: "partner" }));
    expect(priced.tax).to.equal(0);
    expect(priced.total).to.equal(100);
  });

  it("rejects a non-positive quantity", () => {
    const bad = order({ lines: [{ sku: "SKU-X", quantity: 0, unitPrice: 10 }] });
    expect(() => new OrderService().price(bad)).to.throw(
      OrderValidationError,
      /quantity must be positive/,
    );
  });

  it("rejects an order with no lines", () => {
    expect(() => new OrderService().price(order({ lines: [] }))).to.throw(
      OrderValidationError,
      /at least one line/,
    );
  });

  it("collects failures instead of throwing in priceAll", () => {
    const result = new OrderService().priceAll([
      order({ id: "GOOD-1" }),
      order({ id: "BAD-1", lines: [{ sku: "SKU-Y", quantity: -1, unitPrice: 5 }] }),
    ]);
    expect(result.priced).to.have.length(1);
    expect(result.failures).to.have.length(1);
    expect(result.failures[0].field).to.equal("quantity");
  });

  it("counts processed orders", () => {
    const service = new OrderService();
    service.price(order({ id: "A" }));
    service.price(order({ id: "B" }));
    expect(service.processedCount).to.equal(2);
  });
});
