/**
 * Mirrors the licence caps enforced in backend/app/usage_limits.py.
 *
 * Duplicated deliberately: the server is the authority, but the UI needs to
 * know before it asks, so it can warn and disable the download rather than
 * only reporting a rejected request.
 */

import type { BibleSummary, Book, Reference } from "./types";

export interface LimitCheck {
  /** True when the selection may be shown. */
  ok: boolean;
  requested: number;
  /** Largest allowed selection, or null when unrestricted. */
  cap: number | null;
  message: string;
}

const OK: LimitCheck = { ok: true, requested: 0, cap: null, message: "" };

export function versesInRange(book: Book | undefined, reference: Reference): number {
  if (!book) return 0;
  const first = Number(reference.startChapter);
  const last = Number(reference.endChapter);
  let total = 0;

  for (const chapter of book.chapters) {
    const number = Number(chapter.number);
    if (!Number.isFinite(number) || number < first || number > last) continue;
    const from = number === first ? Number(reference.startVerse) : 1;
    const to = number === last ? Number(reference.endVerse) : chapter.verse_count;
    total += Math.max(0, Math.min(to, chapter.verse_count) - from + 1);
  }

  return total;
}

/** Largest number of verses of `book` this translation's licence allows. */
export function allowance(bible: BibleSummary | undefined, book: Book | undefined): number | null {
  const limits = bible?.limits;
  if (!limits || !book) return null;
  if (limits.exempt_single_chapter_books && book.chapters.length === 1) return null;

  const caps: number[] = [];
  if (limits.max_verses != null) caps.push(limits.max_verses);
  if (limits.max_book_fraction != null) {
    const total = book.chapters.reduce((sum, chapter) => sum + chapter.verse_count, 0);
    // A total of zero means the verse counts are unknown for this book, not
    // that it is empty — deriving a cap from it would produce 0 and grey out
    // the download for every selection.
    if (total > 0) caps.push(Math.floor(total * limits.max_book_fraction));
  }
  return caps.length ? Math.min(...caps) : null;
}

export function checkLimits(
  bibles: BibleSummary[],
  ids: string[],
  book: Book | undefined,
  reference: Reference,
): LimitCheck {
  if (!book) return OK;
  const requested = versesInRange(book, reference);

  for (const id of ids) {
    const bible = bibles.find((entry) => entry.id === id);
    const cap = allowance(bible, book);
    if (cap != null && requested > cap) {
      const label = bible?.label.split(" — ")[0] ?? id;
      return {
        ok: false,
        requested,
        cap,
        message:
          `${label} allows at most ${cap} verses at once — ${requested} selected. ` +
          (bible?.limits?.note ?? ""),
      };
    }
  }

  return { ...OK, requested };
}
