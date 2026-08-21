"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchBibles, fetchBooks, fetchPassage, fetchVerseNumbers } from "@/lib/api";
import { DEFAULT_REFERENCE, DEFAULT_SETTINGS, STORAGE_KEY, ZOOM_OPTIONS } from "@/lib/constants";
import { Measurer, paginate } from "@/lib/paginate";
import { pageDimensions } from "@/lib/render";
import type { BibleSummary, Book, Passage, Reference, Settings } from "@/lib/types";

import PageStack from "./PageStack";
import Sidebar from "./Sidebar";

type ZoomId = (typeof ZOOM_OPTIONS)[number]["id"];

const verseKey = (reference: Reference, chapter: string) =>
  `${reference.bibleId}/${reference.bookId}/${chapter}`;

export default function JournalApp() {
  // Settings live in localStorage, which is only readable after mount — gate
  // the data fetches on it so we don't load the defaults then immediately
  // reload the restored reference.
  const [hydrated, setHydrated] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [reference, setReference] = useState<Reference>(DEFAULT_REFERENCE);

  const [bibles, setBibles] = useState<BibleSummary[]>([]);
  const [books, setBooks] = useState<{ bibleId: string; list: Book[] }>({
    bibleId: "",
    list: [],
  });
  // Verse numbers per chapter; the start and end chapters may differ.
  const [verseCache, setVerseCache] = useState<Record<string, string[]>>({});
  const [passage, setPassage] = useState<Passage | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [failed, setFailed] = useState(false);

  // Set when a change should pull the end verse to the end of its chapter,
  // which we can only do once that chapter's verse list has arrived.
  const snapEndToLast = useRef(false);

  const startKey = verseKey(reference, reference.startChapter);
  const endKey = verseKey(reference, reference.endChapter);
  const startVerses = useMemo(() => verseCache[startKey] ?? [], [verseCache, startKey]);
  const endVerses = useMemo(() => verseCache[endKey] ?? [], [verseCache, endKey]);

  const reportError = useCallback(
    (prefix: string) => (error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFailed(true);
      setStatus(`${prefix} — ${error instanceof Error ? error.message : "failed"}`);
    },
    [],
  );

  const beginLoad = useCallback((message: string) => {
    setFailed(false);
    setStatus(message);
  }, []);

  /* ── persistence ─────────────────────────────────────────────────────── */

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          settings?: Partial<Settings>;
          reference?: Partial<Reference>;
        };
        if (parsed.settings) setSettings((prev) => ({ ...prev, ...parsed.settings }));
        if (parsed.reference) setReference((prev) => ({ ...prev, ...parsed.reference }));
      }
    } catch {
      // Unreadable storage just means we start from the defaults.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, reference }));
    } catch {
      // Storage may be full or blocked; the app still works without it.
    }
  }, [hydrated, settings, reference]);

  /* ── data ────────────────────────────────────────────────────────────── */

  useEffect(() => {
    const controller = new AbortController();
    fetchBibles(controller.signal).then(setBibles).catch(reportError("Versions failed"));
    return () => controller.abort();
  }, [reportError]);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    const { bibleId } = reference;

    beginLoad("Loading books…");
    fetchBooks(bibleId, controller.signal)
      .then((list) => {
        setBooks({ bibleId, list });
        setReference((prev) => {
          if (prev.bibleId !== bibleId) return prev;
          const book = list.find((entry) => entry.id === prev.bookId) ?? list[0];
          if (!book) return prev;

          const numbers = book.chapters.map((chapter) => chapter.number);
          const fallback = numbers[0] ?? prev.startChapter;
          const startChapter = numbers.includes(prev.startChapter)
            ? prev.startChapter
            : fallback;
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
      .catch(reportError("Books failed"));

    return () => controller.abort();
  }, [hydrated, reference.bibleId, beginLoad, reportError]);

  // Fetch verse numbers for whichever chapters the range currently touches.
  useEffect(() => {
    if (!hydrated) return;
    if (books.bibleId !== reference.bibleId) return;
    if (!books.list.some((book) => book.id === reference.bookId)) return;

    const wanted = [
      [startKey, reference.startChapter] as const,
      [endKey, reference.endChapter] as const,
    ].filter(([key], index, all) => !(key in verseCache) && all.findIndex(([k]) => k === key) === index);

    if (!wanted.length) return;

    const controller = new AbortController();
    beginLoad("Loading chapter…");

    Promise.all(
      wanted.map(([key, chapter]) =>
        fetchVerseNumbers(
          reference.bibleId,
          reference.bookId,
          chapter,
          controller.signal,
        ).then((list) => [key, list] as const),
      ),
    )
      .then((entries) => setVerseCache((prev) => ({ ...prev, ...Object.fromEntries(entries) })))
      .catch(reportError("Chapter failed"));

    return () => controller.abort();
  }, [
    hydrated,
    books,
    verseCache,
    startKey,
    endKey,
    reference.bibleId,
    reference.bookId,
    reference.startChapter,
    reference.endChapter,
    beginLoad,
    reportError,
  ]);

  // Keep the verse selections valid for the chapters they belong to.
  useEffect(() => {
    if (!startVerses.length || !endVerses.length) return;

    // Consume the flag out here: state updaters must be pure, and React
    // double-invokes them in StrictMode.
    const snap = snapEndToLast.current;
    snapEndToLast.current = false;

    setReference((prev) => {
      let { startVerse, endVerse } = prev;
      const lastVerse = endVerses[endVerses.length - 1];

      if (snap) endVerse = lastVerse;
      if (!startVerses.includes(startVerse)) startVerse = startVerses[0];
      if (!endVerses.includes(endVerse)) endVerse = lastVerse;
      // Within one chapter the range must still read forwards.
      if (prev.startChapter === prev.endChapter && Number(endVerse) < Number(startVerse)) {
        endVerse = lastVerse;
      }

      if (startVerse === prev.startVerse && endVerse === prev.endVerse) return prev;
      return { ...prev, startVerse, endVerse };
    });
  }, [startVerses, endVerses]);

  useEffect(() => {
    if (!hydrated) return;
    // Wait until both chapters' verse lists match the current selection, so we
    // never request a range built from a previous chapter's numbering.
    if (!startVerses.includes(reference.startVerse)) return;
    if (!endVerses.includes(reference.endVerse)) return;

    const controller = new AbortController();
    const chapterSpan = Number(reference.endChapter) - Number(reference.startChapter) + 1;
    beginLoad(chapterSpan > 1 ? `Fetching ${chapterSpan} chapters…` : "Fetching text…");

    fetchPassage(reference, controller.signal)
      .then((result) => {
        setPassage(result);
        setStatus("");
      })
      .catch(reportError("Passage failed"));

    return () => controller.abort();
  }, [hydrated, startVerses, endVerses, reference, beginLoad, reportError]);

  /* ── pagination ──────────────────────────────────────────────────────── */

  const measurerRef = useRef<Measurer | null>(null);
  const [measureReady, setMeasureReady] = useState(false);

  useEffect(() => {
    const measurer = new Measurer();
    measurerRef.current = measurer;

    let cancelled = false;
    const markReady = () => {
      if (!cancelled) setMeasureReady(true);
    };

    // Measuring against fallback font metrics paginates wrong, so hold off
    // until the webfonts have actually loaded.
    if (document.fonts) void document.fonts.ready.then(markReady);
    else markReady();

    return () => {
      cancelled = true;
      measurer.destroy();
      measurerRef.current = null;
    };
  }, []);

  const pages = useMemo(() => {
    const measurer = measurerRef.current;
    if (!measureReady || !measurer || !passage) return null;
    return paginate(passage.paragraphs, settings, measurer);
  }, [measureReady, passage, settings]);

  /* ── zoom ────────────────────────────────────────────────────────────── */

  const deskRef = useRef<HTMLElement | null>(null);
  const [zoom, setZoom] = useState<ZoomId>("fit");
  const [scale, setScale] = useState(0.62);

  const sheet = pageDimensions(settings);

  useEffect(() => {
    if (zoom !== "fit") {
      setScale(Number(zoom));
      return;
    }
    const desk = deskRef.current;
    if (!desk) return;

    const update = () =>
      setScale(Math.min(1, Math.max(0.25, (desk.clientWidth - 90) / sheet.width)));

    update();
    const observer = new ResizeObserver(update);
    observer.observe(desk);
    return () => observer.disconnect();
  }, [zoom, sheet.width]);

  /* ── handlers ────────────────────────────────────────────────────────── */

  const handleReferenceChange = useCallback(
    (patch: Partial<Reference>) => {
      const next = { ...reference, ...patch };
      let snap = false;

      if (patch.bookId !== undefined) {
        // A new book has its own numbering; start from its first chapter.
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

      // Within one chapter, dragging either end past the other pushes it along.
      if (next.startChapter === next.endChapter) {
        if (patch.startVerse && Number(next.endVerse) < Number(next.startVerse)) {
          next.endVerse = next.startVerse;
        }
        if (patch.endVerse && Number(next.startVerse) > Number(next.endVerse)) {
          next.startVerse = next.endVerse;
        }
      }

      if (snap) snapEndToLast.current = true;
      setReference(next);
    },
    [reference],
  );

  const handleSettingsChange = useCallback(
    (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [],
  );

  const handleWholeChapter = useCallback(() => {
    snapEndToLast.current = true;
    setReference((prev) => ({
      ...prev,
      startVerse: "1",
      endChapter: prev.startChapter,
    }));
  }, []);

  const handleEntireBook = useCallback(() => {
    const book = books.list.find((entry) => entry.id === reference.bookId);
    const lastChapter = book?.chapters[book.chapters.length - 1]?.number;
    if (!lastChapter) return;

    snapEndToLast.current = true;
    setReference((prev) => ({
      ...prev,
      startChapter: "1",
      startVerse: "1",
      endChapter: lastChapter,
    }));
  }, [books, reference.bookId]);

  /* ── derived ─────────────────────────────────────────────────────────── */

  const bookName = books.list.find((entry) => entry.id === reference.bookId)?.name;

  const referenceLabel = useMemo(() => {
    if (!bookName) return "—";
    const { startChapter, startVerse, endChapter, endVerse } = reference;
    if (startChapter === endChapter) {
      const range = endVerse !== startVerse ? `–${endVerse}` : "";
      return `${bookName} ${startChapter}:${startVerse}${range}`;
    }
    return `${bookName} ${startChapter}:${startVerse}–${endChapter}:${endVerse}`;
  }, [bookName, reference]);

  const pageCount = pages ? (settings.layout === "verso" ? pages.length * 2 : pages.length) : 0;
  const chapterSpan = Number(reference.endChapter) - Number(reference.startChapter) + 1;

  const pageCountLabel = `${pageCount} ${settings.pageSize} page${pageCount === 1 ? "" : "s"}`;

  const summary = useMemo(() => {
    if (!bookName || !pages) return "";
    const chapters = chapterSpan > 1 ? `${chapterSpan} chapters` : "1 chapter";
    return `${referenceLabel} · ${chapters} · ${pageCountLabel}`;
  }, [bookName, pages, chapterSpan, referenceLabel, pageCountLabel]);

  const statusText = status || (pages ? pageCountLabel : "");

  return (
    <div className="app">
      {/* @page can't read CSS variables, so the rule is generated per setting. */}
      <style>{`@page { size: ${settings.pageSize === "Letter" ? "letter" : "A4"} ${settings.orientation}; margin: 0; }`}</style>

      <Sidebar
        bibles={bibles}
        books={books.list}
        startVerses={startVerses}
        endVerses={endVerses}
        reference={reference}
        settings={settings}
        summary={summary}
        copyright={passage?.copyright ?? ""}
        canPrint={Boolean(pages)}
        onReferenceChange={handleReferenceChange}
        onSettingsChange={handleSettingsChange}
        onWholeChapter={handleWholeChapter}
        onEntireBook={handleEntireBook}
        onPrint={() => window.print()}
      />

      <main className="desk" ref={deskRef}>
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-reference">{referenceLabel}</div>
            <div className={`topbar-status${failed ? " is-error" : ""}`}>{statusText}</div>
          </div>
          <div className="zoom-row">
            {ZOOM_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={zoom === option.id}
                className={`zoom${zoom === option.id ? " is-on" : ""}`}
                onClick={() => setZoom(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="desk-inner">
          {pages ? (
            <PageStack
              pages={pages}
              settings={settings}
              reference={referenceLabel}
              scale={scale}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
