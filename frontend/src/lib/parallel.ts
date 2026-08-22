/**
 * Aligns two translations verse by verse for the parallel layout.
 *
 * Paragraph flow can't survive being shown side by side — two translations
 * break their paragraphs in different places — so a parallel passage is a
 * sequence of verse-aligned rows instead, the way a printed parallel Bible
 * works. Headings and chapter markers come from the primary translation and
 * span both columns.
 */

import type { Paragraph, Verse } from "./types";

export interface AlignedRow {
  kind: "heading" | "chapter" | "verse";
  /** Heading text, for heading and chapter rows. */
  heading?: string;
  number?: string;
  primary?: Verse;
  secondary?: Verse;
}

/** Collapse a passage to one entry per verse number, keeping document order. */
function versesByNumber(paragraphs: Paragraph[]): Map<string, Verse> {
  const out = new Map<string, Verse>();
  let current: string | null = null;

  for (const paragraph of paragraphs) {
    if (paragraph.kind !== "text") continue;
    for (const verse of paragraph.verses) {
      if (verse.number) {
        current = verse.number;
        const existing = out.get(current);
        if (existing) existing.segments.push(...verse.segments);
        else out.set(current, { number: current, segments: [...verse.segments] });
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
  const secondaryVerses = versesByNumber(secondary);
  const rows: AlignedRow[] = [];
  const seen = new Set<string>();
  let currentNumber: string | null = null;

  for (const paragraph of primary) {
    if (paragraph.kind === "heading") {
      rows.push({ kind: "heading", heading: paragraph.heading });
      continue;
    }
    if (paragraph.kind === "chapter") {
      rows.push({ kind: "chapter", heading: paragraph.heading });
      continue;
    }

    for (const verse of paragraph.verses) {
      if (verse.number) {
        currentNumber = verse.number;
        if (seen.has(currentNumber)) {
          // Same verse continuing after a paragraph break.
          const row = rows.find(
            (entry) => entry.kind === "verse" && entry.number === currentNumber,
          );
          row?.primary?.segments.push(...verse.segments);
          continue;
        }
        seen.add(currentNumber);
        rows.push({
          kind: "verse",
          number: currentNumber,
          primary: { number: currentNumber, segments: [...verse.segments] },
          secondary: secondaryVerses.get(currentNumber),
        });
      } else if (currentNumber) {
        const row = rows.find(
          (entry) => entry.kind === "verse" && entry.number === currentNumber,
        );
        row?.primary?.segments.push(...verse.segments);
      }
    }
  }

  // Verses the second translation has but the first does not.
  for (const [number, verse] of secondaryVerses) {
    if (seen.has(number)) continue;
    rows.push({ kind: "verse", number, secondary: verse });
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
