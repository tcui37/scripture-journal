"use client";

import {
  keepPreviousData,
  useQueries,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { mergeBibles } from "@/lib/bibles";
import { checkLimits, type LimitCheck } from "@/lib/limits";
import {
  biblesQuery,
  booksQuery,
  languagesQuery,
  passagePairQuery,
  versesQuery,
} from "@/lib/queries";
import { useJournalStore } from "@/lib/store";
import type {
  BibleSummary,
  Book,
  LanguageSummary,
  Passage,
  Reference,
} from "@/lib/types";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "failed";

export interface Scripture {
  languages: LanguageSummary[];
  selectedLanguages: string[];
  addLanguage: (code: string) => void;
  removeLanguage: (code: string) => void;
  bibles: BibleSummary[];
  books: Book[];
  book: Book | undefined;
  startVerses: string[];
  endVerses: string[];
  reference: Reference;
  setReference: (patch: Partial<Reference>) => void;
  wholeChapter: () => void;
  entireBook: () => void;
  passage: Passage | null;
  comparePassage: Passage | null;
  /** The selection against every chosen translation's licence cap. */
  limitCheck: LimitCheck;
  status: string;
  failed: boolean;
}

const NO_VERSES: string[] = [];

/** Every selected language's translations as one list. TanStack shares the
 * result structurally, so it keeps its identity while the data is unchanged. */
function combineBibles(results: UseQueryResult<BibleSummary[]>[]) {
  return {
    bibles: mergeBibles(results.flatMap((result) => (result.data ? [result.data] : []))),
    error: results.find((result) => result.error)?.error ?? null,
  };
}

/**
 * Owns everything to do with *which* scripture is on screen: the catalogue,
 * the current reference, and the fetched passages. Rendering settings live in
 * the component; this hook knows nothing about page layout.
 *
 * Fetching, caching, de-duplication and cancellation are TanStack Query's
 * (see lib/queries.ts); what is left here is keeping the reference valid as
 * the structure it points into arrives.
 */
export function useScripture(ready: boolean): Scripture {
  // The selection lives in the journal store, so it is saved with the rest.
  const reference = useJournalStore((state) => state.reference);
  const selectedLanguages = useJournalStore((state) => state.languages);
  const setReferenceState = useJournalStore((state) => state.updateReference);
  const updateLanguages = useJournalStore((state) => state.updateLanguages);

  // Set when a change should pull the end verse to the end of its chapter,
  // which we can only do once that chapter's verse list has arrived.
  const snapEndToLast = useRef(false);

  /* ── catalogue ───────────────────────────────────────────────────────── */

  const languagesResult = useQuery({ ...languagesQuery(), enabled: ready });

  const { bibles, error: biblesError } = useQueries({
    queries: selectedLanguages.map((code) => ({ ...biblesQuery(code), enabled: ready })),
    combine: combineBibles,
  });

  /* ── structure ───────────────────────────────────────────────────────── */

  const booksResult = useQuery({
    ...booksQuery(reference.bibleId),
    enabled: ready && Boolean(reference.bibleId),
  });
  const bookList = booksResult.data;
  const book = bookList?.find((entry) => entry.id === reference.bookId);

  // Keep the book and chapters valid for whichever translation's books arrived.
  useEffect(() => {
    if (!bookList) return;
    const bibleId = reference.bibleId;
    setReferenceState((prev) => {
      if (prev.bibleId !== bibleId) return prev;
      const found = bookList.find((entry) => entry.id === prev.bookId) ?? bookList[0];
      if (!found) return prev;

      const numbers = found.chapters.map((chapter) => chapter.number);
      const fallback = numbers[0] ?? prev.startChapter;
      const startChapter = numbers.includes(prev.startChapter) ? prev.startChapter : fallback;
      let endChapter = numbers.includes(prev.endChapter) ? prev.endChapter : fallback;
      if (Number(endChapter) < Number(startChapter)) endChapter = startChapter;

      if (
        found.id === prev.bookId &&
        startChapter === prev.startChapter &&
        endChapter === prev.endChapter
      ) {
        return prev;
      }
      return { ...prev, bookId: found.id, startChapter, endChapter };
    });
    // reference.bibleId is read only to confirm these books still apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookList, setReferenceState]);

  // Verse numbers for whichever chapters the range currently touches.
  const versesEnabled = ready && Boolean(book);
  const startVersesResult = useQuery({
    ...versesQuery(reference.bibleId, reference.bookId, reference.startChapter),
    enabled: versesEnabled,
  });
  const endVersesResult = useQuery({
    ...versesQuery(reference.bibleId, reference.bookId, reference.endChapter),
    enabled: versesEnabled,
  });
  const startVerses = (versesEnabled && startVersesResult.data) || NO_VERSES;
  const endVerses = (versesEnabled && endVersesResult.data) || NO_VERSES;

  // Keep the verse selections valid for the chapters they belong to.
  useEffect(() => {
    if (!startVerses.length || !endVerses.length) return;

    // Consumed out here: state updaters must be pure, and React double-invokes
    // them in StrictMode.
    const snap = snapEndToLast.current;
    snapEndToLast.current = false;

    setReferenceState((prev) => {
      let { startVerse, endVerse } = prev;
      const lastVerse = endVerses[endVerses.length - 1];

      if (snap) endVerse = lastVerse;
      if (!startVerses.includes(startVerse)) startVerse = startVerses[0];
      if (!endVerses.includes(endVerse)) endVerse = lastVerse;
      if (prev.startChapter === prev.endChapter && Number(endVerse) < Number(startVerse)) {
        endVerse = lastVerse;
      }

      if (startVerse === prev.startVerse && endVerse === prev.endVerse) return prev;
      return { ...prev, startVerse, endVerse };
    });
  }, [startVerses, endVerses, setReferenceState]);

  /* ── text ────────────────────────────────────────────────────────────── */

  // Wait until both chapters' verse lists match the current selection, so we
  // never request a range built from a previous chapter's numbering.
  const rangeReady =
    startVerses.includes(reference.startVerse) && endVerses.includes(reference.endVerse);
  // Over a licence cap the server would only refuse, so do not ask; the
  // sidebar explains the cap where the range is chosen.
  const limitCheck = checkLimits(
    bibles,
    [reference.bibleId, reference.compareId].filter(Boolean),
    book,
    reference,
  );
  const passageResult = useQuery({
    ...passagePairQuery(reference),
    enabled: ready && rangeReady && limitCheck.ok,
    // Keep the last passage on screen while the next one loads.
    placeholderData: keepPreviousData,
  });

  /* ── status ──────────────────────────────────────────────────────────── */

  const failure =
    (languagesResult.error && `Languages failed — ${message(languagesResult.error)}`) ||
    (biblesError && `Versions failed — ${message(biblesError)}`) ||
    (booksResult.error && `Books failed — ${message(booksResult.error)}`) ||
    ((startVersesResult.error || endVersesResult.error) &&
      `Chapter failed — ${message(startVersesResult.error ?? endVersesResult.error)}`) ||
    (passageResult.error && `Passage failed — ${message(passageResult.error)}`) ||
    "";

  const span = Number(reference.endChapter) - Number(reference.startChapter) + 1;
  const loading = !ready
    ? ""
    : booksResult.isFetching
      ? "Loading books…"
      : startVersesResult.isFetching || endVersesResult.isFetching
        ? "Loading chapter…"
        : passageResult.isFetching
          ? span > 1
            ? `Fetching ${span} chapters…`
            : "Fetching text…"
          : "";

  // Short and fixed, so the top bar never reflows; the full reason is in the
  // sidebar under the range.
  const overLimit = limitCheck.ok
    ? ""
    : `${limitCheck.label} allows ${limitCheck.cap} verses here · ${limitCheck.requested} selected`;

  const failed = Boolean(failure || overLimit);
  // Drop the preview on any failure so a stale passage can't be printed.
  const pair = failed ? undefined : passageResult.data;

  /* ── handlers ────────────────────────────────────────────────────────── */

  const setReference = useCallback(
    (patch: Partial<Reference>) => {
      const next = { ...reference, ...patch };
      let snap = false;

      // A full book + range (opening a saved file) is applied as-is. The
      // dropdowns still send one field at a time and keep the snap-to-end
      // behaviour below.
      const completeSelection =
        patch.bookId !== undefined &&
        patch.startChapter !== undefined &&
        patch.startVerse !== undefined &&
        patch.endChapter !== undefined &&
        patch.endVerse !== undefined;
      if (completeSelection) {
        snapEndToLast.current = false;
        setReferenceState(() => next);
        return;
      }

      if (patch.bookId !== undefined) {
        // A new book may number things differently.
        next.startChapter = "1";
        next.startVerse = "1";
        next.endChapter = "1";
        snap = true;
      }

      if (patch.startChapter !== undefined) {
        next.startVerse = "1";
        if (Number(next.endChapter) < Number(next.startChapter)) {
          next.endChapter = next.startChapter;
          snap = true;
        }
      }

      if (patch.endChapter !== undefined) {
        snap = true;
        if (Number(next.startChapter) > Number(next.endChapter)) {
          next.startChapter = next.endChapter;
          next.startVerse = "1";
        }
      }

      if (next.startChapter === next.endChapter) {
        if (patch.startVerse && Number(next.endVerse) < Number(next.startVerse)) {
          next.endVerse = next.startVerse;
        }
        if (patch.endVerse && Number(next.startVerse) > Number(next.endVerse)) {
          next.startVerse = next.endVerse;
        }
      }

      if (snap) snapEndToLast.current = true;
      setReferenceState(() => next);
    },
    [reference, setReferenceState],
  );

  const wholeChapter = useCallback(() => {
    snapEndToLast.current = true;
    setReferenceState((prev) => ({ ...prev, startVerse: "1", endChapter: prev.startChapter }));
  }, [setReferenceState]);

  const entireBook = useCallback(() => {
    const last = book?.chapters[book.chapters.length - 1]?.number;
    if (!last) return;
    snapEndToLast.current = true;
    setReferenceState((prev) => ({
      ...prev,
      startChapter: "1",
      startVerse: "1",
      endChapter: last,
    }));
  }, [book, setReferenceState]);

  const addLanguage = useCallback(
    (code: string) => updateLanguages((prev) => [...prev, code]),
    [updateLanguages],
  );

  const removeLanguage = useCallback(
    (code: string) => updateLanguages((prev) => prev.filter((entry) => entry !== code)),
    [updateLanguages],
  );

  useEffect(() => {
    if (!bibles.length) return;
    setReferenceState((prev) => {
      let { bibleId, compareId } = prev;
      if (!bibles.some((entry) => entry.id === bibleId)) {
        bibleId = bibles[0].id;
      }
      if (compareId && (compareId === bibleId || !bibles.some((entry) => entry.id === compareId))) {
        compareId = "";
      }
      if (bibleId === prev.bibleId && compareId === prev.compareId) return prev;
      return { ...prev, bibleId, compareId };
    });
  }, [bibles, setReferenceState]);

  return {
    languages: languagesResult.data ?? [],
    selectedLanguages,
    addLanguage,
    removeLanguage,
    bibles,
    books: bookList ?? [],
    book,
    startVerses,
    endVerses,
    reference,
    setReference,
    wholeChapter,
    entireBook,
    passage: pair?.primary ?? null,
    comparePassage: pair?.compare ?? null,
    limitCheck,
    status: failure || overLimit || loading,
    failed,
  };
}
