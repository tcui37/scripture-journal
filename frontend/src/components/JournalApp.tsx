"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useScripture } from "@/hooks/useScripture";
import { AccountError, authHref, fetchFile, journalFileState } from "@/lib/account";
import { readJournalPanelsFromSearch, resolveLandingPanels, syncJournalUrl } from "@/lib/journal-url";
import { uniqueLanguages } from "@/lib/bibles";
import {
  clampZoom,
  cssPageSize,
  DEFAULT_REFERENCE,
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  ZOOM_WHEEL_STEP,
} from "@/lib/constants";
import {
  fitPreviewScale,
  narrowUiQuery,
  railCollapsedAfterViewportChange,
  readPreviewPaddingInline,
  startRailCollapsed,
} from "@/lib/layout";
import { printFilename } from "@/lib/filename";
import { restoreFocusFromPanel } from "@/lib/focus";
import { checkLimits } from "@/lib/limits";
import {
  formatPageCountLabel,
  paginatePassages,
  printedPageCount,
} from "@/lib/pages";
import { Measurer } from "@/lib/paginate";
import { citationIds, orderedSides } from "@/lib/parallel";
import { pageDimensions, singleTextGeometry } from "@/lib/render";
import type { JournalFile, Reference, Settings } from "@/lib/types";

import AppNav, { AccountControl } from "./AppNav";
import AccountSidecar from "./AccountSidecar";
import { useAuth } from "./AuthProvider";
import { JournalUiProvider } from "./JournalUiContext";
import { useLibrary } from "./LibraryProvider";
import PageStack from "./PageStack";
import Sidebar, { type RailView } from "./Sidebar";
import ZoomControl from "./ZoomControl";

/** Trimmed, de-duplicated, empties dropped — for assembling licence notices. */
const unique = (parts: (string | undefined)[]) =>
  Array.from(new Set(parts.map((part) => part?.trim()).filter(Boolean) as string[]));

const APP_TITLE = "Scripture Journal";

const SETTINGS_RAIL_ID = "settings-rail";
const SETTINGS_FOCUS_FALLBACKS = [".topbar-settings", "#journal-main"] as const;

function restoreSettingsFocus(): void {
  restoreFocusFromPanel(document.getElementById(SETTINGS_RAIL_ID), SETTINGS_FOCUS_FALLBACKS);
}

export default function JournalApp() {
  // Settings live in localStorage, which is only readable after mount — gate
  // the data fetches on it so we don't load the defaults then immediately
  // reload the restored reference.
  const router = useRouter();
  const searchParams = useSearchParams();
  const landingPanels = readJournalPanelsFromSearch(searchParams);
  const resolvedLanding = resolveLandingPanels(landingPanels);
  const pendingFileIdRef = useRef(landingPanels.fileId);
  const { user, sessionReady, apiStatus } = useAuth();
  const { getCachedFile, cacheFile } = useLibrary();
  const [filesOpen, setFilesOpen] = useState(resolvedLanding.files);
  const [accountOpen, setAccountOpen] = useState(resolvedLanding.account);
  // Hide Files until the session is known so guests never flash that panel.
  const filesPanelOpen = Boolean(user) && filesOpen;
  const railView: RailView = filesPanelOpen ? "files" : "design";
  const [hydrated, setHydrated] = useState(false);
  const [fileStatus, setFileStatus] = useState("");
  const [activeLibraryFile, setActiveLibraryFile] = useState<JournalFile | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  // When Files is deep-linked the rail must start open — avoids a collapsed flash.
  const [railCollapsed, setRailCollapsed] = useState(() => !resolvedLanding.files);
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

  const railCollapsedRef = useRef(railCollapsed);
  const accountOpenRef = useRef(accountOpen);
  railCollapsedRef.current = railCollapsed;
  accountOpenRef.current = accountOpen;

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
        if (parsed.openSections) {
          setOpenSections(
            Object.fromEntries(
              Object.entries(parsed.openSections).filter(([, open]) => open),
            ),
          );
        }
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
    const fileId = pendingFileIdRef.current;
    if (!hydrated || !fileId || apiStatus !== "ok") return;

    pendingFileIdRef.current = null;
    let cancelled = false;

    const applyFile = (file: JournalFile) => {
      if (cancelled) return;
      const next = journalFileState(file, referenceRef.current);
      setSettings(next.settings);
      setReferenceRef.current(next.reference);
      setActiveLibraryFile(file);
      setFileStatus("");
      cacheFile(file);
      syncJournalUrl({ file: null });
    };

    const cached = getCachedFile(fileId);
    if (cached) {
      applyFile(cached);
      return;
    }

    fetchFile(fileId)
      .then((file) => {
        applyFile(file);
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
  }, [hydrated, apiStatus, getCachedFile, cacheFile, router]);

  const handleOpenFile = useCallback(
    (file: JournalFile) => {
      const next = journalFileState(file, referenceRef.current);
      setSettings(next.settings);
      setReferenceRef.current(next.reference);
      setActiveLibraryFile(file);
      setFileStatus("");
      cacheFile(file);
    },
    [cacheFile],
  );

  useEffect(() => {
    if (!hydrated) return;
    try {
      const narrow = window.matchMedia(narrowUiQuery()).matches;
      const existing = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<
        string,
        unknown
      >;
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...existing,
          settings,
          reference,
          openSections: Object.fromEntries(
            Object.entries(openSections).filter(([, open]) => open),
          ),
          // Phone layout forces the rail closed; keep the desktop preference.
          ...(narrow ? {} : { railCollapsed }),
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
    return paginatePassages(primaryPassage, secondaryPassage, settings, measurer);
  }, [measureReady, primaryPassage, secondaryPassage, settings]);

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
  const [zoomFit, setZoomFit] = useState(true);
  const [customScale, setCustomScale] = useState(1);
  const [scale, setScale] = useState(0.62);

  const sheet = pageDimensions(settings);

  useEffect(() => {
    if (zoomFit) return;
    setScale(customScale);
  }, [zoomFit, customScale]);

  useEffect(() => {
    if (!zoomFit) return;
    const stage = stageRef.current;
    const desk = deskRef.current;
    if (!stage) return;

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const canvas = stage.querySelector(".preview-canvas");
        const paddingInline = readPreviewPaddingInline(canvas, stage.clientWidth);
        const fitScale = fitPreviewScale(stage.clientWidth, sheet.width, paddingInline);
        setScale(fitScale);
        setCustomScale(fitScale);
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    if (desk) observer.observe(desk);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [zoomFit, sheet.width, railCollapsed]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let lastStep = 0;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const now = Date.now();
      if (now - lastStep < 50) return;
      lastStep = now;
      const direction = event.deltaY > 0 ? -1 : 1;
      setZoomFit(false);
      setCustomScale((current) => clampZoom(current + direction * ZOOM_WHEEL_STEP));
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

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      panRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        sl: stage.scrollLeft,
        st: stage.scrollTop,
        moved: false,
      };
      stage.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
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
    };

    const onPointerEnd = (event: PointerEvent) => {
      stopPan(event.pointerId);
    };

    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove, { passive: false });
    stage.addEventListener("pointerup", onPointerEnd);
    stage.addEventListener("pointercancel", onPointerEnd);
    stage.addEventListener("lostpointercapture", onPointerEnd);

    return () => {
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", onPointerEnd);
      stage.removeEventListener("pointercancel", onPointerEnd);
      stage.removeEventListener("lostpointercapture", onPointerEnd);
    };
  }, [stopPan]);

  /* ── handlers ────────────────────────────────────────────────────────── */

  const handleSettingsChange = useCallback(
    (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [],
  );

  const handleToggleSection = useCallback((id: string, open: boolean) => {
    setOpenSections((prev) => {
      if (open) return { ...prev, [id]: true };
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleToggleRail = useCallback(() => {
    const narrow = window.matchMedia(narrowUiQuery()).matches;
    const opening = railCollapsedRef.current;
    if (!opening) {
      restoreSettingsFocus();
    }
    if (opening && narrow) {
      setAccountOpen(false);
    }
    setRailCollapsed(!opening);
  }, []);

  const handleRailViewChange = useCallback(
    (view: RailView) => {
      if (view === "files") {
        if (!user) {
          setFilesOpen(false);
        } else {
          setFilesOpen(true);
          setRailCollapsed(false);
        }
      } else {
        setFilesOpen(false);
        setDesignFocusToken((token) => token + 1);
        setOpenSections((prev) => ({ ...prev, designs: true }));
        setRailCollapsed(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (!sessionReady || user || !filesOpen) return;
    setFilesOpen(false);
  }, [sessionReady, user, filesOpen]);

  useEffect(() => {
    if (!hydrated) return;
    syncJournalUrl({
      files: filesPanelOpen,
      account: accountOpen,
    });
  }, [hydrated, filesPanelOpen, accountOpen]);

  useEffect(() => {
    if (!hydrated || !filesPanelOpen) return;
    if (accountOpen) setAccountOpen(false);
    if (railCollapsed) setRailCollapsed(false);
  }, [hydrated, filesPanelOpen, accountOpen, railCollapsed]);

  const handleCloseAccount = useCallback(() => {
    setAccountOpen(false);
  }, []);

  const toggleAccount = useCallback(() => {
    const narrow = window.matchMedia(narrowUiQuery()).matches;
    const next = !accountOpenRef.current;
    setAccountOpen(next);
    if (next && narrow) {
      setRailCollapsed(true);
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(narrowUiQuery());
    const syncRail = () => {
      let stored: boolean | undefined;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as {
          railCollapsed?: boolean;
        };
        if (typeof parsed.railCollapsed === "boolean") stored = parsed.railCollapsed;
      } catch {
        // Ignore unreadable storage during resize.
      }
      setRailCollapsed((current) =>
        railCollapsedAfterViewportChange(mq.matches, filesPanelOpen, current, stored),
      );
    };
    mq.addEventListener("change", syncRail);
    return () => mq.removeEventListener("change", syncRail);
  }, [filesPanelOpen]);

  useEffect(() => {
    if (!railCollapsed) return;
    restoreSettingsFocus();
  }, [railCollapsed]);

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
    const syncOverlay = () => {
      const narrow = window.matchMedia(narrowUiQuery()).matches;
      const overlay = narrow && (!railCollapsed || accountOpen);
      document.documentElement.classList.toggle("is-mobile-overlay", overlay);
    };
    syncOverlay();
    const mq = window.matchMedia(narrowUiQuery());
    mq.addEventListener("change", syncOverlay);
    return () => {
      mq.removeEventListener("change", syncOverlay);
      document.documentElement.classList.remove("is-mobile-overlay");
    };
  }, [railCollapsed, accountOpen]);

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
  const pageCount = printedPageCount(pages, settings, { facing });
  const chapterSpan = Number(reference.endChapter) - Number(reference.startChapter) + 1;
  const canPrint = Boolean(pages) && limitCheck.ok;

  const pageCountLabel = formatPageCountLabel(pageCount, settings.pageSize);

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
    <JournalUiProvider
      value={{ accountOpen, toggleAccount, closeAccount: handleCloseAccount }}
    >
    <div className="app">
      {/* @page can't read CSS variables, so the rule is generated per setting. */}
      <style>{`@page { size: ${cssPageSize(settings.pageSize)} ${settings.orientation}; margin: 0; }`}</style>

      <a href="#journal-main" className="skip-link">
        Skip to page preview
      </a>
      <Sidebar
        scripture={scripture}
        settings={settings}
        reference={reference}
        summary={summary}
        copyright={notice}
        openSections={openSections}
        collapsed={railCollapsed}
        limitCheck={limitCheck}
        user={user}
        railView={railView}
        activeLibraryFile={activeLibraryFile}
        onRailViewChange={handleRailViewChange}
        onSettingsChange={handleSettingsChange}
        onToggleSection={handleToggleSection}
        onToggle={handleToggleRail}
        onOpenFile={handleOpenFile}
        onActiveLibraryFileChange={setActiveLibraryFile}
      />

      {!railCollapsed ? (
        <button
          type="button"
          className="rail-backdrop"
          aria-label="Hide settings"
          onClick={handleToggleRail}
        />
      ) : null}

      <main id="journal-main" className="desk" ref={deskRef} tabIndex={-1}>
        <h1 className="visually-hidden">Scripture Journal</h1>
        <div className="topbar">
          <div className="topbar-head">
            {railCollapsed ? (
              <button
                type="button"
                className="rail-toggle is-label topbar-settings"
                aria-expanded={false}
                aria-controls="settings-rail"
                aria-label="Show settings"
                onClick={handleToggleRail}
              >
                <svg
                  className="topbar-settings-icon topbar-settings-icon--chevron"
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
                <svg
                  className="topbar-settings-icon topbar-settings-icon--gear"
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
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span className="topbar-btn-label">Settings</span>
              </button>
            ) : null}
            <div className="topbar-copy">
              <div className="topbar-reference">{referenceLabel}</div>
              <div
                className={`topbar-status${failed || fileStatus ? " is-error" : ""}`}
                role="status"
                aria-live="polite"
              >
                {statusText}
              </div>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="topbar-tools">
              <Suspense>
                <AppNav />
              </Suspense>
              <div className="zoom-row">
                <ZoomControl
                  fit={zoomFit}
                  scale={scale}
                  onFitChange={setZoomFit}
                  onScaleChange={setCustomScale}
                />

                <button
                  type="button"
                  className="download-button"
                  onClick={() => window.print()}
                  disabled={!canPrint}
                  aria-label="Print or save as PDF"
                  title={
                    canPrint
                      ? `Print or save as PDF — ${pageCountLabel}`
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
            <Suspense>
              <div className="topbar-account">
                <AccountControl />
              </div>
            </Suspense>
          </div>
        </div>

        <div
          className="preview-stage"
          ref={stageRef}
          tabIndex={0}
          role="region"
          aria-label="Journal page preview"
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

      <AccountSidecar open={accountOpen} onClose={handleCloseAccount} />
    </div>
    </JournalUiProvider>
  );
}
