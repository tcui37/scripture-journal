"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useScripture } from "@/hooks/useScripture";
import { AccountError, authHref, fetchFile } from "@/lib/account";
import { uniqueLanguages } from "@/lib/bibles";
import {
  combineParallelBands,
  combineParallelColumns,
  paragraphBlocks,
  PARALLEL_GAP,
  parallelBlocks,
} from "@/lib/blocks";
import {
  cssPageSize,
  DEFAULT_REFERENCE,
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  ZOOM_OPTIONS,
} from "@/lib/constants";
import { fitPreviewScale, narrowUiQuery, startRailCollapsed } from "@/lib/layout";
import { printFilename } from "@/lib/filename";
import { checkLimits } from "@/lib/limits";
import { Measurer, paginate } from "@/lib/paginate";
import { alignPassages, citationIds, orderedSides } from "@/lib/parallel";
import { pageDimensions, singleTextGeometry } from "@/lib/render";
import type { Reference, Settings } from "@/lib/types";

import AppNav, { AccountControl } from "./AppNav";
import AccountSidecar from "./AccountSidecar";
import { useAuth } from "./AuthProvider";
import PageStack from "./PageStack";
import Sidebar, { type RailView } from "./Sidebar";

type ZoomId = (typeof ZOOM_OPTIONS)[number]["id"];

const ZOOM_IDS: ZoomId[] = ZOOM_OPTIONS.map((option) => option.id);

/** Trimmed, de-duplicated, empties dropped — for assembling licence notices. */
const unique = (parts: (string | undefined)[]) =>
  Array.from(new Set(parts.map((part) => part?.trim()).filter(Boolean) as string[]));

const APP_TITLE = "Scripture Journal";

export default function JournalApp() {
  // Settings live in localStorage, which is only readable after mount — gate
  // the data fetches on it so we don't load the defaults then immediately
  // reload the restored reference.
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileId = searchParams.get("file");
  const filesRequested = searchParams.get("files") === "1";
  const accountOpen = searchParams.get("account") === "1";
  const { user, loading, apiStatus } = useAuth();
  // Hide Files until the session is known so guests never flash that panel.
  const filesOpen = Boolean(user) && filesRequested;
  const railView: RailView = filesOpen ? "files" : "design";
  const [hydrated, setHydrated] = useState(false);
  const [fileStatus, setFileStatus] = useState("");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [railCollapsed, setRailCollapsed] = useState(true);
  const [designFocusToken, setDesignFocusToken] = useState(0);
  const [initial, setInitial] = useState<{
    reference: Reference;
    languages: string[];
  }>({
    reference: DEFAULT_REFERENCE,
    languages: ["eng"],
  });

  const scripture = useScripture(
    initial.reference,
    initial.languages,
    hydrated && apiStatus === "ok",
  );
  const { reference, passage, comparePassage, status, failed, setReference } = scripture;
  const referenceRef = useRef(reference);
  const setReferenceRef = useRef(setReference);
  referenceRef.current = reference;
  setReferenceRef.current = setReference;

  /* ── persistence ─────────────────────────────────────────────────────── */

  useEffect(() => {
    let storedRail: boolean | undefined;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          settings?: Partial<Settings>;
          reference?: Partial<Reference>;
          openSections?: Record<string, boolean>;
          railCollapsed?: boolean;
          language?: string;
          languages?: string[];
          compareLanguage?: string;
        };
        if (parsed.settings) setSettings((prev) => ({ ...prev, ...parsed.settings }));
        if (parsed.openSections) setOpenSections(parsed.openSections);
        if (typeof parsed.railCollapsed === "boolean") storedRail = parsed.railCollapsed;
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
    const filesRequested = new URLSearchParams(window.location.search).get("files") === "1";
    const narrow = window.matchMedia(narrowUiQuery()).matches;
    setRailCollapsed(startRailCollapsed(narrow, filesRequested, storedRail));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !fileId || apiStatus !== "ok") return;

    let cancelled = false;
    fetchFile(fileId)
      .then((file) => {
        if (cancelled) return;
        setSettings(file.design);
        const { bibleId, compareId } = referenceRef.current;
        setReferenceRef.current({
          bibleId,
          compareId,
          bookId: file.book_id,
          startChapter: file.start_chapter,
          startVerse: file.start_verse,
          endChapter: file.end_chapter,
          endVerse: file.end_verse,
        });
        setFileStatus("");
        router.replace("/");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof AccountError && error.status === 401) {
          router.push(authHref("login", "/"));
          return;
        }
        if (error instanceof AccountError && error.status === 404) return;
        setFileStatus(error instanceof Error ? error.message : "Could not open file");
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, fileId, router, apiStatus]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          settings,
          reference,
          openSections,
          railCollapsed,
          languages: scripture.selectedLanguages,
        }),
      );
    } catch {
      // Storage may be full or blocked; the app still works without it.
    }
  }, [hydrated, settings, reference, openSections, railCollapsed, scripture.selectedLanguages]);

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
  const { primary: primaryPassage, secondary: secondaryPassage } = orderedSides(
    passage,
    comparePassage,
    settings.parallelSwap,
  );

  const pages = useMemo(() => {
    const measurer = measurerRef.current;
    if (!measureReady || !measurer || !primaryPassage) return null;

    if (!parallel || !secondaryPassage) {
      return paginate(paragraphBlocks(primaryPassage.paragraphs, settings), settings, measurer);
    }

    if (facing) {
      // One translation per sheet: paginate each, then interleave so the pair
      // for a given stretch of text lands on facing pages.
      const left = paginate(
        paragraphBlocks(primaryPassage.paragraphs, settings),
        settings,
        measurer,
      );
      const right = paginate(
        paragraphBlocks(secondaryPassage.paragraphs, settings),
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
        paragraphBlocks(primaryPassage.paragraphs, settings),
        settings,
        measurer,
        box,
      );
      const right = paginate(
        paragraphBlocks(secondaryPassage.paragraphs, settings),
        settings,
        measurer,
        box,
      );
      const combined: string[][] = [];
      for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
        const first = left[i]?.[0] ?? "";
        const second = right[i]?.[0] ?? "";
        combined.push([
          flow ? combineParallelColumns(first, second) : combineParallelBands(first, second),
        ]);
      }
      return combined;
    }

    const rows = alignPassages(primaryPassage.paragraphs, secondaryPassage.paragraphs);
    return paginate(parallelBlocks(rows, settings), settings, measurer);
  }, [measureReady, primaryPassage, secondaryPassage, settings, parallel, facing]);

  /* ── zoom ────────────────────────────────────────────────────────────── */

  const deskRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    sl: number;
    st: number;
    moved: boolean;
  } | null>(null);
  const [zoom, setZoom] = useState<ZoomId>("fit");
  const [scale, setScale] = useState(0.62);

  const sheet = pageDimensions(settings);

  useEffect(() => {
    if (zoom !== "fit") {
      setScale(Number(zoom));
      return;
    }
    const stage = stageRef.current;
    const desk = deskRef.current;
    if (!stage) return;

    const update = () => setScale(fitPreviewScale(stage.clientWidth, sheet.width));

    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    if (desk) observer.observe(desk);
    return () => observer.disconnect();
  }, [zoom, sheet.width, railCollapsed]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let lastStep = 0;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const now = Date.now();
      if (now - lastStep < 120) return;
      lastStep = now;
      const direction = event.deltaY > 0 ? -1 : 1;
      setZoom((current) => {
        const index = ZOOM_IDS.indexOf(current);
        const next = Math.min(ZOOM_IDS.length - 1, Math.max(0, index + direction));
        return ZOOM_IDS[next] ?? current;
      });
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const stopPan = useCallback((pointerId: number) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== pointerId) return;
    stageRef.current?.classList.remove("is-panning");
    panRef.current = null;
  }, []);

  const handleStagePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    if (event.button !== 0) return;
    const stage = stageRef.current;
    if (!stage) return;
    panRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      sl: stage.scrollLeft,
      st: stage.scrollTop,
      moved: false,
    };
    stage.setPointerCapture(event.pointerId);
  }, []);

  const handleStagePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const stage = stageRef.current;
    if (!pan || pan.pointerId !== event.pointerId || !stage) return;
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    if (!pan.moved && dx * dx + dy * dy < 9) return;
    if (!pan.moved) {
      pan.moved = true;
      stage.classList.add("is-panning");
    }
    event.preventDefault();
    stage.scrollLeft = pan.sl - dx;
    stage.scrollTop = pan.st - dy;
  }, []);

  const handleStagePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      stopPan(event.pointerId);
    },
    [stopPan],
  );

  /* ── handlers ────────────────────────────────────────────────────────── */

  const handleSettingsChange = useCallback(
    (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [],
  );

  const handleToggleSection = useCallback(
    (id: string, open: boolean) => setOpenSections((prev) => ({ ...prev, [id]: open })),
    [],
  );

  const handleToggleRail = useCallback(() => setRailCollapsed((prev) => !prev), []);

  const handleRailViewChange = useCallback(
    (view: RailView) => {
      const params = new URLSearchParams(searchParams.toString());
      if (view === "files") {
        if (!user) {
          params.delete("files");
        } else {
          params.set("files", "1");
          setRailCollapsed(false);
        }
      } else {
        params.delete("files");
        setDesignFocusToken((token) => token + 1);
        setOpenSections((prev) => ({ ...prev, designs: true }));
        setRailCollapsed(false);
      }
      const query = params.toString();
      router.push(query ? `/?${query}` : "/");
    },
    [router, searchParams, user],
  );

  useEffect(() => {
    if (loading || user || !filesRequested) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("files");
    const query = params.toString();
    router.replace(query ? `/?${query}` : "/");
  }, [loading, user, filesRequested, router, searchParams]);

  const handleCloseAccount = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("account");
    const query = params.toString();
    router.push(query ? `/?${query}` : "/");
  }, [router, searchParams]);

  useEffect(() => {
    if (filesOpen) setRailCollapsed(false);
  }, [filesOpen]);

  useEffect(() => {
    if (railCollapsed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!window.matchMedia(narrowUiQuery()).matches) return;
      setRailCollapsed(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [railCollapsed]);

  useEffect(() => {
    if (railView !== "design" || designFocusToken === 0) return;
    requestAnimationFrame(() => {
      document.getElementById("rail-designs")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [railView, openSections.designs, designFocusToken]);

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
      citationIds(reference.bibleId, reference.compareId, settings.parallelSwap)
        .map(abbreviation)
        .filter(Boolean)
        .join(" · "),
    [reference.bibleId, reference.compareId, abbreviation, settings.parallelSwap],
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

  const downloadTitle = useMemo(
    () => (bookName ? printFilename(bookName, reference) : APP_TITLE),
    [bookName, reference],
  );

  useEffect(() => {
    document.title = downloadTitle;
    return () => {
      document.title = APP_TITLE;
    };
  }, [downloadTitle]);

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

  const statusText =
    fileStatus ||
    (apiStatus === "ok" ? status : "") ||
    (pages ? pageCountLabel : "");

  return (
    <div className="app">
      {/* @page can't read CSS variables, so the rule is generated per setting. */}
      <style>{`@page { size: ${cssPageSize(settings.pageSize)} ${settings.orientation}; margin: 0; }`}</style>

      <Sidebar
        scripture={scripture}
        settings={settings}
        summary={summary}
        copyright={notice}
        openSections={openSections}
        collapsed={railCollapsed}
        limitCheck={limitCheck}
        user={user}
        railView={railView}
        onRailViewChange={handleRailViewChange}
        onSettingsChange={handleSettingsChange}
        onToggleSection={handleToggleSection}
        onToggle={handleToggleRail}
      />

      {!railCollapsed ? (
        <button
          type="button"
          className="rail-backdrop"
          aria-label="Close settings"
          onClick={handleToggleRail}
        />
      ) : null}

      <main className="desk" ref={deskRef}>
        <div className="topbar">
          <div className="topbar-left">
            {railCollapsed ? (
              <button
                type="button"
                className="rail-toggle is-label"
                aria-expanded={false}
                aria-controls="settings-rail"
                aria-label="Show settings"
                onClick={handleToggleRail}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                Settings
              </button>
            ) : null}
            <div className="topbar-copy">
              <div className="topbar-reference">{referenceLabel}</div>
              <div className={`topbar-status${failed || fileStatus ? " is-error" : ""}`}>
                {statusText}
              </div>
            </div>
          </div>
          <div className="topbar-right">
            <Suspense>
              <AppNav />
            </Suspense>
            <div className="zoom-row">
              <label className="zoom-select">
                <span className="zoom-select-label">Zoom</span>
                <select
                  value={zoom}
                  aria-label="Zoom"
                  onChange={(event) => setZoom(event.target.value as ZoomId)}
                >
                  {ZOOM_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

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
            <Suspense>
              <AccountControl />
            </Suspense>
          </div>
        </div>

        <div
          className="preview-stage"
          ref={stageRef}
          tabIndex={0}
          role="region"
          aria-label="Journal page preview"
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          onPointerCancel={handleStagePointerUp}
          onLostPointerCapture={handleStagePointerUp}
          onDragStart={(event) => event.preventDefault()}
        >
          <div className="preview-canvas">
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
        </div>
      </main>

      {accountOpen ? <AccountSidecar onClose={handleCloseAccount} /> : null}
    </div>
  );
}
