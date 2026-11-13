"use strict";
/* OpenTelemetry bootstrap -- @opentelemetry/sdk-node 0.29.2, the newest release
 * whose engines admit Node 12 (>=8.12.0). Spans are collected by an in-process
 * exporter and written to reports/otel-spans.json on exit, so the metric needs
 * no collector endpoint. */
const fs = require("fs");
const path = require("path");
const { NodeSDK } = require("@opentelemetry/sdk-node");
const { SimpleSpanProcessor } = require("@opentelemetry/sdk-trace-base");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const collected = [];

class CollectingExporter {
  export(spans, resultCallback) {
    for (const span of spans) {
      const [s, ns] = span.duration;
      const toNano = (t) => String(BigInt(t[0]) * 1000000000n + BigInt(t[1]));
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
  shutdown() { return Promise.resolve(); }
}

const sdk = new NodeSDK({
  // BOTH keys, deliberately.
  //
  // The OTEL JS 1.x line (sdk-node <= 0.5x, what the Node 12/14 repos install)
  // takes a single `spanProcessor`. The 2.x line (sdk-node >= 0.200, installed
  // here) renamed it to `spanProcessors`, an ARRAY -- and NodeSDK ignores
  // unknown options rather than rejecting them. Pass only the 1.x key to a 2.x
  // SDK and it starts cleanly, registers the default (no-op) processor, exports
  // nothing, and exits 0. reports/otel-spans.json is then a valid, empty,
  // completely wrong measurement. That is the corpus's whole subject, so the
  // corpus itself must not ship it.
  spanProcessors: [new SimpleSpanProcessor(new CollectingExporter())],
  spanProcessor: new SimpleSpanProcessor(new CollectingExporter()),
});

try {
  sdk.start();
} catch (error) {
  console.error("[otel] sdk failed to start:", error.message);
}

process.on("exit", () => {
  fs.mkdirSync(path.join(REPO_ROOT, "reports"), { recursive: true });
  fs.writeFileSync(
    path.join(REPO_ROOT, "reports", "otel-spans.json"),
    JSON.stringify(collected, null, 2),
  );
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
