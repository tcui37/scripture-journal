/**
 * Builds the printable page markup as HTML strings.
 *
 * Pages are absolutely-positioned boxes at a fixed pixel size, so the same
 * markup measures, previews and prints identically. Everything here is pure:
 * the pagination pass calls it repeatedly to measure trial layouts.
 */

import {
  DEFAULT_TEXT_SHARE,
  FOOTER,
  HAIRLINE,
  INK,
  MARGIN,
  MUTED,
  NOTICE,
  PAGE_SIZES,
  RULE,
  TEXT_SHARE_MAX,
  TEXT_SHARE_MIN,
  WORDS_OF_CHRIST,
} from "./constants";
import type { Paragraph, PoetryIndent, Settings, Verse } from "./types";

export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SANS = "var(--font-body), system-ui, sans-serif";

/**
 * Section heading and chapter marker, shared by the flowing and parallel
 * layouts so the two cannot drift apart. Both return "" when the
 * corresponding setting is off, which callers treat as "emit nothing".
 */
export function headingHtml(text: string, settings: Settings) {
  if (!settings.showHeadings || !text) return "";
  const size = (settings.size * 0.84).toFixed(1);
  return `<div style="font-family:${SANS};font-size:${size}pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${MUTED};margin:1.15em 0 .5em">${escapeHtml(text)}</div>`;
}

export function chapterHtml(number: string, settings: Settings) {
  if (!settings.showChapterNumbers || !number) return "";
  const size = (settings.size * 0.95).toFixed(1);
  return `<div style="font-family:${SANS};font-size:${size}pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${INK};margin:1.6em 0 .6em">Chapter ${escapeHtml(number)}</div>`;
}

/** Sheet size in CSS pixels, with orientation applied. */
export function pageDimensions(settings: Settings) {
  const { width, height } = PAGE_SIZES[settings.pageSize];
  return settings.orientation === "landscape"
    ? { width: height, height: width }
    : { width, height };
}

export function typeCss(settings: Settings) {
  const family =
    settings.font === "serif" ? "var(--font-serif), Georgia, serif" : SANS;
  return `font-family:${family};font-size:${settings.size}pt;line-height:${settings.lead};color:${INK};text-wrap:pretty;`;
}

export function verseHtml(verse: Verse, settings: Settings) {
  let html = "";

  if (verse.number) {
    html +=
      settings.numbers === "sup"
        ? `<sup style="font-size:.6em;font-weight:600;color:${MUTED};padding-right:.22em;line-height:0;vertical-align:.42em">${escapeHtml(verse.number)}</sup>`
        : `<span style="font-size:.78em;font-weight:700;color:${MUTED};padding-right:.35em">${escapeHtml(verse.number)}</span>`;
  }

  for (const segment of verse.segments) {
    let style = "";
    if (segment.wj && settings.wordsOfChrist) style += `color:${WORDS_OF_CHRIST};`;
    if (segment.italic) style += "font-style:italic;";
    html += style
      ? `<span style="${style}">${escapeHtml(segment.text)}</span>`
      : escapeHtml(segment.text);
  }

  return html;
}

/** Left padding for USFM poetry styles. Regular matches the previous hardcoded look. */
export function poetryPadding(style: string, indent: PoetryIndent): string {
  if (indent === "off" || !/^q/.test(style)) return "0";
  const deep = indent === "deep";
  if (/^q2/.test(style)) return deep ? "3.4em" : "2.2em";
  return deep ? "2em" : "1.2em";
}

export function paragraphHtml(paragraph: Paragraph, settings: Settings) {
  if (paragraph.kind === "chapter") return chapterHtml(paragraph.heading, settings);
  if (paragraph.kind === "heading") return headingHtml(paragraph.heading, settings);

  const verses = paragraph.verses;
  const align = settings.justify ? "text-align:justify;hyphens:auto" : "text-align:left";
  const indent = poetryPadding(paragraph.style, settings.poetryIndent);
  const base = typeCss(settings);

  if (settings.flow === "line") {
    return verses
      .map(
        (verse) =>
          `<div style="${base}margin:0 0 .3em ${indent};padding-left:1.6em;text-indent:-1.6em">${verseHtml(verse, settings)}</div>`,
      )
      .join("");
  }

  const body = verses.map((verse) => verseHtml(verse, settings)).join(" ");
  return `<p style="${base}margin:0 0 .5em;padding-left:${indent};${align}">${body}</p>`;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LineBox extends Box {
  /** Hairline separating the writing area from the text. */
  border?: "left" | "top";
}

export interface Geometry {
  page: { width: number; height: number };
  /** Usable height between the margins, above the footer. */
  available: number;
  /** Text slots in flow order. */
  slots: Box[];
  /** Ruled or dotted writing areas. */
  lineBoxes: LineBox[];
  /** Text slots consumed per sheet. */
  perPage: number;
}

// Classic proportions at the default textShare, measured from the original
// A4 design so every layout keeps its look on Letter and in landscape.
const TEXT_FRACTION_RIGHT = 0.5714;
const MARGIN_FRACTION_TWOCOL = 0.2653;
const CENTRE_FRACTION_WIDE = 0.5073;
const TEXT_FRACTION_BOTTOM = 0.54;

function clampedTextShare(settings: Settings): number {
  const value = settings.textShare;
  if (typeof value !== "number" || Number.isNaN(value)) return DEFAULT_TEXT_SHARE;
  return Math.min(TEXT_SHARE_MAX, Math.max(TEXT_SHARE_MIN, value));
}

/** Scale a layout's classic fraction so the default textShare keeps today's look. */
function splitFraction(share: number, classic: number): number {
  return classic * (share / DEFAULT_TEXT_SHARE);
}

/** Where text and writing areas sit on a page, for the current settings. */
export function geometry(settings: Settings): Geometry {
  const page = pageDimensions(settings);
  const inner = page.width - 2 * MARGIN;
  // FOOTER and NOTICE are reserved on every sheet even though the copyright
  // paragraph only prints on the last one: pagination uses a single slot
  // height, so it has to clear the tallest footer any sheet will draw.
  const available = page.height - 2 * MARGIN - FOOTER - NOTICE;
  const full = { x: MARGIN, y: MARGIN, width: inner, height: available };

  if (settings.lines === "none") {
    // Text only: drop the writing area and let the passage use the sheet.
    if (settings.layout === "twocol") {
      const gutter = 22;
      const column = Math.floor((inner - gutter) / 2);
      return {
        page,
        available,
        perPage: 2,
        slots: [
          { ...full, width: column },
          { ...full, x: MARGIN + column + gutter, width: column },
        ],
        lineBoxes: [],
      };
    }
    return { page, available, perPage: 1, slots: [full], lineBoxes: [] };
  }

  switch (settings.layout) {
    case "right": {
      const gutter = 26;
      const share = clampedTextShare(settings);
      const textWidth = Math.round(inner * splitFraction(share, TEXT_FRACTION_RIGHT));
      return {
        page,
        available,
        perPage: 1,
        slots: [{ ...full, width: textWidth }],
        lineBoxes: [
          {
            x: MARGIN + textWidth + gutter,
            y: MARGIN,
            width: inner - textWidth - gutter,
            height: available,
            border: "left",
          },
        ],
      };
    }

    case "bottom": {
      const gap = 22;
      const share = clampedTextShare(settings);
      const textHeight = Math.round(available * splitFraction(share, TEXT_FRACTION_BOTTOM));
      return {
        page,
        available,
        perPage: 1,
        slots: [{ ...full, height: textHeight }],
        lineBoxes: [
          {
            x: MARGIN,
            y: MARGIN + textHeight + gap,
            width: inner,
            height: available - textHeight - gap,
            border: "top",
          },
        ],
      };
    }

    case "twocol": {
      const gutter = 22;
      const rule = 26;
      const share = clampedTextShare(settings);
      const marginWidth = Math.round(
        inner * MARGIN_FRACTION_TWOCOL * ((1 - share) / (1 - DEFAULT_TEXT_SHARE)),
      );
      const column = Math.floor((inner - marginWidth - rule - gutter) / 2);
      return {
        page,
        available,
        perPage: 2,
        slots: [
          { ...full, width: column },
          { ...full, x: MARGIN + column + gutter, width: column },
        ],
        lineBoxes: [
          {
            x: MARGIN + column * 2 + gutter + rule,
            y: MARGIN,
            width: inner - column * 2 - gutter - rule,
            height: available,
            border: "left",
          },
        ],
      };
    }

    case "verso":
      // The facing lined page is generated separately, as a blank sheet.
      return { page, available, perPage: 1, slots: [full], lineBoxes: [] };

    default: {
      const gap = 22;
      const share = clampedTextShare(settings);
      const centre = Math.round(inner * splitFraction(share, CENTRE_FRACTION_WIDE));
      const side = Math.round((inner - centre - gap * 2) / 2);
      return {
        page,
        available,
        perPage: 1,
        slots: [{ ...full, x: MARGIN + side + gap, width: centre }],
        lineBoxes: [
          { x: MARGIN, y: MARGIN, width: side, height: available },
          {
            x: MARGIN + side + gap + centre + gap,
            y: MARGIN,
            width: side,
            height: available,
          },
        ],
      };
    }
  }
}

/** One text slot covering every column, so a parallel pair can share the page. */
export function singleTextGeometry(settings: Settings): Geometry {
  const geo = geometry(settings);
  const x = Math.min(...geo.slots.map((slot) => slot.x));
  const y = Math.min(...geo.slots.map((slot) => slot.y));
  const right = Math.max(...geo.slots.map((slot) => slot.x + slot.width));
  const bottom = Math.max(...geo.slots.map((slot) => slot.y + slot.height));
  return {
    ...geo,
    perPage: 1,
    slots: [{ x, y, width: right - x, height: bottom - y }],
  };
}

export const rulePitch = (settings: Settings) =>
  Math.max(20, Math.round(settings.size * 1.333 * settings.lead));

const RULE_OFFSET = 6;

/**
 * The writing area, drawn as one SVG path.
 *
 * This used to be a `repeating-linear-gradient`, which browsers turn into a
 * tiled bitmap. When the tile height doesn't land on whole device pixels the
 * tiles snap alternately up and down, and the ruling comes out visibly uneven
 * — most obviously in print, where the tile is re-rasterised at printer
 * resolution. Emitting explicit geometry keeps every line mathematically
 * placed and identically phased, so the spacing is exact at any scale, and it
 * stays vector all the way into the PDF.
 */
function writingAreaSvg(width: number, height: number, settings: Settings) {
  if (settings.lines === "blank" || settings.lines === "none" || width <= 0 || height <= 0) {
    return "";
  }
  const pitch = rulePitch(settings);

  if (settings.lines === "dots") {
    // Zero-length segments with round caps: one path, however many dots.
    const dots: string[] = [];
    for (let y = RULE_OFFSET; y <= height; y += pitch) {
      for (let x = 2; x <= width; x += pitch) dots.push(`M${x} ${y}h0`);
    }
    if (!dots.length) return "";
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block"><path d="${dots.join("")}" stroke="${RULE}" stroke-width="2" stroke-linecap="round"/></svg>`;
  }

  const rules: string[] = [];
  // The +0.5 puts every line on the same subpixel phase, so they all
  // rasterise identically instead of some landing crisp and some soft.
  for (let y = RULE_OFFSET + pitch; y <= height; y += pitch) {
    rules.push(`M0 ${y + 0.5}H${width}`);
  }
  if (!rules.length) return "";
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block"><path d="${rules.join("")}" stroke="${RULE}" stroke-width="1"/></svg>`;
}

const position = (box: Box) =>
  `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;`;

function titleBandSvg(width: number, pitch: number) {
  const height = Math.round(pitch * 2 + 8);
  const dateWidth = Math.max(48, Math.round(width * 0.42));
  const dateY = Math.round(pitch * 0.7) + 0.5;
  const titleY = Math.round(pitch * 1.7) + 0.5;
  return {
    height,
    html: `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block"><path d="M0 ${dateY}H${dateWidth}M0 ${titleY}H${width}" stroke="${RULE}" stroke-width="1"/></svg>`,
  };
}

function lineBoxHtml(box: LineBox, settings: Settings, header?: string) {
  let border = "";
  let padLeft = 0;
  let padTop = 0;
  let innerW = box.width;
  let innerH = box.height;

  if (box.border === "left") {
    border = `border-left:1px solid ${HAIRLINE};`;
    padLeft = 16;
    innerW = box.width - padLeft - 1;
  } else if (box.border === "top") {
    border = `border-top:1px solid ${HAIRLINE};`;
    padTop = 14;
    innerH = box.height - padTop - 1;
  }

  const pitch = rulePitch(settings);
  const showTitle = settings.titleLine;
  const showHeader = Boolean(header && showTitle);
  const headerH = showHeader ? 16 : 0;
  const title = showTitle ? titleBandSvg(innerW, pitch) : { height: 0, html: "" };

  const parts: string[] = [];
  if (showHeader) {
    parts.push(
      `<div style="font-family:${SANS};font-size:7pt;letter-spacing:.12em;text-transform:uppercase;color:${MUTED};height:${headerH}px;line-height:${headerH}px;overflow:hidden">${escapeHtml(header!)}</div>`,
    );
  }
  if (title.html) parts.push(title.html);
  parts.push(writingAreaSvg(innerW, Math.max(0, innerH - headerH - title.height), settings));

  return `<div style="${position(box)}${border}padding-left:${padLeft}px;padding-top:${padTop}px">${parts.join("")}</div>`;
}

export interface PageOptions {
  slots: string[];
  pageNumber: number;
  total: number;
  /** A facing page in the verso layout: writing area only. */
  blank: boolean;
  reference: string;
  /** Translation abbreviation(s), e.g. "NIV" — the in-context citation. */
  citation: string;
  /** Short source links, e.g. "esv.org". Required on every page. */
  sources: string;
  /** The publishers' full notices. Printed once, on the final sheet. */
  copyright: string;
  settings: Settings;
  /** When set, used instead of `geometry(settings)` so pagination and paint agree. */
  layout?: Geometry;
}

/**
 * The foot of every sheet.
 *
 * Both keyed sources ask for two different things, at two different
 * frequencies: the translation abbreviation and a link back on *every* page
 * carrying their text, and the full copyright notice once on a "copyright
 * page". So each sheet gets a single quiet line, and only the last one carries
 * the paragraph — the minimum each licence actually asks for.
 *
 * The citation line rides along with the user's `pageNumbers` setting only for
 * its page-number half; the abbreviation and links are a licence condition and
 * are always drawn.
 */
function footerHtml({
  pageNumber,
  total,
  reference,
  citation,
  sources,
  copyright,
  settings,
}: Omit<PageOptions, "slots" | "blank">) {
  const band = `position:absolute;left:${MARGIN}px;right:${MARGIN}px;font-family:${SANS};color:${MUTED};`;
  const out: string[] = [];
  const lastPage = pageNumber >= total;

  const left = citation ? `${reference} (${citation})` : reference;
  const right = [sources, settings.pageNumbers ? `${pageNumber} / ${total}` : ""]
    .filter(Boolean)
    .join("   ·   ");

  out.push(
    `<div style="${band}bottom:${Math.round(MARGIN * 0.52) + (lastPage && copyright ? NOTICE : 0)}px;display:flex;justify-content:space-between;gap:16px;font-size:7.5pt;letter-spacing:.05em"><span>${escapeHtml(left)}</span><span style="white-space:nowrap">${escapeHtml(right)}</span></div>`,
  );

  if (lastPage && copyright) {
    out.push(
      `<div style="${band}bottom:14px;font-size:5.8pt;line-height:1.3;overflow-wrap:anywhere">${escapeHtml(copyright)}</div>`,
    );
  }

  return out.join("");
}

export function pageHtml({
  slots,
  pageNumber,
  total,
  blank,
  reference,
  citation,
  sources,
  copyright,
  settings,
  layout,
}: PageOptions) {
  const geo = layout ?? geometry(settings);
  const footer = footerHtml({
    pageNumber,
    total,
    reference,
    citation,
    sources,
    copyright,
    settings,
  });

  if (blank) {
    const full: Box = {
      x: MARGIN,
      y: MARGIN,
      width: geo.page.width - 2 * MARGIN,
      height: geo.available,
    };
    const header = settings.titleLine
      ? [reference, citation].filter(Boolean).join("  ·  ")
      : undefined;
    return lineBoxHtml(full, settings, header) + footer;
  }

  const text = geo.slots
    .map(
      (box, index) =>
        `<div style="${position(box)}overflow:hidden">${slots[index] ?? ""}</div>`,
    )
    .join("");

  const writing = geo.lineBoxes.map((box) => lineBoxHtml(box, settings)).join("");

  return text + writing + footer;
}
