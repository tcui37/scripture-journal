"use client";

import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import GuestPrompt from "@/components/GuestPrompt";
import PanelSkeleton from "@/components/PanelSkeleton";
import TrashButton from "@/components/TrashButton";
import { useAuth } from "@/components/AuthProvider";
import { useLibrary } from "@/components/LibraryProvider";
import { fetchPassage } from "@/lib/api";
import {
  createFile,
  defaultLibraryFileName,
  deleteFile,
  fileCreateBody,
  formatPassageDisplay,
  friendlyAccountError,
  newestFirst,
  passageFromReference,
  referenceFromJournalFile,
  updateFile,
} from "@/lib/account";
import { countPrintedPages, formatFileMetaLine } from "@/lib/pages";
import { Measurer } from "@/lib/paginate";
import type { JournalFile, Reference, Settings } from "@/lib/types";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function useDialogA11y(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
  returnFocusRef?: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previously = document.activeElement as HTMLElement | null;

    const items = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    requestAnimationFrame(() => {
      const initial = initialFocusRef?.current;
      if (initial) {
        initial.focus();
        if (initial instanceof HTMLInputElement) initial.select();
      } else {
        items()[0]?.focus();
      }
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previously && document.contains(previously)) previously.focus();
      else returnFocusRef?.current?.focus();
    };
  }, [open, panelRef, returnFocusRef, initialFocusRef]);
}

function PencilButton({
  disabled,
  onClick,
  label,
}: {
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}

interface FilesPanelProps {
  reference: Reference;
  settings: Settings;
  bookName?: string;
  activeLibraryFile: JournalFile | null;
  onOpenFile: (file: JournalFile) => void;
  onActiveLibraryFileChange: (file: JournalFile | null) => void;
}

export default function FilesPanel({
  reference,
  settings,
  bookName,
  activeLibraryFile,
  onOpenFile,
  onActiveLibraryFileChange,
}: FilesPanelProps) {
  const { user, loading } = useAuth();
  const {
    files,
    setFiles,
    filesLoading,
    filesStatus,
    filesFailed,
  } = useLibrary();
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [renameTarget, setRenameTarget] = useState<JournalFile | null>(null);
  const [renameName, setRenameName] = useState("");
  const [mounted, setMounted] = useState(false);
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});

  const measurerRef = useRef<Measurer | null>(null);
  const [measureReady, setMeasureReady] = useState(false);

  const saveTitleId = useId();
  const renameTitleId = useId();
  const saveTriggerRef = useRef<HTMLButtonElement>(null);
  const savePanelRef = useRef<HTMLDivElement>(null);
  const renamePanelRef = useRef<HTMLDivElement>(null);
  const saveNameRef = useRef<HTMLInputElement>(null);
  const renameNameRef = useRef<HTMLInputElement>(null);

  const passage = useMemo(() => passageFromReference(reference), [reference]);

  const passageLabel = useMemo(
    () => formatPassageDisplay(passage, bookName),
    [passage, bookName],
  );

  const hasJournal = Boolean(reference.bookId);
  const defaultName = defaultLibraryFileName(passage, bookName);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const measurer = new Measurer();
    measurerRef.current = measurer;

    let cancelled = false;
    const markReady = () => {
      if (!cancelled) setMeasureReady(true);
    };

    if (document.fonts) void document.fonts.ready.then(markReady);
    else markReady();

    return () => {
      cancelled = true;
      measurer.destroy();
      measurerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const measurer = measurerRef.current;
    if (!measureReady || !measurer || !files.length || !reference.bibleId) {
      if (!files.length) setPageCounts({});
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      const next: Record<string, number> = {};
      await Promise.all(
        files.map(async (file) => {
          try {
            const fileReference = referenceFromJournalFile(
              file,
              reference.bibleId,
              reference.compareId,
            );
            const primary = await fetchPassage(
              reference.bibleId,
              fileReference,
              controller.signal,
            );
            const secondary = reference.compareId
              ? await fetchPassage(reference.compareId, fileReference, controller.signal)
              : null;
            if (cancelled) return;
            next[file.id] = countPrintedPages(primary, secondary, file.design, measurer);
          } catch {
            // Skip rows that fail to load while the list is still usable.
          }
        }),
      );
      if (!cancelled) setPageCounts(next);
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [files, measureReady, reference.bibleId, reference.compareId]);

  useEffect(() => {
    if (!filesStatus) return;
    setStatus(filesStatus);
    setFailed(filesFailed);
  }, [filesStatus, filesFailed]);

  useEffect(() => {
    if (!saveOpen) return;
    setSaveName(defaultName);
  }, [saveOpen, defaultName]);

  useEffect(() => {
    if (!renameTarget) return;
    setRenameName(renameTarget.name);
  }, [renameTarget]);

  useDialogA11y(saveOpen, () => setSaveOpen(false), savePanelRef, saveTriggerRef, saveNameRef);
  useDialogA11y(
    Boolean(renameTarget),
    () => setRenameTarget(null),
    renamePanelRef,
    undefined,
    renameNameRef,
  );

  const notice = (text: string, error = false) => {
    setFailed(error);
    setStatus(text);
  };

  const clearNotice = () => {
    setStatus("");
    setFailed(false);
  };

  const handleSave = async () => {
    const trimmedName = saveName.trim();
    if (!trimmedName) {
      notice("Give this file a name.", true);
      return;
    }
    if (!hasJournal) {
      notice("Choose a passage in Settings first.", true);
      return;
    }

    setBusy(true);
    clearNotice();
    try {
      const body = fileCreateBody(trimmedName, { reference, settings });
      const saved = await createFile(body);
      setFiles((prev) => newestFirst([saved, ...prev.filter((row) => row.id !== saved.id)]));
      onActiveLibraryFileChange(saved);
      setSaveOpen(false);
      notice(`Saved “${saved.name}”.`);
    } catch (error) {
      notice(error instanceof Error ? error.message : "Could not save file", true);
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const trimmedName = renameName.trim();
    if (!trimmedName) {
      notice("Give this file a name.", true);
      return;
    }

    setBusy(true);
    clearNotice();
    try {
      const updated = await updateFile(renameTarget.id, { name: trimmedName });
      setFiles((prev) =>
        newestFirst([updated, ...prev.filter((row) => row.id !== updated.id)]),
      );
      if (activeLibraryFile?.id === updated.id) {
        onActiveLibraryFileChange(updated);
      }
      setRenameTarget(null);
      notice(`Renamed to “${updated.name}”.`);
    } catch (error) {
      notice(error instanceof Error ? error.message : "Could not rename file", true);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (pendingDelete !== id) {
      setPendingDelete(id);
      notice("Press Confirm to remove this file.");
      return;
    }
    setBusy(true);
    try {
      await deleteFile(id);
      setFiles((prev) => prev.filter((row) => row.id !== id));
      setPendingDelete(null);
      if (activeLibraryFile?.id === id) {
        onActiveLibraryFileChange(null);
      }
      notice("Removed from your library.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Could not delete file", true);
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = (file: JournalFile) => {
    onOpenFile(file);
    onActiveLibraryFileChange(file);
    clearNotice();
  };

  const saveDialog =
    mounted && saveOpen
      ? createPortal(
          <div className="limits-dialog-root">
            <button
              type="button"
              className="limits-dialog-backdrop"
              aria-label="Close save dialog"
              onClick={() => setSaveOpen(false)}
            />
            <div
              ref={savePanelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={saveTitleId}
              className="limits-dialog"
            >
              <div className="limits-dialog-heading">
                <div>
                  <p className="limits-dialog-eyebrow">Library</p>
                  <h2 id={saveTitleId} className="limits-dialog-title">
                    Save current view
                  </h2>
                </div>
                <button
                  type="button"
                  className="icon-btn dialog-close"
                  aria-label="Close save dialog"
                  onClick={() => setSaveOpen(false)}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="limits-dialog-body">
                {hasJournal ? (
                  <>
                    <p className="panel-note">Saving the passage and layout on screen:</p>
                    <p className="passage-chip">{passageLabel}</p>
                  </>
                ) : (
                  <p className="panel-note">
                    Choose a passage in Settings first — then you can save it here.
                  </p>
                )}

                <label className="control">
                  <span className="control-label">Name</span>
                  <input
                    ref={saveNameRef}
                    type="text"
                    value={saveName}
                    onChange={(event) => setSaveName(event.target.value)}
                    placeholder={defaultName}
                    disabled={!hasJournal || busy}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleSave();
                      }
                    }}
                  />
                </label>

                <div className="dialog-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setSaveOpen(false)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-inline"
                    onClick={() => void handleSave()}
                    disabled={busy || !hasJournal || !saveName.trim()}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  const renameDialog =
    mounted && renameTarget
      ? createPortal(
          <div className="limits-dialog-root">
            <button
              type="button"
              className="limits-dialog-backdrop"
              aria-label="Close rename dialog"
              onClick={() => setRenameTarget(null)}
            />
            <div
              ref={renamePanelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={renameTitleId}
              className="limits-dialog"
            >
              <div className="limits-dialog-heading">
                <div>
                  <p className="limits-dialog-eyebrow">Library</p>
                  <h2 id={renameTitleId} className="limits-dialog-title">
                    Rename file
                  </h2>
                </div>
                <button
                  type="button"
                  className="icon-btn dialog-close"
                  aria-label="Close rename dialog"
                  onClick={() => setRenameTarget(null)}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="limits-dialog-body">
                <label className="control">
                  <span className="control-label">Name</span>
                  <input
                    ref={renameNameRef}
                    type="text"
                    value={renameName}
                    onChange={(event) => setRenameName(event.target.value)}
                    disabled={busy}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleRename();
                      }
                    }}
                  />
                </label>

                <div className="dialog-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setRenameTarget(null)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-inline"
                    onClick={() => void handleRename()}
                    disabled={busy || !renameName.trim()}
                  >
                    Rename
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  if (loading || (filesLoading && !files.length)) {
    return <PanelSkeleton label="Loading files…" />;
  }

  if (!user) {
    return (
      <GuestPrompt
        next="/?files=1"
        message="Sign in to save the journal you are working on and open it again later."
      />
    );
  }

  return (
    <div className="files-panel">
      <section className="library-block" aria-labelledby="files-heading">
        <div className="library-block-title-row">
          <h2 className="library-block-title" id="files-heading">
            Files
          </h2>
          <button
            ref={saveTriggerRef}
            type="button"
            className="btn btn-secondary btn-sm"
            aria-haspopup="dialog"
            aria-expanded={saveOpen}
            onClick={() => setSaveOpen(true)}
            disabled={busy}
            title={hasJournal ? "Save passage and layout as a new file" : "Choose a passage first"}
          >
            Save current view
          </button>
        </div>

        <div className="library-block-body">
          {files.length ? (
            <ul className="record-list">
              {files.map((file) => (
                <li
                  key={file.id}
                  className={`record-row${activeLibraryFile?.id === file.id ? " is-on" : ""}`}
                >
                  <button
                    type="button"
                    className="record-main"
                    onClick={() => handleOpen(file)}
                    aria-pressed={activeLibraryFile?.id === file.id}
                    title="Open this file"
                  >
                    <div className="record-copy">
                      <div className="record-name">{file.name}</div>
                      <div className="record-meta">
                        {formatFileMetaLine({
                          passage: formatPassageDisplay(file, bookName),
                          pageCount: pageCounts[file.id],
                          date: formatDate(file.updated_at || file.created_at),
                        })}
                      </div>
                    </div>
                  </button>
                  <div className="record-actions">
                    <PencilButton
                      label={`Rename ${file.name}`}
                      disabled={busy}
                      onClick={() => {
                        setRenameTarget(file);
                        clearNotice();
                      }}
                    />
                    <TrashButton
                      confirming={pendingDelete === file.id}
                      onClick={() => void handleDelete(file.id)}
                      disabled={busy}
                      label="Delete"
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel-note">
              No saved files yet. Use Save current view to keep the passage and layout on screen.
            </p>
          )}

          {status ? (
            <div className={failed ? "warning" : "summary"} role={failed ? "alert" : "status"}>
              {status}
            </div>
          ) : null}
        </div>
      </section>

      {saveDialog}
      {renameDialog}
    </div>
  );
}
