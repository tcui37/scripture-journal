/**
 * Builds the printable page markup as HTML strings.
 *
 * Pages are absolutely-positioned boxes at a fixed A4 pixel size, so the same
 * markup measures, previews and prints identically. Everything here is pure:
 * the pagination pass calls it repeatedly to measure trial layouts.
 */

import {
  HAIRLINE,
  INK,
  MARGIN,
  MUTED,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  FOOTER,
  RULE,
  WORDS_OF_CHRIST,
} from "./constants";
import type { Paragraph, Settings, Verse } from "./types";

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SANS = "var(--font-body), system-ui, sans-serif";

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

export interface Slot {
  width: number;
  height: number;
}

export interface Geometry {
  slots: Slot[];
  perPage: number;
  available: number;
}

/** Where text may flow on a page, per layout. */
export function geometry(settings: Settings): Geometry {
  const available = PAGE_HEIGHT - 2 * MARGIN - (settings.pageNumbers ? FOOTER : 8);
  const inner = PAGE_WIDTH - 2 * MARGIN;

  switch (settings.layout) {
    case "right":
      return { slots: [{ width: 392, height: available }], perPage: 1, available };
    case "bottom":
      return {
        slots: [{ width: inner, height: Math.round(available * 0.54) }],
        perPage: 1,
        available,
      };
    case "twocol":
      return {
        slots: [
          { width: 228, height: available },
          { width: 228, height: available },
        ],
        perPage: 2,
        available,
      };
    case "verso":
      return { slots: [{ width: inner, height: available }], perPage: 1, available };
    default:
      return { slots: [{ width: 348, height: available }], perPage: 1, available };
  }
}

function linesCss(settings: Settings) {
  if (settings.lines === "blank") return "";
  const pitch = Math.max(20, Math.round(settings.size * 1.333 * settings.lead));

  if (settings.lines === "dots") {
    return `background-image:radial-gradient(${RULE} 1px, transparent 1.3px);background-size:${pitch}px ${pitch}px;background-position:2px 6px;`;
  }
  return `background-image:repeating-linear-gradient(to bottom, transparent 0 ${pitch - 1}px, ${RULE} ${pitch - 1}px, ${RULE} ${pitch}px);background-position:0 6px;`;
}

export interface PageOptions {
  slots: string[];
  pageNumber: number;
  total: number;
  blank: boolean;
  reference: string;
  settings: Settings;
}

export function pageHtml({ slots, pageNumber, total, blank, reference, settings }: PageOptions) {
  const geo = geometry(settings);
  const lines = linesCss(settings);
  const inner = PAGE_WIDTH - 2 * MARGIN;

  const footer = settings.pageNumbers
    ? `<div style="position:absolute;left:${MARGIN}px;right:${MARGIN}px;bottom:${Math.round(MARGIN * 0.52)}px;display:flex;justify-content:space-between;font-family:${SANS};font-size:8pt;letter-spacing:.06em;color:${MUTED}"><span>${escapeHtml(reference)}</span><span>${pageNumber} / ${total}</span></div>`
    : "";

  let body: string;

  if (blank) {
    body = `<div style="position:absolute;left:${MARGIN}px;top:${MARGIN}px;width:${inner}px;height:${geo.available}px;${lines}"></div>`;
  } else if (settings.layout === "right") {
    body = `<div style="position:absolute;left:${MARGIN}px;top:${MARGIN}px;width:392px;height:${geo.available}px;overflow:hidden">${slots[0] ?? ""}</div>
      <div style="position:absolute;left:${MARGIN + 392 + 26}px;top:${MARGIN}px;width:${inner - 392 - 26}px;height:${geo.available}px;border-left:1px solid ${HAIRLINE};padding-left:16px"><div style="height:100%;${lines}"></div></div>`;
  } else if (settings.layout === "bottom") {
    const textHeight = geo.slots[0].height;
    body = `<div style="position:absolute;left:${MARGIN}px;top:${MARGIN}px;width:${inner}px;height:${textHeight}px;overflow:hidden">${slots[0] ?? ""}</div>
      <div style="position:absolute;left:${MARGIN}px;top:${MARGIN + textHeight + 22}px;width:${inner}px;height:${geo.available - textHeight - 22}px;border-top:1px solid ${HAIRLINE};padding-top:14px"><div style="height:100%;${lines}"></div></div>`;
  } else if (settings.layout === "twocol") {
    const gutter = 22;
    const marginLeft = MARGIN + 228 * 2 + gutter + 26;
    body = `<div style="position:absolute;left:${MARGIN}px;top:${MARGIN}px;width:228px;height:${geo.available}px;overflow:hidden">${slots[0] ?? ""}</div>
      <div style="position:absolute;left:${MARGIN + 228 + gutter}px;top:${MARGIN}px;width:228px;height:${geo.available}px;overflow:hidden">${slots[1] ?? ""}</div>
      <div style="position:absolute;left:${marginLeft}px;top:${MARGIN}px;width:${inner - 228 * 2 - gutter - 26}px;height:${geo.available}px;border-left:1px solid ${HAIRLINE};padding-left:14px"><div style="height:100%;${lines}"></div></div>`;
  } else if (settings.layout === "verso") {
    body = `<div style="position:absolute;left:${MARGIN}px;top:${MARGIN}px;width:${inner}px;height:${geo.available}px;overflow:hidden">${slots[0] ?? ""}</div>`;
  } else {
    const columnWidth = 348;
    const side = Math.round((inner - columnWidth - 44) / 2);
    body = `<div style="position:absolute;left:${MARGIN + side + 22}px;top:${MARGIN}px;width:${columnWidth}px;height:${geo.available}px;overflow:hidden">${slots[0] ?? ""}</div>
      <div style="position:absolute;left:${MARGIN}px;top:${MARGIN}px;width:${side}px;height:${geo.available}px;${lines}"></div>
      <div style="position:absolute;left:${MARGIN + side + 22 + columnWidth + 22}px;top:${MARGIN}px;width:${side}px;height:${geo.available}px;${lines}"></div>`;
  }

  return body + footer;
}
