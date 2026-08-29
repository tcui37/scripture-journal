import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { clearPassageCache } from "./passage-cache";
import { computeFilePageCounts, mapWithConcurrency } from "./file-page-counts";
import type { Measurer } from "./paginate";
import type { JournalFile, Passage } from "./types";

const originalFetch = globalThis.fetch;

const passage: Passage = {
  reference: "John 3:16",
  copyright: "",
  attribution: "",
  paragraphs: [],
};

const file = (id: string): JournalFile => ({
  id,
  name: `File ${id}`,
  book_id: "JHN",
  start_chapter: "3",
  start_verse: "16",
  end_chapter: "3",
  end_verse: "16",
  design: {
    layout: "right",
    lines: "none",
    font: "serif",
    size: 12,
    lead: 1.5,
    numbers: "sup",
    flow: "para",
    poetryIndent: "regular",
    paper: "Ivory",
    pageSize: "A4",
    orientation: "portrait",
    textShare: 0.5,
    titleLine: false,
    pageNumbers: false,
    parallelMode: "stacked",
    parallelSwap: false,
    headings: true,
    redLetter: true,
    poetry: true,
    italics: true,
  },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const measurer = {
  measure: () => 100,
  destroy: () => {},
} as Measurer;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearPassageCache();
});

describe("mapWithConcurrency", () => {
  it("preserves result order", async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (value) => value * 2);
    assert.deepEqual(results, [2, 4, 6]);
  });

  it("limits concurrent workers", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency([0, 1, 2, 3, 4], 2, async (value) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, value % 2 ? 20 : 10));
      inFlight -= 1;
      return value;
    });

    assert.equal(peak, 2);
  });

  it("returns an empty array for no items", async () => {
    assert.deepEqual(await mapWithConcurrency([], 3, async () => 1), []);
  });
});

describe("computeFilePageCounts", () => {
  it("returns empty when there are no files or bible id", async () => {
    const signal = new AbortController().signal;
    assert.deepEqual(await computeFilePageCounts([], "kjv", "", measurer, signal), {});
    assert.deepEqual(await computeFilePageCounts([file("a")], "", "", measurer, signal), {});
  });

  it("counts pages for each file using cached passages", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify(passage), { status: 200 });
    }) as typeof fetch;

    const signal = new AbortController().signal;
    const counts = await computeFilePageCounts(
      [file("a"), file("b")],
      "kjv",
      "",
      measurer,
      signal,
      2,
    );

    assert.equal(Object.keys(counts).length, 2);
    assert.equal(typeof counts.a, "number");
    assert.equal(typeof counts.b, "number");
    assert.equal(calls, 1);
  });

  it("skips files that fail to fetch", async () => {
    const bad = { ...file("bad"), book_id: "MAT" };
    const good = file("good");

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/books/MAT/")) {
        return new Response("no", { status: 500 });
      }
      return new Response(JSON.stringify(passage), { status: 200 });
    }) as typeof fetch;

    const signal = new AbortController().signal;
    const counts = await computeFilePageCounts([bad, good], "kjv", "", measurer, signal);

    assert.deepEqual(Object.keys(counts), ["good"]);
  });
});
