"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePendingFile } from "@/hooks/usePendingFile";
import { usePreviewZoom } from "@/hooks/usePreviewZoom";
import { useRail } from "@/hooks/useRail";
import { useScripture } from "@/hooks/useScripture";
import { journalFileState } from "@/lib/account";
import { readJournalPanelsFromSearch, resolveLandingPanels, syncJournalUrl } from "@/lib/journal-url";
import { cssPageSize } from "@/lib/constants";
import { printFilename } from "@/lib/filename";
import { narrowUiQuery } from "@/lib/layout";
import { licenceText, referenceLabel as nameRange } from "@/lib/licence";
import {
  formatPageCountLabel,
  paginatePassages,
  printedPageCount,
} from "@/lib/typeset";
import { Measurer } from "@/lib/typeset";
import { orderedSides } from "@/lib/typeset";
import { pageDimensions, singleTextGeometry } from "@/lib/typeset";
import { hydrateJournalStore, useJournalStore } from "@/lib/store";
import type { JournalFile } from "@/lib/types";

import AppNav, { AccountControl } from "./AppNav";
import AccountSidecar from "./AccountSidecar";
import { useAuth } from "./AuthProvider";
import { JournalUiProvider } from "./JournalUiContext";
import { useLibrary } from "./LibraryProvider";
import PageStack from "./PageStack";
import Sidebar, { type RailView } from "./Sidebar";
import ZoomControl from "./ZoomControl";

const APP_TITLE = "Scripture Journal";

const isNarrow = () => window.matchMedia(narrowUiQuery()).matches;

export default function JournalApp() {
  const searchParams = useSearchParams();
  const landingPanels = readJournalPanelsFromSearch(searchParams);
  const resolvedLanding = resolveLandingPanels(landingPanels);
  const { user, sessionReady, apiStatus } = useAuth();
  const { cacheFile } = useLibrary();

  // Saved state lives in localStorage, which is only readable after mount —
  // the data fetches wait for it so the defaults are never loaded first.
  const hydrated = useJournalStore((state) => state.hydrated);
  useEffect(() => {
    void hydrateJournalStore();
  }, []);

  const settings = useJournalStore((state) => state.settings);
  const patchSettings = useJournalStore((state) => state.patchSettings);
  const replaceSettings = useJournalStore((state) => state.replaceSettings);
  const openSections = useJournalStore((state) => state.openSections);
  const setSectionOpen = useJournalStore((state) => state.setSectionOpen);

  const [filesOpen, setFilesOpen] = useState(resolvedLanding.files);
  const [accountOpen, setAccountOpen] = useState(resolvedLanding.account);
  // Hide Files until the session is known so guests never flash that panel.
  const filesPanelOpen = Boolean(user) && filesOpen;
  const railView: RailView = filesPanelOpen ? "files" : "design";
  const [fileStatus, setFileStatus] = useState("");
  const [activeLibraryFile, setActiveLibraryFile] = useState<JournalFile | null>(null);
  const [designFocusToken, setDesignFocusToken] = useState(0);

  const ready = hydrated && apiStatus === "ok";
  const scripture = useScripture(ready);
  const { reference, passage, comparePassage, status, failed, setReference } = scripture;
  const referenceRef = useRef(reference);
  referenceRef.current = reference;

  const { railCollapsed, setRailCollapsed, toggleRail } = useRail({
    hydrated,
    filesRequested: resolvedLanding.files,
    filesPanelOpen,
    accountOpen,
    setAccountOpen,
  });
  const accountOpenRef = useRef(accountOpen);
  accountOpenRef.current = accountOpen;

  /* ── files ───────────────────────────────────────────────────────────── */

  const handleOpenFile = useCallback(
    (file: JournalFile) => {
      const next = journalFileState(file, referenceRef.current);
      replaceSettings(next.settings);
      setReference(next.reference);
      setActiveLibraryFile(file);
      setFileStatus("");
      cacheFile(file);
    },
    [cacheFile, replaceSettings, setReference],
  );

  usePendingFile(landingPanels.fileId, ready, handleOpenFile, setFileStatus);

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

  const sheet = pageDimensions(settings);
  const { deskRef, stageRef, zoomFit, setZoomFit, scale, setCustomScale } = usePreviewZoom(
    sheet.width,
    railCollapsed,
  );

  /* ── panels ──────────────────────────────────────────────────────────── */

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
        setSectionOpen("designs", true);
        setRailCollapsed(false);
      }
    },
    [user, setRailCollapsed, setSectionOpen],
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

  const handleCloseAccount = useCallback(() => {
    setAccountOpen(false);
  }, []);

  const toggleAccount = useCallback(() => {
    const next = !accountOpenRef.current;
    setAccountOpen(next);
    // On a phone the rail and Account are both drawers; only one at a time.
    if (next && isNarrow()) setRailCollapsed(true);
  }, [setRailCollapsed]);

  useEffect(() => {
    if (railView !== "design" || designFocusToken === 0) return;
    requestAnimationFrame(() => {
      document.getElementById("rail-designs")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [railView, openSections.designs, designFocusToken]);

  /* ── derived ─────────────────────────────────────────────────────────── */

  const bookName = scripture.book?.name;
  const { limitCheck } = scripture;

  const { citation, sources, copyright, notice } = useMemo(
    () =>
      licenceText(scripture.bibles, reference, settings.parallelSwap, passage, comparePassage),
    [scripture.bibles, reference, settings.parallelSwap, passage, comparePassage],
  );

  const referenceLabel = nameRange(bookName, reference);

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
        onSettingsChange={patchSettings}
        onToggleSection={setSectionOpen}
        onToggle={toggleRail}
        onOpenFile={handleOpenFile}
        onActiveLibraryFileChange={setActiveLibraryFile}
      />

      {!railCollapsed ? (
        <button
          type="button"
          className="rail-backdrop"
          aria-label="Hide settings"
          onClick={toggleRail}
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
                onClick={toggleRail}
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
                title={statusText}
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
