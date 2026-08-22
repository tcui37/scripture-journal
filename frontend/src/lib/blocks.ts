/**
 * Pageable units.
 *
 * Pagination doesn't care whether a page holds flowing paragraphs or
 * verse-aligned parallel rows — it only needs blocks it can measure and, where
 * possible, split. Both passage shapes are expressed as `Block`s here.
 */

import { HAIRLINE } from "./constants";
import { chapterHtml, headingHtml, paragraphHtml, typeCss, verseHtml } from "./render";
import type { AlignedRow } from "./parallel";
import type { Paragraph, Settings } from "./types";

export interface Block {
  /** Splittable sub-units (verses). 1 means indivisible. */
  units: number;
  /** Render units [from, to); omitting `to` renders to the end. */
  render: (from?: number, to?: number) => string;
  /** Avoid leaving this block stranded at the foot of a column. */
  keepWithNext?: boolean;
}

/** Space from translation text to the parallel rule, each side. */
const DIVIDER_INSET = 20;
/** Total gutter reserved between the two translations (both insets). */
export const PARALLEL_GAP = DIVIDER_INSET * 2;

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
    return {
      units: paragraph.verses.length,
      render: (from = 0, to?: number) =>
        paragraphHtml({ ...paragraph, verses: paragraph.verses.slice(from, to) }, settings),
    };
  });
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
