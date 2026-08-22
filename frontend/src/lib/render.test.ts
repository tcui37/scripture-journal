import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_SETTINGS } from "./constants";
import {
  geometry,
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
