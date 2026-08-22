"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchBibles,
  fetchBooks,
  fetchLanguages,
  fetchPassage,
  fetchVerseNumbers,
} from "@/lib/api";
import type {
  BibleSummary,
  Book,
  LanguageSummary,
  Passage,
  Reference,
} from "@/lib/types";

const verseKey = (reference: Reference, chapter: string) =>
  `${reference.bibleId}/${reference.bookId}/${chapter}`;

const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "failed";

export interface Scripture {
  languages: LanguageSummary[];
  language: string;
  setLanguage: (code: string) => void;
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
  status: string;
  failed: boolean;
}

/**
 * Owns everything to do with *which* scripture is on screen: the catalogue,
 * the current reference, and the fetched passages. Rendering settings live in
 * the component; this hook knows nothing about page layout.
 */
export function useScripture(
  initial: Reference,
  initialLanguage: string,
  ready: boolean,
): Scripture {
  const [languages, setLanguages] = useState<LanguageSummary[]>([]);
  const [language, setLanguage] = useState(initialLanguage);
  const [bibles, setBibles] = useState<BibleSummary[]>([]);
  const [books, setBooks] = useState<{ bibleId: string; list: Book[] }>({
    bibleId: "",
    list: [],
  });
  const [verseCache, setVerseCache] = useState<Record<string, string[]>>({});
  const [passage, setPassage] = useState<Passage | null>(null);
  const [comparePassage, setComparePassage] = useState<Passage | null>(null);
  const [reference, setReferenceState] = useState<Reference>(initial);
  const [status, setStatus] = useState("Loading…");
  const [failed, setFailed] = useState(false);

  // Set when a change should pull the end verse to the end of its chapter,
  // which we can only do once that chapter's verse list has arrived.
  const snapEndToLast = useRef(false);

  const startKey = verseKey(reference, reference.startChapter);
  const endKey = verseKey(reference, reference.endChapter);
  const startVerses = useMemo(() => verseCache[startKey] ?? [], [verseCache, startKey]);
  const endVerses = useMemo(() => verseCache[endKey] ?? [], [verseCache, endKey]);

  const fail = useCallback(
    (prefix: string) => (error: unknown) => {
      if (isAbort(error)) return;
      setFailed(true);
      setStatus(`${prefix} — ${message(error)}`);
      // Drop the preview so a stale passage can't be printed.
      setPassage(null);
      setComparePassage(null);
    },
    [],
  );

  const begin = useCallback((text: string) => {
    setFailed(false);
    setStatus(text);
  }, []);

  /* ── catalogue ───────────────────────────────────────────────────────── */

  useEffect(() => {
    const controller = new AbortController();
    fetchLanguages(controller.signal).then(setLanguages).catch(fail("Languages failed"));
    return () => controller.abort();
  }, [fail]);

  useEffect(() => {
    const controller = new AbortController();
    fetchBibles(language, controller.signal).then(setBibles).catch(fail("Versions failed"));
    return () => controller.abort();
  }, [language, fail]);

  /* ── structure ───────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const { bibleId } = reference;

    begin("Loading books…");
    fetchBooks(bibleId, controller.signal)
      .then((list) => {
        setBooks({ bibleId, list });
        setReferenceState((prev) => {
          if (prev.bibleId !== bibleId) return prev;
          const book = list.find((entry) => entry.id === prev.bookId) ?? list[0];
          if (!book) return prev;

          const numbers = book.chapters.map((chapter) => chapter.number);
          const fallback = numbers[0] ?? prev.startChapter;
          const startChapter = numbers.includes(prev.startChapter) ? prev.startChapter : fallback;
          let endChapter = numbers.includes(prev.endChapter) ? prev.endChapter : fallback;
          if (Number(endChapter) < Number(startChapter)) endChapter = startChapter;

          if (
            book.id === prev.bookId &&
            startChapter === prev.startChapter &&
            endChapter === prev.endChapter
          ) {
            return prev;
          }
          return { ...prev, bookId: book.id, startChapter, endChapter };
        });
      })
      .catch(fail("Books failed"));

    return () => controller.abort();
  }, [ready, reference.bibleId, begin, fail]);

  // Verse numbers for whichever chapters the range currently touches.
  useEffect(() => {
    if (!ready) return;
    if (books.bibleId !== reference.bibleId) return;
    if (!books.list.some((book) => book.id === reference.bookId)) return;

    const wanted = [
      [startKey, reference.startChapter] as const,
      [endKey, reference.endChapter] as const,
    ].filter(
      ([key], index, all) =>
        !(key in verseCache) && all.findIndex(([other]) => other === key) === index,
    );
    if (!wanted.length) return;

    const controller = new AbortController();
    begin("Loading chapter…");

    Promise.all(
      wanted.map(([key, chapter]) =>
        fetchVerseNumbers(reference.bibleId, reference.bookId, chapter, controller.signal).then(
          (list) => [key, list] as const,
        ),
      ),
    )
      .then((entries) => setVerseCache((prev) => ({ ...prev, ...Object.fromEntries(entries) })))
      .catch(fail("Chapter failed"));

    return () => controller.abort();
  }, [
    ready,
    books,
    verseCache,
    startKey,
    endKey,
    reference.bibleId,
    reference.bookId,
    reference.startChapter,
    reference.endChapter,
    begin,
    fail,
  ]);

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
  }, [startVerses, endVerses]);

  /* ── text ────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!ready) return;
    // Wait until both chapters' verse lists match the current selection, so we
    // never request a range built from a previous chapter's numbering.
    if (!startVerses.includes(reference.startVerse)) return;
    if (!endVerses.includes(reference.endVerse)) return;

    const controller = new AbortController();
    const span = Number(reference.endChapter) - Number(reference.startChapter) + 1;
    begin(span > 1 ? `Fetching ${span} chapters…` : "Fetching text…");

    const primary = fetchPassage(reference.bibleId, reference, controller.signal);
    const compare = reference.compareId
      ? fetchPassage(reference.compareId, reference, controller.signal)
      : Promise.resolve(null);

    Promise.all([primary, compare])
      .then(([first, second]) => {
        setPassage(first);
        setComparePassage(second);
        setStatus("");
      })
      .catch(fail("Passage failed"));

    return () => controller.abort();
  }, [ready, startVerses, endVerses, reference, begin, fail]);

  /* ── handlers ────────────────────────────────────────────────────────── */

  const setReference = useCallback(
    (patch: Partial<Reference>) => {
      const next = { ...reference, ...patch };
      let snap = false;

      if (patch.bibleId !== undefined || patch.bookId !== undefined) {
        // A new translation or book may number things differently.
        if (patch.bookId !== undefined) {
          next.startChapter = "1";
          next.startVerse = "1";
          next.endChapter = "1";
          snap = true;
        }
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
      setReferenceState(next);
    },
    [reference],
  );

  const book = books.list.find((entry) => entry.id === reference.bookId);

  const wholeChapter = useCallback(() => {
    snapEndToLast.current = true;
    setReferenceState((prev) => ({ ...prev, startVerse: "1", endChapter: prev.startChapter }));
  }, []);

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
  }, [book]);

  // Switching language invalidates the current translation choice.
  const changeLanguage = useCallback(
    (code: string) => {
      setLanguage(code);
      setBibles([]);
    },
    [],
  );

  useEffect(() => {
    if (!bibles.length) return;
    if (bibles.some((entry) => entry.id === reference.bibleId)) return;
    setReferenceState((prev) => ({ ...prev, bibleId: bibles[0].id, compareId: "" }));
  }, [bibles, reference.bibleId]);

  return {
    languages,
    language,
    setLanguage: changeLanguage,
    bibles,
    books: books.list,
    book,
    startVerses,
    endVerses,
    reference,
    setReference,
    wholeChapter,
    entireBook,
    passage,
    comparePassage,
    status,
    failed,
  };
}
