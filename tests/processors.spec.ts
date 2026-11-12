import { expect } from "chai";
import { OrderService } from "../src/services/order-service";
import { RetailOrderProcessor } from "../src/services/retail-order-processor";
import { WholesaleOrderProcessor } from "../src/services/wholesale-order-processor";
import type { OrderRecord } from "../src/models/order-record";

const BOOK: OrderRecord[] = [
  {
    id: "R-1",
    channel: "retail",
    tier: "gold",
    lines: [{ sku: "A", quantity: 2, unitPrice: 30 }],
    placedAt: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "W-1",
    channel: "wholesale",
    tier: "silver",
    lines: [{ sku: "B", quantity: 120, unitPrice: 9 }],
    placedAt: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "P-1",
    channel: "partner",
    tier: "bronze",
    lines: [{ sku: "C", quantity: 5, unitPrice: 20 }],
    placedAt: "2026-02-01T00:00:00.000Z",
  },
];

describe("channel processors (the duplication fixture pair)", () => {
  it("retail processor takes only retail orders", () => {
    const p = new RetailOrderProcessor(new OrderService());
    expect(p.process(BOOK)).to.have.length(1);
    expect(p.summarise().count).to.equal(1);
  });

  it("wholesale processor takes only wholesale orders", () => {
    const p = new WholesaleOrderProcessor(new OrderService());
    expect(p.process(BOOK)).to.have.length(1);
    expect(p.summarise().count).to.equal(1);
  });

  it("both summarise to the same shape -- they are structural twins", () => {
    const r = new RetailOrderProcessor(new OrderService());
    const w = new WholesaleOrderProcessor(new OrderService());
    r.process(BOOK);
    w.process(BOOK);
    expect(Object.keys(r.summarise()).sort()).to.deep.equal(Object.keys(w.summarise()).sort());
  });

  it("reset clears accumulated state", () => {
    const p = new RetailOrderProcessor(new OrderService());
    p.process(BOOK);
    p.reset();
    expect(p.summarise().count).to.equal(0);
    expect(p.summarise().gross).to.equal(0);
  });
});
