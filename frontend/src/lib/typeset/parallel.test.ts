import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { combineParallelBands, combineParallelColumns } from "./blocks";
import { parallelSideLabels } from "../constants";
import { alignPassages, citationIds, orderedSides } from "./parallel";
import type { Paragraph } from "../types";

const verse = (number: string, text: string) => ({
  number,
  segments: [{ text, wj: false, italic: false }],
});

const text = (verses: ReturnType<typeof verse>[]): Paragraph => ({
  kind: "text",
  style: "p",
  heading: "",
  verses,
});

describe("orderedSides", () => {
  it("leaves the primary on the left when not swapped", () => {
    assert.deepEqual(orderedSides("niv", "cuvs", false), {
      primary: "niv",
      secondary: "cuvs",
    });
  });

  it("swaps without needing a refetch when both sides exist", () => {
    assert.deepEqual(orderedSides("niv", "cuvs", true), {
      primary: "cuvs",
      secondary: "niv",
    });
  });

  it("does not swap when there is no compare passage", () => {
    assert.deepEqual(orderedSides("niv", null, true), {
      primary: "niv",
      secondary: null,
    });
  });
});

describe("citationIds", () => {
  it("follows the displayed side order", () => {
    assert.deepEqual(citationIds("niv", "cuvs", false), ["niv", "cuvs"]);
    assert.deepEqual(citationIds("niv", "cuvs", true), ["cuvs", "niv"]);
  });

  it("drops an empty compare id", () => {
    assert.deepEqual(citationIds("niv", "", false), ["niv"]);
    assert.deepEqual(citationIds("niv", "", true), ["niv"]);
  });
});

describe("parallelSideLabels", () => {
  it("names sides for each arrangement, and swap flips them", () => {
    assert.deepEqual(parallelSideLabels("columns", false), {
      primary: "Left",
      compare: "Right",
    });
    assert.deepEqual(parallelSideLabels("columns", true), {
      primary: "Right",
      compare: "Left",
    });
    assert.deepEqual(parallelSideLabels("bands", false), {
      primary: "Top",
      compare: "Bottom",
    });
    assert.deepEqual(parallelSideLabels("stacked", false), {
      primary: "First",
      compare: "Second",
    });
    assert.deepEqual(parallelSideLabels("facing", true), {
      primary: "Right page",
      compare: "Left page",
    });
  });
});

describe("alignPassages", () => {
  it("pairs verses and keeps primary headings, then leftover compare verses", () => {
    const primary: Paragraph[] = [
      { kind: "heading", style: "s", heading: "The Word", verses: [] },
      text([verse("1", "In the beginning"), verse("2", "He was")]),
    ];
    const secondary: Paragraph[] = [
      text([verse("1", "起初"), verse("3", "only in compare")]),
    ];
    const rows = alignPassages(primary, secondary);
    assert.equal(rows[0]?.kind, "heading");
    assert.equal(rows[0]?.heading, "The Word");
    assert.equal(rows[1]?.primary?.segments[0]?.text, "In the beginning");
    assert.equal(rows[1]?.secondary?.segments[0]?.text, "起初");
    assert.equal(rows[2]?.secondary, undefined);
    assert.equal(rows[3]?.number, "3");
    assert.equal(rows[3]?.primary, undefined);
  });
  it("keeps verses with the same number in different chapters apart", () => {
    const chapter = (heading: string): Paragraph => ({
      kind: "chapter",
      style: "c",
      heading,
      verses: [],
    });
    const passage = (tag: string): Paragraph[] => [
      chapter("1"),
      text([verse("1", `${tag} 1:1`), verse("2", `${tag} 1:2`)]),
      {
        kind: "text",
        style: "p",
        heading: "",
        verses: [{ number: null, segments: [{ text: `${tag} 1:2b`, wj: false, italic: false }] }],
      },
      chapter("2"),
      text([verse("1", `${tag} 2:1`)]),
    ];
    const rows = alignPassages(passage("A"), passage("B")).filter(
      (row) => row.kind === "verse",
    );
    const joined = (v?: { segments: { text: string }[] }) =>
      v?.segments.map((segment) => segment.text).join(" ");
    assert.deepEqual(
      rows.map((row) => [row.number, joined(row.primary), joined(row.secondary)]),
      [
        ["1", "A 1:1", "B 1:1"],
        ["2", "A 1:2 A 1:2b", "B 1:2 B 1:2b"],
        ["1", "A 2:1", "B 2:1"],
      ],
    );
  });
});

describe("combineParallelColumns / Bands", () => {
  it("places both sides in a two-column grid, using nbsp for an empty side", () => {
    const html = combineParallelColumns("NIV", "");
    assert.match(html, /grid-template-columns:1fr 1fr/);
    assert.match(html, /NIV/);
    assert.match(html, /&nbsp;/);
  });

  it("stacks bands with a horizontal rule", () => {
    const html = combineParallelBands("top", "bottom");
    assert.match(html, /grid-template-rows:1fr 1fr/);
    assert.match(html, /top/);
    assert.match(html, /bottom/);
    assert.match(html, /border-bottom/);
  });
});
