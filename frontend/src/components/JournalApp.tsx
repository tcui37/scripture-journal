"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { uniqueLanguages, useScripture } from "@/hooks/useScripture";
import {
  combineParallelBands,
  combineParallelColumns,
  paragraphBlocks,
  PARALLEL_GAP,
  parallelBlocks,
} from "@/lib/blocks";
import { DEFAULT_REFERENCE, DEFAULT_SETTINGS, STORAGE_KEY, ZOOM_OPTIONS } from "@/lib/constants";
import { checkLimits } from "@/lib/limits";
import { Measurer, paginate } from "@/lib/paginate";
import { alignPassages } from "@/lib/parallel";
import { pageDimensions, singleTextGeometry } from "@/lib/render";
import type { Reference, Settings } from "@/lib/types";

import PageStack from "./PageStack";
import Sidebar from "./Sidebar";

type ZoomId = (typeof ZOOM_OPTIONS)[number]["id"];

/** Trimmed, de-duplicated, empties dropped — for assembling licence notices. */
const unique = (parts: (string | undefined)[]) =>
  Array.from(new Set(parts.map((part) => part?.trim()).filter(Boolean) as string[]));

export default function JournalApp() {
  // Settings live in localStorage, which is only readable after mount — gate
  // the data fetches on it so we don't load the defaults then immediately
  // reload the restored reference.
  const [hydrated, setHydrated] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [initial, setInitial] = useState<{
    reference: Reference;
    languages: string[];
  }>({
    reference: DEFAULT_REFERENCE,
    languages: ["eng"],
  });

  const scripture = useScripture(initial.reference, initial.languages, hydrated);
  const { reference, passage, comparePassage, status, failed } = scripture;

  /* ── persistence ─────────────────────────────────────────────────────── */

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          settings?: Partial<Settings>;
          reference?: Partial<Reference>;
          openSections?: Record<string, boolean>;
          language?: string;
          languages?: string[];
          compareLanguage?: string;
        };
        if (parsed.settings) setSettings((prev) => ({ ...prev, ...parsed.settings }));
        if (parsed.openSections) setOpenSections(parsed.openSections);
        setInitial({
          reference: { ...DEFAULT_REFERENCE, ...parsed.reference },
          languages: uniqueLanguages(
            parsed.languages ??
              ([parsed.language, parsed.compareLanguage].filter(Boolean) as string[]),
          ),
        });
      }
    } catch {
      // Unreadable storage just means we start from the defaults.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          settings,
          reference,
          openSections,
          languages: scripture.selectedLanguages,
        }),
      );
    } catch {
      // Storage may be full or blocked; the app still works without it.
    }
  }, [hydrated, settings, reference, openSections, scripture.selectedLanguages]);

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

  const parallel = Boolean(comparePassage);
  const facing = parallel && settings.parallelMode === "facing";

  const pages = useMemo(() => {
    const measurer = measurerRef.current;
    if (!measureReady || !measurer || !passage) return null;

    if (!parallel) {
      return paginate(paragraphBlocks(passage.paragraphs, settings), settings, measurer);
    }

    if (facing) {
      // One translation per sheet: paginate each, then interleave so the pair
      // for a given stretch of text lands on facing pages.
      const left = paginate(paragraphBlocks(passage.paragraphs, settings), settings, measurer);
      const right = paginate(
        paragraphBlocks(comparePassage!.paragraphs, settings),
        settings,
        measurer,
      );
      const merged: string[][] = [];
      for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
        merged.push(left[i] ?? [""]);
        merged.push(right[i] ?? [""]);
      }
      return merged;
    }

    if (settings.parallelMode === "flow" || settings.parallelMode === "bands") {
      // Independent pagination: each language keeps its own paragraphs, then
      // the two are placed on one sheet (JPS / CUV–NIV columns, or a
      // horizontal split when columns would be too narrow).
      const region = singleTextGeometry(settings).slots[0];
      const flow = settings.parallelMode === "flow";
      const box = flow
        ? {
            width: Math.max(1, Math.floor((region.width - PARALLEL_GAP) / 2)),
            height: region.height,
          }
        : {
            width: region.width,
            height: Math.max(1, Math.floor((region.height - PARALLEL_GAP) / 2)),
          };
      const left = paginate(
        paragraphBlocks(passage.paragraphs, settings),
        settings,
        measurer,
        box,
      );
      const right = paginate(
        paragraphBlocks(comparePassage!.paragraphs, settings),
        settings,
        measurer,
        box,
      );
      const combined: string[][] = [];
      for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
        const primary = left[i]?.[0] ?? "";
        const secondary = right[i]?.[0] ?? "";
        combined.push([
          flow
            ? combineParallelColumns(primary, secondary)
            : combineParallelBands(primary, secondary),
        ]);
      }
      return combined;
    }

    const rows = alignPassages(passage.paragraphs, comparePassage!.paragraphs);
    return paginate(parallelBlocks(rows, settings), settings, measurer);
  }, [measureReady, passage, comparePassage, settings, parallel, facing]);

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

  const handleSettingsChange = useCallback(
    (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [],
  );

  const handleToggleSection = useCallback(
    (id: string, open: boolean) => setOpenSections((prev) => ({ ...prev, [id]: open })),
    [],
  );

  /* ── derived ─────────────────────────────────────────────────────────── */

  const bookName = scripture.book?.name;
  const limitCheck = checkLimits(
    scripture.bibles,
    [reference.bibleId, reference.compareId].filter(Boolean),
    scripture.book,
    reference,
  );

  /** Abbreviation for a translation id, from the "NIV — …" label form. */
  const abbreviation = useCallback(
    (id: string) => {
      if (!id) return "";
      const bible = scripture.bibles.find((entry) => entry.id === id);
      return bible ? bible.label.split(" — ")[0].trim() : id;
    },
    [scripture.bibles],
  );

  // The in-context citation both api.bible and Crossway require: the
  // abbreviation printed with the passage it belongs to.
  const citation = useMemo(
    () =>
      [reference.bibleId, reference.compareId]
        .filter(Boolean)
        .map(abbreviation)
        .filter(Boolean)
        .join(" · "),
    [reference.bibleId, reference.compareId, abbreviation],
  );

  // Required on every sheet, so kept to bare domains: "esv.org", not a URL.
  const sources = useMemo(
    () =>
      unique([passage?.attribution, comparePassage?.attribution])
        .map((url) => url.replace(/^https?:\/\//, "").replace(/\/$/, ""))
        .join("   ·   "),
    [passage?.attribution, comparePassage?.attribution],
  );

  // The full publisher notices — printed once, on the last sheet. Deduped so
  // two translations from one upstream do not repeat it.
  const copyright = useMemo(
    () => unique([passage?.copyright, comparePassage?.copyright]).join("   "),
    [passage?.copyright, comparePassage?.copyright],
  );

  /** Everything a licence requires shown somewhere, for the sidebar. */
  const notice = useMemo(
    () =>
      unique([
        passage?.copyright,
        comparePassage?.copyright,
        passage?.attribution,
        comparePassage?.attribution,
      ]).join("  ·  "),
    [passage, comparePassage],
  );

  const referenceLabel = useMemo(() => {
    if (!bookName) return "—";
    const { startChapter, startVerse, endChapter, endVerse } = reference;
    if (startChapter === endChapter) {
      const range = endVerse !== startVerse ? `–${endVerse}` : "";
      return `${bookName} ${startChapter}:${startVerse}${range}`;
    }
    return `${bookName} ${startChapter}:${startVerse}–${endChapter}:${endVerse}`;
  }, [bookName, reference]);

  const blanks = settings.layout === "verso" && !facing && settings.lines !== "none";
  const pageLayout =
    parallel && (settings.parallelMode === "flow" || settings.parallelMode === "bands")
      ? singleTextGeometry(settings)
      : undefined;
  const pageCount = pages ? (blanks ? pages.length * 2 : pages.length) : 0;
  const chapterSpan = Number(reference.endChapter) - Number(reference.startChapter) + 1;
  const canPrint = Boolean(pages) && limitCheck.ok;

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
        scripture={scripture}
        settings={settings}
        summary={summary}
        copyright={notice}
        openSections={openSections}
        limitCheck={limitCheck}
        onSettingsChange={handleSettingsChange}
        onToggleSection={handleToggleSection}
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

            <button
              type="button"
              className="download-button"
              onClick={() => window.print()}
              disabled={!canPrint}
              aria-label="Print or save as PDF"
              title={
                canPrint
                  ? `Print / save as PDF — ${pageCountLabel}`
                  : limitCheck.ok
                    ? "Nothing to print yet"
                    : limitCheck.message
              }
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </div>
        </div>

        <div className="desk-inner">
          {pages ? (
            <PageStack
              pages={pages}
              settings={settings}
              reference={referenceLabel}
              citation={citation}
              sources={sources}
              copyright={copyright}
              scale={scale}
              interleaveBlanks={blanks}
              layout={pageLayout}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
