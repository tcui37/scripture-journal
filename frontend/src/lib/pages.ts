/**
 * Shared pagination and page-count helpers.
 *
 * Journal preview, print, and the Files library all derive sheet count from
 * the same passage + settings + DOM measurer pipeline.
 */

import {
  combineParallelBands,
  combineParallelColumns,
  paragraphBlocks,
  PARALLEL_GAP,
  parallelBlocks,
} from "./blocks";
import { alignPassages, orderedSides } from "./parallel";
import { Measurer, paginate } from "./paginate";
import { singleTextGeometry } from "./render";
import type { PageSize, Passage, Settings } from "./types";

/** Flow passage text into page slot markup — mirrors the journal preview. */
export function paginatePassages(
  primaryPassage: Passage | null | undefined,
  secondaryPassage: Passage | null | undefined,
  settings: Settings,
  measurer: Measurer,
): string[][] | null {
  if (!primaryPassage) return null;

  const parallel = Boolean(secondaryPassage);
  const facing = parallel && settings.parallelMode === "facing";
  const { primary, secondary } = orderedSides(
    primaryPassage,
    secondaryPassage,
    settings.parallelSwap,
  );

  if (!parallel || !secondary) {
    return paginate(paragraphBlocks(primary.paragraphs, settings), settings, measurer);
  }

  if (facing) {
    const left = paginate(paragraphBlocks(primary.paragraphs, settings), settings, measurer);
    const right = paginate(paragraphBlocks(secondary.paragraphs, settings), settings, measurer);
    const merged: string[][] = [];
    for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
      merged.push(left[i] ?? [""]);
      merged.push(right[i] ?? [""]);
    }
    return merged;
  }

  if (settings.parallelMode === "flow" || settings.parallelMode === "bands") {
    const region = singleTextGeometry(settings).slots[0];
    const flow = settings.parallelMode === "flow";
    const box = flow
      ? {
          width: Math.max(1, Math.floor((region.width - PARALLEL_GAP) / 2)),
          height: region.height,
        }
      : {
          width: region.width,
          height: Math.max(1, Math.floor((region.height - PARALLEL_GAP) / 2)),
        };
    const left = paginate(
      paragraphBlocks(primary.paragraphs, settings),
      settings,
      measurer,
      box,
    );
    const right = paginate(
      paragraphBlocks(secondary.paragraphs, settings),
      settings,
      measurer,
      box,
    );
    const combined: string[][] = [];
    for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
      const first = left[i]?.[0] ?? "";
      const second = right[i]?.[0] ?? "";
      combined.push([
        flow ? combineParallelColumns(first, second) : combineParallelBands(first, second),
      ]);
    }
    return combined;
  }

  const rows = alignPassages(primary.paragraphs, secondary.paragraphs);
  return paginate(parallelBlocks(rows, settings), settings, measurer);
}

/** Sheets sent to the printer — verso layout inserts blank facing pages. */
export function printedPageCount(
  pages: string[][] | null,
  settings: Settings,
  options: { facing?: boolean } = {},
): number {
  if (!pages) return 0;
  const facing = options.facing ?? false;
  const blanks = settings.layout === "verso" && !facing && settings.lines !== "none";
  return blanks ? pages.length * 2 : pages.length;
}

export function countPrintedPages(
  primaryPassage: Passage | null | undefined,
  secondaryPassage: Passage | null | undefined,
  settings: Settings,
  measurer: Measurer,
): number {
  const pages = paginatePassages(primaryPassage, secondaryPassage, settings, measurer);
  const parallel = Boolean(secondaryPassage);
  const facing = parallel && settings.parallelMode === "facing";
  return printedPageCount(pages, settings, { facing });
}

/** Compact count for library metadata, e.g. "2 pages". */
export function formatPageCountMeta(count: number): string {
  return `${count} page${count === 1 ? "" : "s"}`;
}

/** Preview / print label including paper size, e.g. "2 A4 pages". */
export function formatPageCountLabel(count: number, pageSize: PageSize): string {
  return `${count} ${pageSize} page${count === 1 ? "" : "s"}`;
}

/** Library row metadata: passage · pages · date. */
export function formatFileMetaLine(parts: {
  passage: string;
  pageCount?: number | null;
  date: string;
}): string {
  const segments = [parts.passage];
  if (typeof parts.pageCount === "number" && parts.pageCount > 0) {
    segments.push(formatPageCountMeta(parts.pageCount));
  }
  segments.push(parts.date);
  return segments.join(" · ");
}
