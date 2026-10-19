/**
 * Aligns two translations verse by verse for the parallel layout.
 *
 * Paragraph flow can't survive being shown side by side — two translations
 * break their paragraphs in different places — so a parallel passage is a
 * sequence of verse-aligned rows instead, the way a printed parallel Bible
 * works. Headings and chapter markers come from the primary translation and
 * span both columns.
 */

import type { Paragraph, Verse } from "../types";

export interface AlignedRow {
  kind: "heading" | "chapter" | "verse";
  /** Heading text, for heading and chapter rows. */
  heading?: string;
  number?: string;
  primary?: Verse;
  secondary?: Verse;
}

/**
 * Verse numbers restart every chapter, so a multi-chapter passage needs the
 * chapter in the key — otherwise 2:1 is mistaken for a continuation of 1:1.
 * Chapter markers only appear in multi-chapter passages; before the first one
 * the chapter is "".
 */
const verseKey = (chapter: string, number: string) => `${chapter}:${number}`;

/** Collapse a passage to one entry per chapter and verse, keeping document order. */
function versesByKey(paragraphs: Paragraph[]): Map<string, Verse> {
  const out = new Map<string, Verse>();
  let chapter = "";
  let current: string | null = null;

  for (const paragraph of paragraphs) {
    if (paragraph.kind === "chapter") {
      chapter = paragraph.heading;
      current = null;
      continue;
    }
    if (paragraph.kind !== "text") continue;
    for (const verse of paragraph.verses) {
      if (verse.number) {
        current = verseKey(chapter, verse.number);
        const existing = out.get(current);
        if (existing) existing.segments.push(...verse.segments);
        else out.set(current, { number: verse.number, segments: [...verse.segments] });
      } else if (current) {
        // Continuation of the previous verse across a paragraph break.
        out.get(current)?.segments.push(...verse.segments);
      }
    }
  }

  return out;
}

export function alignPassages(
  primary: Paragraph[],
  secondary: Paragraph[],
): AlignedRow[] {
  const secondaryVerses = versesByKey(secondary);
  const rows: AlignedRow[] = [];
  const rowsByKey = new Map<string, AlignedRow>();
  let chapter = "";
  let current: AlignedRow | null = null;

  for (const paragraph of primary) {
    if (paragraph.kind === "heading") {
      rows.push({ kind: "heading", heading: paragraph.heading });
      continue;
    }
    if (paragraph.kind === "chapter") {
      chapter = paragraph.heading;
      current = null;
      rows.push({ kind: "chapter", heading: paragraph.heading });
      continue;
    }

    for (const verse of paragraph.verses) {
      if (verse.number) {
        const key = verseKey(chapter, verse.number);
        const existing = rowsByKey.get(key);
        if (existing) {
          // Same verse continuing after a paragraph break.
          current = existing;
          existing.primary?.segments.push(...verse.segments);
          continue;
        }
        current = {
          kind: "verse",
          number: verse.number,
          primary: { number: verse.number, segments: [...verse.segments] },
          secondary: secondaryVerses.get(key),
        };
        rowsByKey.set(key, current);
        rows.push(current);
      } else if (current) {
        current.primary?.segments.push(...verse.segments);
      }
    }
  }

  // Verses the second translation has but the first does not.
  for (const [key, verse] of secondaryVerses) {
    if (rowsByKey.has(key)) continue;
    rows.push({ kind: "verse", number: verse.number ?? undefined, secondary: verse });
  }

  return rows;
}

/** Which passage sits in which slot — swap is local, so a flip does not refetch. */
export function orderedSides<T>(
  primary: T,
  compare: T | null | undefined,
  swapped: boolean,
): { primary: T; secondary: T | null } {
  if (swapped && compare) return { primary: compare, secondary: primary };
  return { primary, secondary: compare ?? null };
}

/** Translation ids in display order for the in-context citation line. */
export function citationIds(bibleId: string, compareId: string, swapped: boolean): string[] {
  return (swapped ? [compareId, bibleId] : [bibleId, compareId]).filter(Boolean);
}
