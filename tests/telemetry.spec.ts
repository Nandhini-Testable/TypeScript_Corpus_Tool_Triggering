import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { expect } from "chai";
import { run } from "../src/index";
import { withSpan } from "../src/platform/telemetry";

describe("telemetry", () => {
  const exporter = new InMemorySpanExporter();

  beforeEach(() => {
    // Replace any provider a harness registered so these tests read their own spans.
    trace.disable();
    exporter.reset();
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }),
    );
  });

  afterEach(() => {
    trace.disable();
  });

  it("records a span with its attributes around the work", () => {
    const result = withSpan("unit.work", { "unit.size": 3 }, () => 42);
    expect(result).to.equal(42);
    const [span] = exporter.getFinishedSpans();
    expect(span?.name).to.equal("unit.work");
    expect(span?.attributes["unit.size"]).to.equal(3);
  });

  it("marks the span as an error and rethrows when the work throws", () => {
    expect(() =>
      withSpan("unit.fail", {}, () => {
        throw new Error("boom");
      }),
    ).to.throw("boom");
    const [span] = exporter.getFinishedSpans();
    expect(span?.status.code).to.equal(2); // SpanStatusCode.ERROR
    expect(span?.events.some((e) => e.name === "exception")).to.equal(true);
  });

  it("run() emits one span per stage", () => {
    const summary = run();
    expect(summary.priced.length).to.be.greaterThan(0);
    const names = exporter.getFinishedSpans().map((s) => s.name);
    expect(names).to.include.members([
      "retail.process",
      "wholesale.process",
      "orders.price",
      "order-book.run",
    ]);
  });
});
