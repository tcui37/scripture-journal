/**
 * Builds the printable page markup as HTML strings.
 *
 * Pages are absolutely-positioned boxes at a fixed pixel size, so the same
 * markup measures, previews and prints identically. Everything here is pure:
 * the pagination pass calls it repeatedly to measure trial layouts.
 */

import {
  FOOTER,
  HAIRLINE,
  INK,
  MARGIN,
  MUTED,
  PAGE_SIZES,
  RULE,
  WORDS_OF_CHRIST,
} from "./constants";
import type { Paragraph, Settings, Verse } from "./types";

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SANS = "var(--font-body), system-ui, sans-serif";

/** Sheet size in CSS pixels, with orientation applied. */
export function pageDimensions(settings: Settings) {
  const { width, height } = PAGE_SIZES[settings.pageSize];
  return settings.orientation === "landscape"
    ? { width: height, height: width }
    : { width, height };
}

function typeCss(settings: Settings) {
  const family =
    settings.font === "serif" ? "var(--font-serif), Georgia, serif" : SANS;
  return `font-family:${family};font-size:${settings.size}pt;line-height:${settings.lead};color:${INK};text-wrap:pretty;`;
}

function verseHtml(verse: Verse, settings: Settings) {
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

/** `upto` renders only the first N verses, used to find a page break. */
export function paragraphHtml(paragraph: Paragraph, settings: Settings, upto?: number) {
  if (paragraph.kind === "chapter") {
    if (!settings.showChapterNumbers) return "";
    const size = (settings.size * 0.95).toFixed(1);
    return `<div style="font-family:${SANS};font-size:${size}pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${INK};margin:1.6em 0 .6em">Chapter ${escapeHtml(paragraph.heading)}</div>`;
  }

  if (paragraph.kind === "heading") {
    if (!settings.showHeadings) return "";
    const size = (settings.size * 0.84).toFixed(1);
    return `<div style="font-family:${SANS};font-size:${size}pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${MUTED};margin:1.15em 0 .5em">${escapeHtml(paragraph.heading)}</div>`;
  }

  const verses = upto == null ? paragraph.verses : paragraph.verses.slice(0, upto);
  const align = settings.justify ? "text-align:justify;hyphens:auto" : "text-align:left";
  // q1/q2 are poetry lines; indent them the way a print Bible would.
  const indent = /^q2/.test(paragraph.style) ? "2.2em" : /^q/.test(paragraph.style) ? "1.2em" : "0";
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

// Proportions of the inner width, measured from the original A4 design so
// every layout keeps its look on Letter and in landscape.
const TEXT_FRACTION_RIGHT = 0.5714;
const MARGIN_FRACTION_TWOCOL = 0.2653;
const CENTRE_FRACTION_WIDE = 0.5073;
const TEXT_FRACTION_BOTTOM = 0.54;

/** Where text and writing areas sit on a page, for the current settings. */
export function geometry(settings: Settings): Geometry {
  const page = pageDimensions(settings);
  const inner = page.width - 2 * MARGIN;
  const available = page.height - 2 * MARGIN - (settings.pageNumbers ? FOOTER : 8);
  const full = { x: MARGIN, y: MARGIN, width: inner, height: available };

  switch (settings.layout) {
    case "right": {
      const gutter = 26;
      const textWidth = Math.round(inner * TEXT_FRACTION_RIGHT);
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
      const textHeight = Math.round(available * TEXT_FRACTION_BOTTOM);
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
      const marginWidth = Math.round(inner * MARGIN_FRACTION_TWOCOL);
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
      const centre = Math.round(inner * CENTRE_FRACTION_WIDE);
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
  if (settings.lines === "blank" || width <= 0 || height <= 0) return "";
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

function lineBoxHtml(box: LineBox, settings: Settings) {
  if (box.border === "left") {
    const pad = 16;
    const inner = writingAreaSvg(box.width - pad - 1, box.height, settings);
    return `<div style="${position(box)}border-left:1px solid ${HAIRLINE};padding-left:${pad}px">${inner}</div>`;
  }
  if (box.border === "top") {
    const pad = 14;
    const inner = writingAreaSvg(box.width, box.height - pad - 1, settings);
    return `<div style="${position(box)}border-top:1px solid ${HAIRLINE};padding-top:${pad}px">${inner}</div>`;
  }
  return `<div style="${position(box)}">${writingAreaSvg(box.width, box.height, settings)}</div>`;
}

export interface PageOptions {
  slots: string[];
  pageNumber: number;
  total: number;
  /** A facing page in the verso layout: writing area only. */
  blank: boolean;
  reference: string;
  settings: Settings;
}

export function pageHtml({
  slots,
  pageNumber,
  total,
  blank,
  reference,
  settings,
}: PageOptions) {
  const geo = geometry(settings);

  const footer = settings.pageNumbers
    ? `<div style="position:absolute;left:${MARGIN}px;right:${MARGIN}px;bottom:${Math.round(MARGIN * 0.52)}px;display:flex;justify-content:space-between;font-family:${SANS};font-size:8pt;letter-spacing:.06em;color:${MUTED}"><span>${escapeHtml(reference)}</span><span>${pageNumber} / ${total}</span></div>`
    : "";

  if (blank) {
    const full: Box = {
      x: MARGIN,
      y: MARGIN,
      width: geo.page.width - 2 * MARGIN,
      height: geo.available,
    };
    return lineBoxHtml(full, settings) + footer;
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
