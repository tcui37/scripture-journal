import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_SETTINGS, PAGE_SIZES } from "./constants";
import {
  geometry,
  pageDimensions,
  pageHtml,
  paragraphHtml,
  poetryPadding,
  singleTextGeometry,
} from "./render";
import type { Paragraph, Settings } from "./types";

const settings = (overrides: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
});

const poem = (style: string): Paragraph => ({
  kind: "text",
  style,
  heading: "",
  verses: [{ number: "1", segments: [{ text: "Blessed", wj: false, italic: false }] }],
});

describe("poetryPadding", () => {
  it("is off for prose, and for poetry when indent is off", () => {
    assert.equal(poetryPadding("p", "regular"), "0");
    assert.equal(poetryPadding("q1", "off"), "0");
    assert.equal(poetryPadding("q2", "off"), "0");
  });

  it("uses the regular and deep steps for q / q2", () => {
    assert.equal(poetryPadding("q1", "regular"), "1.2em");
    assert.equal(poetryPadding("q2", "regular"), "2.2em");
    assert.equal(poetryPadding("q1", "deep"), "2em");
    assert.equal(poetryPadding("q2", "deep"), "3.4em");
  });
});

describe("paragraphHtml poetry indent", () => {
  it("writes the padding onto flowing paragraphs", () => {
    assert.match(
      paragraphHtml(poem("q1"), settings({ poetryIndent: "regular" })),
      /padding-left:1.2em/,
    );
    assert.match(
      paragraphHtml(poem("q2"), settings({ poetryIndent: "deep" })),
      /padding-left:3.4em/,
    );
    assert.match(
      paragraphHtml(poem("q1"), settings({ poetryIndent: "off" })),
      /padding-left:0/,
    );
  });
});

describe("geometry for lines: none", () => {
  it("gives the passage the full sheet and drops the writing area", () => {
    const geo = geometry(settings({ lines: "none", layout: "right" }));
    assert.equal(geo.lineBoxes.length, 0);
    assert.equal(geo.perPage, 1);
    assert.equal(geo.slots.length, 1);
    assert.equal(geo.slots[0]?.width, geo.page.width - 54 * 2);
    assert.equal(geo.slots[0]?.height, geo.available);
  });

  it("keeps two equal text columns for twocol, still with no lines", () => {
    const geo = geometry(settings({ lines: "none", layout: "twocol" }));
    assert.equal(geo.lineBoxes.length, 0);
    assert.equal(geo.perPage, 2);
    assert.equal(geo.slots.length, 2);
    assert.equal(geo.slots[0]?.width, geo.slots[1]?.width);
    assert.ok((geo.slots[0]?.width ?? 0) > 0);
  });

  it("does not invent a writing area on verso either", () => {
    const geo = geometry(settings({ lines: "none", layout: "verso" }));
    assert.equal(geo.lineBoxes.length, 0);
    assert.equal(geo.slots.length, 1);
  });

  it("still draws a writing area when lines are ruled", () => {
    const geo = geometry(settings({ lines: "ruled", layout: "right" }));
    assert.ok(geo.lineBoxes.length > 0);
  });

  it("collapses twocol slots to one region for a parallel pair", () => {
    const geo = singleTextGeometry(settings({ lines: "none", layout: "twocol" }));
    assert.equal(geo.perPage, 1);
    assert.equal(geo.slots.length, 1);
    assert.equal(geo.lineBoxes.length, 0);
  });
});

describe("pageDimensions", () => {
  it("uses the 96dpi portrait sizes for A5, A6, and half-letter", () => {
    assert.deepEqual(pageDimensions(settings({ pageSize: "A5", orientation: "portrait" })), PAGE_SIZES.A5);
    assert.deepEqual(pageDimensions(settings({ pageSize: "A6", orientation: "portrait" })), PAGE_SIZES.A6);
    assert.deepEqual(pageDimensions(settings({ pageSize: "Half letter", orientation: "portrait" })), PAGE_SIZES["Half letter"]);
    assert.equal(PAGE_SIZES.A5.width, 559);
    assert.equal(PAGE_SIZES.A5.height, 794);
    assert.equal(PAGE_SIZES.A6.width, 397);
    assert.equal(PAGE_SIZES.A6.height, 559);
    assert.equal(PAGE_SIZES["Half letter"].width, 528);
    assert.equal(PAGE_SIZES["Half letter"].height, 816);
  });

  it("swaps A5 for landscape", () => {
    const portrait = pageDimensions(settings({ pageSize: "A5", orientation: "portrait" }));
    const landscape = pageDimensions(settings({ pageSize: "A5", orientation: "landscape" }));
    assert.equal(landscape.width, portrait.height);
    assert.equal(landscape.height, portrait.width);
  });

  it("uses the 96dpi portrait sizes for A3, B5, and B6", () => {
    assert.deepEqual(pageDimensions(settings({ pageSize: "A3", orientation: "portrait" })), PAGE_SIZES.A3);
    assert.deepEqual(pageDimensions(settings({ pageSize: "B5", orientation: "portrait" })), PAGE_SIZES.B5);
    assert.deepEqual(pageDimensions(settings({ pageSize: "B6", orientation: "portrait" })), PAGE_SIZES.B6);
    assert.equal(PAGE_SIZES.A3.width, 1123);
    assert.equal(PAGE_SIZES.A3.height, 1587);
    assert.equal(PAGE_SIZES.B5.width, 665);
    assert.equal(PAGE_SIZES.B5.height, 945);
    assert.equal(PAGE_SIZES.B6.width, 472);
    assert.equal(PAGE_SIZES.B6.height, 665);
  });

  it("uses the 96dpi portrait sizes for tabloid, executive, and 6 × 9", () => {
    assert.deepEqual(pageDimensions(settings({ pageSize: "Tabloid", orientation: "portrait" })), PAGE_SIZES.Tabloid);
    assert.deepEqual(pageDimensions(settings({ pageSize: "Executive", orientation: "portrait" })), PAGE_SIZES.Executive);
    assert.deepEqual(pageDimensions(settings({ pageSize: "6 × 9 in", orientation: "portrait" })), PAGE_SIZES["6 × 9 in"]);
    assert.equal(PAGE_SIZES.Tabloid.width, 1056);
    assert.equal(PAGE_SIZES.Tabloid.height, 1632);
    assert.equal(PAGE_SIZES.Executive.width, 696);
    assert.equal(PAGE_SIZES.Executive.height, 1008);
    assert.equal(PAGE_SIZES["6 × 9 in"].width, 576);
    assert.equal(PAGE_SIZES["6 × 9 in"].height, 864);
  });
});

describe("textShare", () => {
  it("keeps the classic right-layout split at the default", () => {
    const geo = geometry(settings({ layout: "right" }));
    const inner = geo.page.width - 54 * 2;
    assert.equal(geo.slots[0]?.width, Math.round(inner * 0.5714));
    assert.equal(geo.lineBoxes[0]?.width, inner - (geo.slots[0]?.width ?? 0) - 26);
  });

  it("makes the right-layout text slot wider and the lines narrower", () => {
    const low = geometry(settings({ layout: "right", textShare: 0.4 }));
    const high = geometry(settings({ layout: "right", textShare: 0.7 }));
    assert.ok((high.slots[0]?.width ?? 0) > (low.slots[0]?.width ?? 0));
    assert.ok((high.lineBoxes[0]?.width ?? 0) < (low.lineBoxes[0]?.width ?? 0));
  });

  it("makes the bottom-layout text slot taller and the lines shorter", () => {
    const low = geometry(settings({ layout: "bottom", textShare: 0.4 }));
    const high = geometry(settings({ layout: "bottom", textShare: 0.7 }));
    assert.ok((high.slots[0]?.height ?? 0) > (low.slots[0]?.height ?? 0));
    assert.ok((high.lineBoxes[0]?.height ?? 0) < (low.lineBoxes[0]?.height ?? 0));
  });

  it("narrows the twocol writing margin as textShare rises", () => {
    const low = geometry(settings({ layout: "twocol", textShare: 0.4 }));
    const high = geometry(settings({ layout: "twocol", textShare: 0.7 }));
    assert.ok((high.lineBoxes[0]?.width ?? 0) < (low.lineBoxes[0]?.width ?? 0));
    assert.equal(high.slots[0]?.width, high.slots[1]?.width);
    assert.ok((high.slots[0]?.width ?? 0) > (low.slots[0]?.width ?? 0));
  });

  it("widens the wide-layout centre column as textShare rises", () => {
    const low = geometry(settings({ layout: "wide", textShare: 0.4 }));
    const high = geometry(settings({ layout: "wide", textShare: 0.7 }));
    assert.ok((high.slots[0]?.width ?? 0) > (low.slots[0]?.width ?? 0));
    assert.ok((high.lineBoxes[0]?.width ?? 0) < (low.lineBoxes[0]?.width ?? 0));
  });

  it("still lays out A5 with a writing area", () => {
    const geo = geometry(settings({ pageSize: "A5", layout: "right", orientation: "portrait" }));
    assert.equal(geo.page.width, 559);
    assert.ok((geo.slots[0]?.width ?? 0) > 0);
    assert.ok((geo.lineBoxes[0]?.width ?? 0) > 0);
    assert.ok((geo.slots[0]?.width ?? 0) + (geo.lineBoxes[0]?.width ?? 0) < geo.page.width);
  });
});

describe("titleLine", () => {
  /** Date rule is shorter than the title rule; ordinary ruling is full-width. */
  const titleBand = /M0 [\d.]+H(\d+)M0 [\d.]+H(\d+)/;
  const hasTitleBand = (html: string) => {
    const match = html.match(titleBand);
    return Boolean(match && match[1] !== match[2]);
  };

  const page = (titleLine: boolean, blank: boolean) =>
    pageHtml({
      slots: [""],
      pageNumber: 1,
      total: 2,
      blank,
      reference: "John 3:16",
      citation: "NIV",
      sources: "esv.org",
      copyright: "",
      settings: settings({ titleLine, layout: "verso", lines: "ruled" }),
    });

  it("prints date/title rules and a verso running header when on", () => {
    const html = page(true, true);
    assert.match(html, /John 3:16  ·  NIV/);
    assert.equal(hasTitleBand(html), true);
  });

  it("omits the running header and title rules when off", () => {
    const html = page(false, true);
    assert.doesNotMatch(html, /John 3:16  ·  NIV/);
    assert.equal(hasTitleBand(html), false);
  });

  it("still draws date/title rules on a writing margin of a text page", () => {
    const html = pageHtml({
      slots: ["<p>text</p>"],
      pageNumber: 1,
      total: 1,
      blank: false,
      reference: "John 3:16",
      citation: "NIV",
      sources: "esv.org",
      copyright: "",
      settings: settings({ titleLine: true, layout: "right", lines: "ruled" }),
    });
    assert.equal(hasTitleBand(html), true);
    assert.doesNotMatch(html, /John 3:16  ·  NIV/);
  });
});

describe("copyright notice", () => {
  const longNotice =
    "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), copyright © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.";

  it("prints the full last-page notice without clipping it", () => {
    const html = pageHtml({
      slots: ["<p>text</p>"],
      pageNumber: 1,
      total: 1,
      blank: false,
      reference: "John 3:16",
      citation: "ESV",
      sources: "esv.org",
      copyright: longNotice,
      settings: settings(),
    });
    assert.match(html, /Used by permission\. All rights reserved\./);
    assert.match(html, /overflow-wrap:anywhere/);
    assert.doesNotMatch(html, /max-height:\d+px;overflow:hidden/);
  });
});
