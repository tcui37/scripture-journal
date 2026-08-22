import type { Reference } from "./types";

/**
 * Print / Save as PDF uses document.title as the default filename.
 * Spaces become underscores; letters (including CJK), numbers, `_`, `:`, and `-` stay.
 */
export function printFilename(
  book: string,
  ref: Pick<Reference, "startChapter" | "startVerse" | "endChapter" | "endVerse">,
) {
  const safeBook = book.replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_:-]/gu, "");
  return `${safeBook}_Ch${ref.startChapter}:${ref.startVerse}-Ch${ref.endChapter}:${ref.endVerse}`;
}
