/**
 * Telemetry.
 *
 * Spans are created through `@opentelemetry/api` only. With no tracer provider
 * registered (the normal case: the test suite, the bundle) every call is a
 * no-op, so this adds no behaviour of its own. Under an SDK -- see
 * "Tool Triggering (Synthetic Data)/opentelemetry/otel-bootstrap.js" -- each
 * span is recorded, which is what the OpenTelemetry-spans metric measures.
 * Before this module existed nothing in `src/` ever started a span, so an
 * instrumented run exported zero spans and the metric could not be scored.
 */
import { SpanStatusCode, trace, type Attributes } from "@opentelemetry/api";

const TRACER_NAME = "typescript-n20-ts-105";

/** Run `work` inside an active span; an exception is recorded on the span and rethrown. */
export function withSpan<T>(name: string, attributes: Attributes, work: () => T): T {
  return trace.getTracer(TRACER_NAME).startActiveSpan(name, { attributes }, (span) => {
    try {
      return work();
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
