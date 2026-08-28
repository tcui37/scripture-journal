import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { waitForApi } from "./warmup";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("waitForApi", () => {
  it("returns once /api/health is ok", async () => {
    const paths: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      paths.push(String(input));
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }) as typeof fetch;

    await waitForApi();
    assert.deepEqual(paths, ["/api/health"]);
  });

  it("retries after a failed ping then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return new Response("no", { status: 502 });
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }) as typeof fetch;

    await waitForApi();
    assert.equal(calls, 2);
  });
});
