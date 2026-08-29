import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_SETTINGS } from "./constants";
import {
  formatFileMetaLine,
  formatPageCountLabel,
  formatPageCountMeta,
  printedPageCount,
} from "./pages";
import type { Settings } from "./types";

const settings = (overrides: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
});

describe("formatPageCountMeta", () => {
  it("uses singular for one page", () => {
    assert.equal(formatPageCountMeta(1), "1 page");
  });

  it("uses plural for multiple pages", () => {
    assert.equal(formatPageCountMeta(2), "2 pages");
    assert.equal(formatPageCountMeta(12), "12 pages");
  });
});

describe("formatPageCountLabel", () => {
  it("includes the paper size", () => {
    assert.equal(formatPageCountLabel(1, "A4"), "1 A4 page");
    assert.equal(formatPageCountLabel(3, "Letter"), "3 Letter pages");
  });
});

describe("printedPageCount", () => {
  const twoSheets = [["a"], ["b"]];

  it("counts paginated sheets", () => {
    assert.equal(printedPageCount(twoSheets, settings()), 2);
  });

  it("doubles verso sheets when writing lines are enabled", () => {
    assert.equal(
      printedPageCount(twoSheets, settings({ layout: "verso", lines: "ruled" }), { facing: false }),
      4,
    );
  });

  it("does not double facing parallel verso sheets", () => {
    assert.equal(
      printedPageCount(twoSheets, settings({ layout: "verso", lines: "ruled" }), { facing: true }),
      2,
    );
  });

  it("returns zero when pagination is unavailable", () => {
    assert.equal(printedPageCount(null, settings()), 0);
  });
});

describe("formatFileMetaLine", () => {
  it("joins passage, page count, and date", () => {
    assert.equal(
      formatFileMetaLine({
        passage: "John 3:16",
        pageCount: 2,
        date: "Aug 28, 2026",
      }),
      "John 3:16 · 2 pages · Aug 28, 2026",
    );
  });

  it("uses singular page wording", () => {
    assert.equal(
      formatFileMetaLine({
        passage: "John 3:16",
        pageCount: 1,
        date: "Aug 28, 2026",
      }),
      "John 3:16 · 1 page · Aug 28, 2026",
    );
  });

  it("omits page count while it is still loading", () => {
    assert.equal(
      formatFileMetaLine({
        passage: "John 3:16",
        pageCount: null,
        date: "Aug 28, 2026",
      }),
      "John 3:16 · Aug 28, 2026",
    );
  });
});
