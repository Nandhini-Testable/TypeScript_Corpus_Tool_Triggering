#!/usr/bin/env ts-node
// usage: ts-node osv_query.ts <sbom.json> <output json>
// POST https://api.osv.dev/v1/querybatch with every npm package in a CycloneDX SBOM.
// Plain https (no fetch, no dependencies).
import * as fs from "fs";
import * as https from "https";

interface SbomComponent {
  readonly name?: string;
  readonly version?: string;
  readonly group?: string;
}
interface Sbom {
  readonly components?: SbomComponent[];
}
interface Pkg {
  readonly name: string;
  readonly version: string;
}
interface OsvResult {
  readonly vulns?: { readonly id: string }[];
}
interface OsvBatchResponse {
  readonly results?: OsvResult[];
}
interface Vulnerable extends Pkg {
  readonly ids: string[];
}

const BATCH_SIZE = 500;

function packagesOf(sbom: Sbom): Pkg[] {
  const seen = new Set<string>();
  const pkgs: Pkg[] = [];
  for (const c of sbom.components ?? []) {
    if (!c.name || !c.version) continue;
    const name = c.group ? `${String(c.group).startsWith("@") ? c.group : `@${c.group}`}/${c.name}` : c.name;
    const key = `${name}@${c.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pkgs.push({ name, version: c.version });
  }
  return pkgs;
}

function post(body: object): Promise<OsvBatchResponse> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: "api.osv.dev",
        path: "/v1/querybatch",
        method: "POST",
        timeout: 60000,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      },
      (res) => {
        let buf = "";
        res.on("data", (d: Buffer) => (buf += d));
        res.on("end", () =>
          res.statusCode === 200 ? resolve(JSON.parse(buf) as OsvBatchResponse) : reject(new Error(`HTTP ${res.statusCode}`)),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main(): Promise<void> {
  const [sbomPath, outPath] = process.argv.slice(2);
  if (!sbomPath || !outPath) throw new Error("usage: osv_query.ts <sbom.json> <output json>");
  const pkgs = packagesOf(JSON.parse(fs.readFileSync(sbomPath, "utf8")) as Sbom);

  const vulnerable: Vulnerable[] = [];
  for (let i = 0; i < pkgs.length; i += BATCH_SIZE) {
    const chunk = pkgs.slice(i, i + BATCH_SIZE);
    const res = await post({
      queries: chunk.map((p) => ({ package: { name: p.name, ecosystem: "npm" }, version: p.version })),
    });
    (res.results ?? []).forEach((r, j) => {
      const pkg = chunk[j] as Pkg;
      if (r.vulns && r.vulns.length) vulnerable.push({ name: pkg.name, version: pkg.version, ids: r.vulns.map((v) => v.id) });
    });
  }
  // The report keeps the original field name `package`, which the original script and its consumers use.
  const rows = vulnerable.map((v) => ({ package: v.name, version: v.version, ids: v.ids }));
  fs.writeFileSync(outPath, JSON.stringify({ queried: pkgs.length, vulnerablePackages: rows.length, vulnerable: rows }, null, 2));
  console.log("[osv-scanner] queried", pkgs.length, "packages; vulnerable:", rows.length);
  rows.slice(0, 10).forEach((v) => console.log("   ", `${v.package}@${v.version}`, v.ids.slice(0, 3).join(" ")));
}

main().catch((e: unknown) => {
  console.error(`[osv-scanner] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
