/**
 * The text the licences require around a passage, and how a range is named.
 *
 * api.bible and Crossway both ask for the translation abbreviation beside the
 * text and a link back on every page, and the publisher's full notice once.
 */

import { citationIds } from "./parallel";
import type { BibleSummary, Passage, Reference } from "./types";

/** Trimmed, de-duplicated, empties dropped — for assembling licence notices. */
const unique = (parts: (string | undefined)[]) =>
  Array.from(new Set(parts.map((part) => part?.trim()).filter(Boolean) as string[]));

/** Abbreviation for a translation id, from the "NIV — …" label form. */
export function abbreviation(bibles: BibleSummary[], id: string): string {
  if (!id) return "";
  const bible = bibles.find((entry) => entry.id === id);
  return bible ? bible.label.split(" — ")[0].trim() : id;
}

export interface LicenceText {
  /** In-context citation printed with the passage, e.g. "NIV · CUV". */
  citation: string;
  /** Bare source domains, required on every sheet, e.g. "esv.org". */
  sources: string;
  /** Full publisher notices, printed once on the last sheet. */
  copyright: string;
  /** Everything a licence requires shown somewhere, for the sidebar. */
  notice: string;
}

export function licenceText(
  bibles: BibleSummary[],
  reference: Reference,
  swapped: boolean,
  passage: Passage | null,
  comparePassage: Passage | null,
): LicenceText {
  return {
    citation: citationIds(reference.bibleId, reference.compareId, swapped)
      .map((id) => abbreviation(bibles, id))
      .filter(Boolean)
      .join(" · "),
    sources: unique([passage?.attribution, comparePassage?.attribution])
      .map((url) => url.replace(/^https?:\/\//, "").replace(/\/$/, ""))
      .join("   ·   "),
    // Deduped so two translations from one upstream do not repeat it.
    copyright: unique([passage?.copyright, comparePassage?.copyright]).join("   "),
    notice: unique([
      passage?.copyright,
      comparePassage?.copyright,
      passage?.attribution,
      comparePassage?.attribution,
    ]).join("  ·  "),
  };
}

/** "John 3:16–17", "John 1:1–2:5"; "—" until the book is known. */
export function referenceLabel(bookName: string | undefined, reference: Reference): string {
  if (!bookName) return "—";
  const { startChapter, startVerse, endChapter, endVerse } = reference;
  if (startChapter === endChapter) {
    const range = endVerse !== startVerse ? `–${endVerse}` : "";
    return `${bookName} ${startChapter}:${startVerse}${range}`;
  }
  return `${bookName} ${startChapter}:${startVerse}–${endChapter}:${endVerse}`;
}
