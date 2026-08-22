import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeBibles, uniqueLanguages } from "./bibles";
import type { BibleSummary } from "./types";

const bible = (id: string, language = "eng"): BibleSummary => ({
  id,
  label: `${id} — ${id}`,
  language,
  language_name: language === "cmn" ? "Chinese" : "English",
  limits: null,
});

describe("uniqueLanguages", () => {
  it("drops empties and duplicates, keeping first-seen order", () => {
    assert.deepEqual(uniqueLanguages(["cmn", "", "eng", "cmn"]), ["cmn", "eng"]);
  });

  it("falls back to English when nothing is selected", () => {
    assert.deepEqual(uniqueLanguages([]), ["eng"]);
    assert.deepEqual(uniqueLanguages(["", ""]), ["eng"]);
  });
});

describe("mergeBibles", () => {
  it("concatenates catalogues and keeps the first listing of each id", () => {
    const first = bible("niv");
    const laterNiv = { ...bible("niv"), label: "NIV — duplicate" };
    const cuvs = bible("cuvs", "cmn");
    assert.deepEqual(mergeBibles([[first], [laterNiv, cuvs]]), [first, cuvs]);
  });

  it("skips languages that have not loaded yet", () => {
    assert.deepEqual(mergeBibles([[bible("bbe")], []]), [bible("bbe")]);
  });
});
