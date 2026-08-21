"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchBibles, fetchBooks, fetchPassage, fetchVerseNumbers } from "@/lib/api";
import {
  DEFAULT_REFERENCE,
  DEFAULT_SETTINGS,
  PAGE_WIDTH,
  STORAGE_KEY,
  ZOOM_OPTIONS,
} from "@/lib/constants";
import { Measurer, paginate } from "@/lib/paginate";
import type { BibleSummary, Book, Passage, Reference, Settings } from "@/lib/types";

import PageStack from "./PageStack";
import Sidebar from "./Sidebar";

type ZoomId = (typeof ZOOM_OPTIONS)[number]["id"];

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
  const [verses, setVerses] = useState<{ key: string; list: string[] }>({
    key: "",
    list: [],
  });
  const [passage, setPassage] = useState<Passage | null>(null);
  const [status, setStatus] = useState("Loading…");

  // Set when the user picks a different book or chapter, so the verse range
  // snaps back to the whole chapter instead of carrying over.
  const resetRangeRef = useRef(false);

  const chapterKey = `${reference.bibleId}/${reference.bookId}/${reference.chapter}`;

  const reportError = useCallback(
    (prefix: string) => (error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus(`${prefix} — ${error instanceof Error ? error.message : "failed"}`);
    },
    [],
  );

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

    setStatus("Loading books…");
    fetchBooks(bibleId, controller.signal)
      .then((list) => {
        setBooks({ bibleId, list });
        setReference((prev) => {
          if (prev.bibleId !== bibleId) return prev;
          const book = list.find((entry) => entry.id === prev.bookId) ?? list[0];
          if (!book) return prev;
          const chapter = book.chapters.some((entry) => entry.number === prev.chapter)
            ? prev.chapter
            : (book.chapters[0]?.number ?? prev.chapter);
          if (book.id === prev.bookId && chapter === prev.chapter) return prev;
          return { ...prev, bookId: book.id, chapter };
        });
      })
      .catch(reportError("Books failed"));

    return () => controller.abort();
  }, [hydrated, reference.bibleId, reportError]);

  useEffect(() => {
    if (!hydrated) return;
    if (books.bibleId !== reference.bibleId) return;
    if (!books.list.some((book) => book.id === reference.bookId)) return;

    const controller = new AbortController();
    setStatus("Loading chapter…");

    fetchVerseNumbers(reference.bibleId, reference.bookId, reference.chapter, controller.signal)
      .then((list) => {
        setVerses({ key: chapterKey, list });
        if (!list.length) return;

        const last = list[list.length - 1];
        const reset = resetRangeRef.current;
        resetRangeRef.current = false;

        setReference((prev) => {
          if (`${prev.bibleId}/${prev.bookId}/${prev.chapter}` !== chapterKey) return prev;
          const start = reset || !list.includes(prev.start) ? "1" : prev.start;
          let end = reset || !list.includes(prev.end) ? last : prev.end;
          if (Number(end) < Number(start)) end = last;
          if (start === prev.start && end === prev.end) return prev;
          return { ...prev, start, end };
        });
      })
      .catch(reportError("Chapter failed"));

    return () => controller.abort();
  }, [hydrated, books, chapterKey, reference.bibleId, reference.bookId, reference.chapter, reportError]);

  useEffect(() => {
    if (!hydrated) return;
    // Wait until the verse list matches the chapter on screen, so we never ask
    // for a range that belongs to the previously selected chapter.
    if (verses.key !== chapterKey) return;
    if (!verses.list.includes(reference.start) || !verses.list.includes(reference.end)) return;

    const controller = new AbortController();
    setStatus("Fetching text…");

    fetchPassage(reference, controller.signal)
      .then((result) => {
        setPassage(result);
        setStatus("");
      })
      .catch(reportError("Passage failed"));

    return () => controller.abort();
  }, [hydrated, verses, chapterKey, reference, reportError]);

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

  useEffect(() => {
    if (zoom !== "fit") {
      setScale(Number(zoom));
      return;
    }
    const desk = deskRef.current;
    if (!desk) return;

    const update = () =>
      setScale(Math.min(1, Math.max(0.25, (desk.clientWidth - 90) / PAGE_WIDTH)));

    update();
    const observer = new ResizeObserver(update);
    observer.observe(desk);
    return () => observer.disconnect();
  }, [zoom]);

  /* ── handlers ────────────────────────────────────────────────────────── */

  const handleReferenceChange = useCallback(
    (patch: Partial<Reference>, resetRange = false) => {
      if (resetRange) resetRangeRef.current = true;
      setReference((prev) => {
        const next = { ...prev, ...patch };
        // Keep the range ordered as the user drags either end past the other.
        if (patch.start && Number(next.end) < Number(next.start)) next.end = next.start;
        if (patch.end && Number(next.start) > Number(next.end)) next.start = next.end;
        return next;
      });
    },
    [],
  );

  const handleSettingsChange = useCallback(
    (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [],
  );

  const handleWholeChapter = useCallback(() => {
    setReference((prev) => ({
      ...prev,
      start: "1",
      end: verses.list[verses.list.length - 1] ?? prev.end,
    }));
  }, [verses]);

  /* ── derived ─────────────────────────────────────────────────────────── */

  const referenceLabel = useMemo(() => {
    const book = books.list.find((entry) => entry.id === reference.bookId);
    if (!book) return "—";
    const range = reference.end !== reference.start ? `–${reference.end}` : "";
    return `${book.name} ${reference.chapter}:${reference.start}${range}`;
  }, [books, reference]);

  const pageCount = pages ? (settings.layout === "verso" ? pages.length * 2 : pages.length) : 0;
  const statusText = status || (pages ? `${pageCount} A4 page${pageCount === 1 ? "" : "s"}` : "");

  return (
    <div className="app">
      <Sidebar
        bibles={bibles}
        books={books.list}
        verseNumbers={verses.key === chapterKey ? verses.list : []}
        reference={reference}
        settings={settings}
        copyright={passage?.copyright ?? ""}
        canPrint={Boolean(pages)}
        onReferenceChange={handleReferenceChange}
        onSettingsChange={handleSettingsChange}
        onWholeChapter={handleWholeChapter}
        onPrint={() => window.print()}
      />

      <main className="desk" ref={deskRef}>
        <div className="topbar">
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, minWidth: 0 }}>
            <div className="topbar-reference">{referenceLabel}</div>
            <div className="topbar-status">{statusText}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
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
