import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allowance,
  checkLimits,
  explanationFor,
  licenceSource,
  limitExplanations,
  versesInRange,
} from "./limits";
import type { BibleSummary, Book, Reference } from "./types";

const API_BIBLE_NOTE =
  "api.bible's terms limit printing of licensed translations to 100 verses at a time. " +
  "Public-domain translations are not restricted.";
const ESV_NOTE =
  "Crossway permits at most 500 verses, or half a book, per passage. " +
  "Single-chapter books may be shown in full.";

const bible = (
  id: string,
  label: string,
  limits: BibleSummary["limits"],
): BibleSummary => ({
  id,
  label,
  language: "eng",
  language_name: "English",
  limits,
});

const NIV = bible("niv", "NIV — New International Version", {
  max_verses: 100,
  max_book_fraction: null,
  exempt_single_chapter_books: false,
  note: API_BIBLE_NOTE,
});

const NASB = bible("nasb", "NASB — New American Standard Bible 1995", {
  max_verses: 100,
  max_book_fraction: null,
  exempt_single_chapter_books: false,
  note: API_BIBLE_NOTE,
});

const ESV = bible("esv", "ESV — English Standard Version", {
  max_verses: 500,
  max_book_fraction: 0.5,
  exempt_single_chapter_books: true,
  note: ESV_NOTE,
});

const KJV = bible("kjv", "KJV — King James Version", null);

const book = (id: string, name: string, verseCounts: number[]): Book => ({
  id,
  name,
  chapters: verseCounts.map((verse_count, index) => ({
    number: String(index + 1),
    verse_count,
  })),
});

const ref = (patch: Partial<Reference> = {}): Reference => ({
  bibleId: "niv",
  compareId: "",
  bookId: "JHN",
  startChapter: "1",
  startVerse: "1",
  endChapter: "1",
  endVerse: "1",
  ...patch,
});

const john = book("JHN", "John", [51, 25, 36]);
/** Long enough that ESV's 500-verse cap binds before half the book. */
const psalms = book("PSA", "Psalms", [600, 600, 600, 600]);
const jude = book("JUD", "Jude", [25]);

describe("versesInRange", () => {
  it("counts a single verse", () => {
    assert.equal(versesInRange(john, ref()), 1);
  });

  it("spans chapters", () => {
    assert.equal(
      versesInRange(john, ref({ endChapter: "2", endVerse: "10" })),
      51 + 10,
    );
  });
});

describe("allowance", () => {
  it("uses the 100-verse api.bible print cap", () => {
    assert.equal(allowance(NIV, john), 100);
  });

  it("takes the smaller of 500 verses and half the book for ESV", () => {
    assert.equal(allowance(ESV, psalms), 500);
    assert.equal(allowance(ESV, john), Math.floor((51 + 25 + 36) * 0.5));
  });

  it("exempts single-chapter books from the ESV cap", () => {
    assert.equal(allowance(ESV, jude), null);
  });

  it("is unrestricted when the translation has no limits", () => {
    assert.equal(allowance(KJV, psalms), null);
  });
});

describe("checkLimits", () => {
  it("warns when NIV exceeds 100 verses", () => {
    const result = checkLimits(
      [NIV],
      ["niv"],
      psalms,
      ref({ endChapter: "1", endVerse: "150" }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.cap, 100);
    assert.equal(result.requested, 150);
    assert.match(result.message, /NIV allows at most 100 verses/);
  });

  it("does not warn for an uncapped translation", () => {
    const result = checkLimits(
      [KJV],
      ["kjv"],
      psalms,
      ref({ bibleId: "kjv", endChapter: "1", endVerse: "600" }),
    );
    assert.equal(result.ok, true);
    assert.equal(result.cap, null);
  });

  it("in compare mode, fails on the first selected translation that is over", () => {
    const result = checkLimits(
      [NIV, ESV],
      ["niv", "esv"],
      psalms,
      ref({ compareId: "esv", endChapter: "1", endVerse: "150" }),
    );
    assert.equal(result.ok, false);
    assert.match(result.message, /^NIV /);
  });
});

describe("licenceSource", () => {
  it("maps the 100-verse print cap to api.bible", () => {
    assert.equal(licenceSource(NIV), "api_bible");
    assert.equal(licenceSource(NASB), "api_bible");
  });

  it("maps the Crossway half-book-or-500 shape to esv", () => {
    assert.equal(licenceSource(ESV), "esv");
  });

  it("does not invent a source for uncapped translations", () => {
    assert.equal(licenceSource(KJV), "unknown");
    assert.equal(licenceSource(undefined), "unknown");
  });
});

describe("explanationFor", () => {
  it("names NIV and api.bible, and states the 100-verse print rule", () => {
    const copy = explanationFor(NIV, 100);
    assert.equal(copy.version, "NIV");
    assert.equal(copy.source, "api.bible");
    assert.equal(copy.hrefLabel, "api.bible");
    assert.equal(copy.href, "https://api.bible/terms-and-conditions#acceptable_use");
    assert.match(copy.rule, /NIV/);
    assert.match(copy.rule, /api\.bible/);
    assert.match(copy.rule, /100 verses/);
    assert.match(copy.rule, /print/i);
  });

  it("names ESV and Crossway, and states 500-or-half with this book's cap", () => {
    const cap = allowance(ESV, john)!;
    const copy = explanationFor(ESV, cap);
    assert.equal(copy.version, "ESV");
    assert.equal(copy.source, "Crossway");
    assert.equal(copy.hrefLabel, "esv.org");
    assert.equal(copy.href, "https://www.esv.org");
    assert.match(copy.rule, /ESV/);
    assert.match(copy.rule, /Crossway/);
    assert.match(copy.rule, /500 verses/);
    assert.match(copy.rule, /half/);
    assert.match(copy.rule, new RegExp(`${cap} verses`));
  });

  it("falls back to the licence note without inventing a source", () => {
    const odd = bible("xyz", "XYZ — Invented", {
      max_verses: 40,
      max_book_fraction: null,
      exempt_single_chapter_books: false,
      note: "Publisher allows 40 verses.",
    });
    const copy = explanationFor(odd, 40);
    assert.equal(copy.source, "");
    assert.equal(copy.href, "");
    assert.equal(copy.rule, "Publisher allows 40 verses.");
  });
});

describe("limitExplanations", () => {
  it("is empty when nothing is over the cap", () => {
    assert.deepEqual(
      limitExplanations([NIV], ["niv"], john, ref({ endVerse: "20" })),
      [],
    );
  });

  it("omits uncapped translations even for a huge selection", () => {
    assert.deepEqual(
      limitExplanations(
        [KJV],
        ["kjv"],
        psalms,
        ref({ bibleId: "kjv", endChapter: "1", endVerse: "600" }),
      ),
      [],
    );
  });

  it("in compare mode, explains only the translation that is blocking", () => {
    const copy = limitExplanations(
      [NIV, ESV],
      ["niv", "esv"],
      psalms,
      ref({ compareId: "esv", endChapter: "1", endVerse: "150" }),
    );
    assert.equal(copy.length, 1);
    assert.equal(copy[0].version, "NIV");
    assert.equal(copy[0].source, "api.bible");
  });

  it("covers both translations when both caps are exceeded", () => {
    const copy = limitExplanations(
      [NIV, ESV],
      ["niv", "esv"],
      psalms,
      ref({ compareId: "esv", endChapter: "1", endVerse: "550" }),
    );
    assert.deepEqual(
      copy.map((entry) => [entry.version, entry.source]),
      [
        ["NIV", "api.bible"],
        ["ESV", "Crossway"],
      ],
    );
  });
});
