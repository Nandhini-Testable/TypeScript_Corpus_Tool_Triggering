import { expect } from "chai";

/**
 * Runtime lock. Every branch here targets Node 20, so this suite asserts
 * the interpreter and the language level the branch is actually built for.
 * In this corpus the Node version is held constant and the packaging varies,
 * so this is the analogue of the Python family's version-feature test.
 */
describe("runtime environment", () => {
  it("runs on Node 20", () => {
    const major = Number(process.versions.node.split(".")[0]);
    expect(major, `expected Node 20, got ${process.version}`).to.equal(20);
  });

  it("supports the ES2023 features this branch compiles to", () => {
    // Optional chaining and nullish coalescing: V8 8.0 / Node 14.
    const box: { inner?: { value?: number } } = { inner: {} };
    expect(box.inner?.value ?? 41).to.equal(41);
    expect(typeof globalThis).to.equal("object");

    // ES2021, i.e. Node 15+: these are what lock this branch above Node 14.
    expect("a-b-c".replaceAll("-", "+")).to.equal("a+b+c");
    let counter: number | null = null;
    counter ??= 7;
    expect(counter).to.equal(7);
    expect(1_000_000).to.equal(1000000);

    // ES2022, i.e. Node 16.6+/18: Object.hasOwn, Array.prototype.at,
    // Error cause. These are what lock this branch above Node 14.
    expect(Object.hasOwn({ a: 1 }, "a")).to.equal(true);
    expect([10, 20, 30].at(-1)).to.equal(30);
    const wrapped = new Error("outer", { cause: new Error("inner") });
    expect((wrapped.cause as Error).message).to.equal("inner");

    // ES2023, i.e. Node 20: findLast, toSorted, toReversed, with.
    expect([1, 2, 3, 4].findLast((n) => n % 2 === 1)).to.equal(3);
    expect([3, 1, 2].toSorted()).to.deep.equal([1, 2, 3]);
    expect([1, 2, 3].toReversed()).to.deep.equal([3, 2, 1]);
    expect([1, 2, 3].with(1, 9)).to.deep.equal([1, 9, 3]);
  });

  it("supports Promise.any, added in ES2021", async () => {
    const first = await Promise.any([Promise.reject(new Error("slow")), Promise.resolve("fast")]);
    expect(first).to.equal("fast");
  });

  it("supports Promise.allSettled", async () => {
    const results = await Promise.allSettled([
      Promise.resolve("ok"),
      Promise.reject(new Error("nope")),
    ]);
    expect(results.map((r) => r.status)).to.deep.equal(["fulfilled", "rejected"]);
  });

  it("runs on a V8 new enough for the target", () => {
    expect(Number(process.versions.v8.split(".")[0])).to.be.at.least(11);
  });
});
