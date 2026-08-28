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

/** Which licence the cap comes from — used to pick the learn-more copy. */
export type LicenceSource = "api_bible" | "esv" | "unknown";

export interface LimitExplanation {
  /** Short version name, e.g. "NIV". */
  version: string;
  /** Human source, e.g. "api.bible" or "Crossway". Empty when unknown. */
  source: string;
  /** Terms or attribution URL, matching the footer’s bare-domain style. */
  href: string;
  hrefLabel: string;
  /** Concise statement of this translation’s actual rule. */
  rule: string;
}

const API_BIBLE_TERMS = "https://api.bible/terms-and-conditions#acceptable_use";
const ESV_SITE = "https://www.esv.org";

export function versionLabel(bible: BibleSummary | undefined, fallback = ""): string {
  if (!bible) return fallback;
  return bible.label.split(" — ")[0]?.trim() || bible.id;
}

/**
 * Classify from the cap shape (and the ESV id), not a hardcoded list of
 * abbreviations — newly curated NIV-like api.bible entries keep working.
 */
export function licenceSource(bible: BibleSummary | undefined): LicenceSource {
  if (!bible?.limits) return "unknown";
  const { max_verses, max_book_fraction, note } = bible.limits;
  if (bible.id === "esv" || (max_verses === 500 && max_book_fraction != null)) return "esv";
  if (max_verses === 100) return "api_bible";
  const lower = note.toLowerCase();
  if (lower.includes("crossway")) return "esv";
  if (lower.includes("api.bible")) return "api_bible";
  return "unknown";
}

export function explanationFor(bible: BibleSummary, cap: number): LimitExplanation {
  const version = versionLabel(bible, bible.id);
  const kind = licenceSource(bible);

  if (kind === "esv") {
    return {
      version,
      source: "Crossway",
      href: ESV_SITE,
      hrefLabel: "esv.org",
      rule:
        `${version} is served by Crossway. Their API terms allow at most ` +
        `500 verses, or half the current book — whichever is smaller. ` +
        `For this book that is ${cap} verses. Single-chapter books may be shown in full.`,
    };
  }

  if (kind === "api_bible") {
    return {
      version,
      source: "api.bible",
      href: API_BIBLE_TERMS,
      hrefLabel: "api.bible",
      rule:
        `${version} is a copyright-reserved translation from api.bible. ` +
        `Their terms restrict printing licensed text to 100 verses at a time.`,
    };
  }

  return {
    version,
    source: "",
    href: "",
    hrefLabel: "",
    rule: bible.limits?.note || `${version} allows at most ${cap} verses at once.`,
  };
}

/**
 * Copy for every selected translation whose cap the current range exceeds.
 * Uncapped translations are omitted — never invent a limit.
 */
export function limitExplanations(
  bibles: BibleSummary[],
  ids: string[],
  book: Book | undefined,
  reference: Reference,
): LimitExplanation[] {
  if (!book) return [];
  const requested = versesInRange(book, reference);
  const out: LimitExplanation[] = [];

  for (const id of ids) {
    if (!id) continue;
    const bible = bibles.find((entry) => entry.id === id);
    const cap = allowance(bible, book);
    if (!bible || cap == null || requested <= cap) continue;
    out.push(explanationFor(bible, cap));
  }

  return out;
}
