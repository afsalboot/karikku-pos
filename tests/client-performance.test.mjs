import test from "node:test";
import assert from "node:assert/strict";
import { api, formatCurrency } from "../src/lib/client.js";

test("reference requests share work with independent cancellation and safe mutation invalidation", async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = (url, options) => new Promise(resolve => requests.push({ url, options, resolve: data => resolve({ ok: true, json: async () => ({ data }) }) }));
  try {
    const first = new AbortController(), second = new AbortController();
    const a = api("/settings", { signal: first.signal });
    const b = api("/settings", { signal: second.signal });
    assert.equal(requests.length, 1, "two hook subscribers make one request");
    const aborted = assert.rejects(a, { name: "AbortError" });
    first.abort(); await aborted;
    requests[0].resolve({ value: "original" });
    assert.deepEqual(await b, { value: "original" });
    assert.deepEqual(await api("/settings", { signal: second.signal }), { value: "original" });
    assert.equal(requests.length, 1, "signal-bearing reads also use reference cache");
    const old = api("/categories");
    const mutation = api("/settings", { method: "PATCH", body: {} });
    requests[2].resolve({ saved: true }); await mutation;
    const fresh = api("/categories");
    requests[1].resolve(["stale"]); await old;
    const joined = api("/categories");
    assert.equal(requests.length, 4, "old completion cannot delete a new in-flight request");
    requests[3].resolve(["fresh"]);
    assert.deepEqual(await fresh, ["fresh"]); assert.deepEqual(await joined, ["fresh"]);
    assert.deepEqual(await api("/categories"), ["fresh"]);
    const salesA = api("/sales"), salesB = api("/sales");
    assert.equal(requests.length, 6, "financial reads remain uncached");
    requests[4].resolve([]); requests[5].resolve([]); await Promise.all([salesA,salesB]);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(api("/settings", {signal:controller.signal}), { name:"AbortError" });
    assert.equal(requests.length, 6, "already-cancelled reads never fetch");
    assert.equal(formatCurrency(1320), new Intl.NumberFormat("en-IN", {style:"currency",currency:"INR"}).format(1320));
  } finally { globalThis.fetch = original; }
});
