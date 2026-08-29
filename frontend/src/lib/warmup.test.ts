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

    await waitForApi(undefined, { gapsMs: [0, 0] });
    assert.equal(calls, 2);
  });

  it("keeps pinging past three failures until health is ok", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls < 5) return new Response("no", { status: 502 });
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }) as typeof fetch;

    await waitForApi(undefined, { budgetMs: 10_000, gapsMs: [0] });
    assert.equal(calls, 5);
  });

  it("stops after the budget if health never comes", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("no", { status: 502 });
    }) as typeof fetch;

    await assert.rejects(
      () => waitForApi(undefined, { budgetMs: 0, gapsMs: [0] }),
      /HTTP 502/,
    );
    assert.equal(calls, 1);
  });

  it("stops when aborted", async () => {
    const abort = new AbortController();
    globalThis.fetch = (async () => {
      abort.abort();
      throw new DOMException("Aborted", "AbortError");
    }) as typeof fetch;

    await assert.rejects(
      () => waitForApi(abort.signal, { budgetMs: 10_000, gapsMs: [0] }),
      (error: unknown) => error instanceof DOMException && error.name === "AbortError",
    );
  });
});
