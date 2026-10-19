import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { abbreviation, licenceText, referenceLabel } from "./licence";
import type { BibleSummary, Passage, Reference } from "./types";

const bible = (id: string, label: string): BibleSummary => ({
  id,
  label,
  language: "eng",
  language_name: "English",
  limits: null,
});

const bibles = [bible("esv", "ESV — English Standard Version"), bible("cuvs", "CUV — 和合本")];

const passage = (copyright: string, attribution: string): Passage => ({
  reference: "",
  copyright,
  attribution,
  paragraphs: [],
});

const reference: Reference = {
  bibleId: "esv",
  compareId: "cuvs",
  bookId: "JHN",
  startChapter: "3",
  startVerse: "16",
  endChapter: "3",
  endVerse: "17",
};

describe("licenceText", () => {
  it("cites both translations in display order and trims links to domains", () => {
    const text = licenceText(
      bibles,
      reference,
      false,
      passage("© Crossway", "https://www.esv.org/"),
      passage("Public domain", ""),
    );
    assert.equal(text.citation, "ESV · CUV");
    assert.equal(text.sources, "www.esv.org");
    assert.equal(text.copyright, "© Crossway   Public domain");
    assert.equal(text.notice, "© Crossway  ·  Public domain  ·  https://www.esv.org/");
  });

  it("follows a swap and does not repeat a shared notice", () => {
    const shared = passage("Same notice", "https://api.bible");
    const text = licenceText(bibles, reference, true, shared, shared);
    assert.equal(text.citation, "CUV · ESV");
    assert.equal(text.copyright, "Same notice");
    assert.equal(text.sources, "api.bible");
  });

  it("falls back to the id for an unknown translation", () => {
    assert.equal(abbreviation(bibles, "xyz"), "xyz");
    assert.equal(abbreviation(bibles, ""), "");
  });
});

describe("referenceLabel", () => {
  it("names single verses, same-chapter and spanning ranges", () => {
    assert.equal(referenceLabel("John", { ...reference, endVerse: "16" }), "John 3:16");
    assert.equal(referenceLabel("John", reference), "John 3:16–17");
    assert.equal(
      referenceLabel("John", { ...reference, endChapter: "4", endVerse: "2" }),
      "John 3:16–4:2",
    );
    assert.equal(referenceLabel(undefined, reference), "—");
  });
});
