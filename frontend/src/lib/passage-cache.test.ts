import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  clearPassageCache,
  fetchPassageCached,
  passageCacheKey,
  peekPassageCache,
} from "./passage-cache";
import type { Passage, Reference } from "./types";

const originalFetch = globalThis.fetch;

const reference: Reference = {
  bibleId: "kjv",
  compareId: "",
  bookId: "JHN",
  startChapter: "3",
  startVerse: "16",
  endChapter: "3",
  endVerse: "16",
};

const passage: Passage = {
  reference: "John 3:16",
  copyright: "",
  attribution: "",
  paragraphs: [],
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearPassageCache();
});

describe("passageCacheKey", () => {
  it("combines bible id and range", () => {
    assert.equal(passageCacheKey("kjv", reference), "kjv|JHN|3:16-3:16");
  });
});

describe("fetchPassageCached", () => {
  it("returns a cached passage on the second call", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify(passage), { status: 200 });
    }) as typeof fetch;

    const signal = new AbortController().signal;
    const first = await fetchPassageCached("kjv", reference, signal);
    const second = await fetchPassageCached("kjv", reference, signal);

    assert.deepEqual(first, passage);
    assert.deepEqual(second, passage);
    assert.equal(calls, 1);
    assert.deepEqual(peekPassageCache("kjv", reference), passage);
  });

  it("deduplicates in-flight requests", async () => {
    let calls = 0;
    let resolveFetch!: () => void;
    const fetchGate = new Promise<void>((resolve) => {
      resolveFetch = resolve;
    });

    globalThis.fetch = (async () => {
      calls += 1;
      await fetchGate;
      return new Response(JSON.stringify(passage), { status: 200 });
    }) as typeof fetch;

    const signal = new AbortController().signal;
    const first = fetchPassageCached("kjv", reference, signal);
    const second = fetchPassageCached("kjv", reference, signal);

    assert.equal(calls, 1);
    resolveFetch();
    assert.deepEqual(await first, passage);
    assert.deepEqual(await second, passage);
    assert.equal(calls, 1);
  });
});

describe("clearPassageCache", () => {
  it("drops cached passages so the next fetch runs again", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify(passage), { status: 200 });
    }) as typeof fetch;

    const signal = new AbortController().signal;
    await fetchPassageCached("kjv", reference, signal);
    clearPassageCache();
    await fetchPassageCached("kjv", reference, signal);

    assert.equal(calls, 2);
    assert.deepEqual(peekPassageCache("kjv", reference), passage);
  });
});
