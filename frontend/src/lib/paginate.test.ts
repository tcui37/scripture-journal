import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { paragraphBlocks } from "./blocks";
import { DEFAULT_SETTINGS } from "./constants";
import { paginate, type Measurer } from "./paginate";
import type { Paragraph } from "./types";

const words = (html: string) =>
  html.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean);

/** One pixel per word, so a 20px slot holds 20 words. */
const measurer = { measure: (html: string) => words(html).length } as unknown as Measurer;

const verse = (number: string, count: number) => ({
  number,
  segments: [
    {
      text: Array.from({ length: count }, (_, i) => `v${number}w${i + 1}`).join(" "),
      wj: false,
      italic: false,
    },
  ],
});

const paragraph = (verses: ReturnType<typeof verse>[]): Paragraph => ({
  kind: "text",
  style: "p",
  heading: "",
  verses,
});

const settings = { ...DEFAULT_SETTINGS, showHeadings: false };
const slot = { width: 100, height: 20 };

describe("paginate", () => {
  it("splits between verses when they fit", () => {
    const blocks = paragraphBlocks([paragraph([verse("1", 8), verse("2", 8), verse("3", 8)])], settings);
    const pages = paginate(blocks, settings, measurer, slot).map((page) => words(page[0]));
    // "1" and "2" are verse numbers; verse 3 moves whole to the next slot.
    assert.deepEqual(pages.map((page) => page.length), [18, 9]);
    assert.equal(pages[1][0], "3");
  });

  it("breaks a verse taller than a slot instead of hiding the rest", () => {
    const blocks = paragraphBlocks([paragraph([verse("1", 5), verse("2", 50), verse("3", 5)])], settings);
    const pages = paginate(blocks, settings, measurer, slot).map((page) => words(page[0]));

    for (const page of pages) assert.ok(page.length <= slot.height, `overfull: ${page.length}`);
    const all = pages.flat();
    const expected = ["1", ...verse("1", 5).segments[0].text.split(" "),
      "2", ...verse("2", 50).segments[0].text.split(" "),
      "3", ...verse("3", 5).segments[0].text.split(" ")];
    assert.deepEqual(all, expected, "every word once, in order, numbered once");
  });

  it("keeps segment styling on both halves of a split verse", () => {
    const long: Paragraph = paragraph([
      {
        number: "1",
        segments: [
          { text: "plain ".repeat(15), wj: false, italic: false },
          { text: "red ".repeat(15).trim(), wj: true, italic: false },
        ],
      },
    ]);
    const pages = paginate(paragraphBlocks([long], settings), settings, measurer, slot);
    assert.ok(pages.length >= 2);
    assert.match(pages[1][0], /color:[^;]+;">red/);
  });
});
