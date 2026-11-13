/* OpenTelemetry bootstrap -- @opentelemetry/sdk-node 0.221.0 (the 2.x line).
 * Spans are collected by an in-process exporter and written to
 * reports/otel-spans.json on exit, so the metric needs no collector endpoint.
 * Preload it with:  node -r ts-node/register -r "<this file>" -e "..."
 */
import * as fs from "fs";
import * as path from "path";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SimpleSpanProcessor, type ReadableSpan, type SpanExporter } from "@opentelemetry/sdk-trace-base";

interface CollectedSpan {
  readonly name: string;
  readonly kind: number;
  readonly startTimeUnixNano: string;
  readonly endTimeUnixNano: string;
  readonly durationMs: number;
  readonly attributes: object;
  readonly status: number | undefined;
}

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const collected: CollectedSpan[] = [];
type ExportCallback = Parameters<SpanExporter["export"]>[1];
const toNano = (t: readonly [number, number]): string => String(BigInt(t[0]) * 1000000000n + BigInt(t[1]));

class CollectingExporter implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: ExportCallback): void {
    for (const span of spans) {
      const [s, ns] = span.duration;
      collected.push({
        name: span.name,
        kind: span.kind,
        startTimeUnixNano: toNano(span.startTime),
        endTimeUnixNano: toNano(span.endTime),
        durationMs: s * 1000 + ns / 1e6,
        attributes: span.attributes,
        status: span.status && span.status.code,
      });
    }
    resultCallback({ code: 0 });
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

// `spanProcessors` (an array) is the 2.x option. NodeSDK ignores unknown options
// rather than rejecting them, so passing the 1.x `spanProcessor` key to a 2.x SDK
// would start cleanly, register the default no-op processor, export nothing and
// exit 0 -- a valid, empty, wrong measurement. The type-checker now catches that.
const sdk = new NodeSDK({
  spanProcessors: [new SimpleSpanProcessor(new CollectingExporter())],
});

try {
  sdk.start();
} catch (error) {
  console.error("[otel] sdk failed to start:", (error as Error).message);
}

process.on("exit", () => {
  fs.mkdirSync(path.join(REPO_ROOT, "reports"), { recursive: true });
  fs.writeFileSync(path.join(REPO_ROOT, "reports", "otel-spans.json"), JSON.stringify(collected, null, 2));
  // The WhiteBox platform's span collector reads `otel-spans.json` (or
  // coverage/otel-spans.json) from the repository root when it exists, in
  // the shape {spans: [{name, durationMs, startTimeUnixNano, endTimeUnixNano}]}.
  // Its own hook cannot record spans against @opentelemetry/sdk-trace-base 2.x
  // (BasicTracerProvider lost addSpanProcessor/register), so the repo supplies
  // the report from this real instrumented run. Regenerate with run_otel.sh.
  fs.writeFileSync(
    path.join(REPO_ROOT, "otel-spans.json"),
    JSON.stringify(
      {
        spans: collected.map((x) => ({
          name: x.name,
          durationMs: x.durationMs,
          startTimeUnixNano: x.startTimeUnixNano,
          endTimeUnixNano: x.endTimeUnixNano,
        })),
      },
      null,
      2,
    ) + "\n",
  );
});
