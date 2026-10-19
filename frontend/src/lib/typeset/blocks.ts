/**
 * Pageable units.
 *
 * Pagination doesn't care whether a page holds flowing paragraphs or
 * verse-aligned parallel rows — it only needs blocks it can measure and, where
 * possible, split. Both passage shapes are expressed as `Block`s here.
 */

import { HAIRLINE } from "../constants";
import { chapterHtml, headingHtml, paragraphHtml, typeCss, verseHtml } from "./render";
import type { AlignedRow } from "./parallel";
import type { Paragraph, Segment, Settings, Verse } from "../types";

export interface Block {
  /** Splittable sub-units (words). 1 means indivisible. */
  units: number;
  /** Render units [from, to); omitting `to` renders to the end. */
  render: (from?: number, to?: number) => string;
  /**
   * Unit offsets where a split reads well (verse starts), ascending. When set,
   * pagination splits only here unless a single stretch between two of them
   * cannot fit even an empty slot.
   */
  breaks?: number[];
  /** Avoid leaving this block stranded at the foot of a column. */
  keepWithNext?: boolean;
}

/** Space from translation text to the parallel rule, each side. */
const DIVIDER_INSET = 20;
/**
 * Total gutter reserved between the two translations. Each half of the grid
 * loses its inset, and the first half also the 1px rule, so reserve that on
 * both sides — measuring the first half 1px too wide rewraps and clips it.
 */
export const PARALLEL_GAP = (DIVIDER_INSET + 1) * 2;

/** Side-by-side translations that paginate independently, with a column rule. */
export function combineParallelColumns(primary: string, secondary: string) {
  return (
    `<div style="display:grid;grid-template-columns:1fr 1fr;align-items:start">` +
    `<div style="padding:0 ${DIVIDER_INSET}px 0 0;border-right:1px solid ${HAIRLINE}">${primary || "&nbsp;"}</div>` +
    `<div style="padding:0 0 0 ${DIVIDER_INSET}px">${secondary || "&nbsp;"}</div>` +
    `</div>`
  );
}

/** Horizontal split: primary on the top half, secondary beneath. */
export function combineParallelBands(primary: string, secondary: string) {
  return (
    `<div style="display:grid;grid-template-rows:1fr 1fr">` +
    `<div style="padding:0 0 ${DIVIDER_INSET}px 0;border-bottom:1px solid ${HAIRLINE}">${primary || "&nbsp;"}</div>` +
    `<div style="padding:${DIVIDER_INSET}px 0 0">${secondary || "&nbsp;"}</div>` +
    `</div>`
  );
}

export function paragraphBlocks(paragraphs: Paragraph[], settings: Settings): Block[] {
  return paragraphs.map((paragraph) => {
    if (paragraph.kind !== "text") {
      return {
        units: 1,
        keepWithNext: true,
        render: () => paragraphHtml(paragraph, settings),
      };
    }
    const words = paragraph.verses.map(wordStarts);
    const breaks: number[] = [];
    let units = 0;
    for (const starts of words) {
      breaks.push(units);
      units += Math.max(1, starts.length);
    }
    return {
      units,
      breaks,
      render: (from = 0, to = units) => {
        const verses: Verse[] = [];
        paragraph.verses.forEach((verse, index) => {
          const start = breaks[index];
          const count = Math.max(1, words[index].length);
          const a = Math.max(from, start) - start;
          const b = Math.min(to, start + count) - start;
          if (a >= b) return;
          verses.push(a === 0 && b === count ? verse : sliceVerse(verse, words[index], a, b));
        });
        return paragraphHtml({ ...paragraph, verses }, settings);
      },
    };
  });
}

/** Character offsets where each word of a verse begins. */
function wordStarts(verse: Verse): number[] {
  const text = verse.segments.map((segment) => segment.text).join("");
  const starts: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (/\S/.test(text[i]) && (i === 0 || /\s/.test(text[i - 1]))) starts.push(i);
  }
  return starts;
}

/**
 * Words [from, to) of a verse, keeping each segment's styling. Only the piece
 * holding the first word keeps the verse number, so a verse broken across
 * columns is numbered once.
 */
function sliceVerse(verse: Verse, starts: number[], from: number, to: number): Verse {
  const begin = starts[from] ?? 0;
  const end = starts[to] ?? Infinity;
  const segments: Segment[] = [];
  let offset = 0;
  for (const segment of verse.segments) {
    const a = Math.max(begin, offset) - offset;
    const b = Math.min(end, offset + segment.text.length) - offset;
    if (a < b) segments.push({ ...segment, text: segment.text.slice(a, b) });
    offset += segment.text.length;
  }
  const last = segments[segments.length - 1];
  if (last) last.text = last.text.trimEnd();
  return { number: from === 0 ? verse.number : null, segments };
}

/** One block per aligned row; rows are indivisible so the columns stay level. */
export function parallelBlocks(rows: AlignedRow[], settings: Settings): Block[] {
  const base = typeCss(settings);

  return rows.flatMap((row): Block[] => {
    if (row.kind === "heading" || row.kind === "chapter") {
      const html =
        row.kind === "heading"
          ? headingHtml(row.heading ?? "", settings)
          : chapterHtml(row.heading ?? "", settings);
      if (!html) return [];
      return [{ units: 1, keepWithNext: true, render: () => html }];
    }

    const align = settings.justify ? "text-align:justify;hyphens:auto" : "text-align:left";
    const primary = row.primary ? verseHtml(row.primary, settings) : "";
    const secondary = row.secondary ? verseHtml(row.secondary, settings) : "";

    if (settings.parallelMode === "stacked") {
      // Each verse, then the same verse in the other translation directly
      // below it — the diglot arrangement, which suits narrow columns and
      // dense scripts better than two columns do.
      const html =
        `<div style="margin:0 0 .5em">` +
        `<div style="${base}${align}">${primary}</div>` +
        `<div style="${base}${align}opacity:.78;padding:.2em 0 0 ${DIVIDER_INSET}px">${secondary || "&nbsp;"}</div>` +
        `</div>`;
      return [{ units: 1, render: () => html }];
    }

    const html =
      `<div style="display:grid;grid-template-columns:1fr 1fr">` +
      `<div style="${base}${align};padding:0 ${DIVIDER_INSET}px .45em 0;border-right:1px solid ${HAIRLINE}">${primary || "&nbsp;"}</div>` +
      `<div style="${base}${align};padding:0 0 .45em ${DIVIDER_INSET}px">${secondary || "&nbsp;"}</div>` +
      `</div>`;

    return [{ units: 1, render: () => html }];
  });
}
