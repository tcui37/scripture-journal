"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import GuestPrompt from "@/components/GuestPrompt";
import PanelSkeleton from "@/components/PanelSkeleton";
import TrashButton from "@/components/TrashButton";
import { useAuth } from "@/components/AuthProvider";
import {
  createFile,
  deleteFile,
  fileCreateBody,
  formatPassageLabel,
  friendlyAccountError,
  listFiles,
  newestFirst,
} from "@/lib/account";
import { STORAGE_KEY } from "@/lib/constants";
import type { JournalFile, Reference, Settings } from "@/lib/types";

function readJournalSnapshot(): { settings?: Partial<Settings>; reference?: Partial<Reference> } | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as {
      settings?: Partial<Settings>;
      reference?: Partial<Reference>;
    };
  } catch {
    return null;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function FilesPanel() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [files, setFiles] = useState<JournalFile[]>([]);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ReturnType<typeof readJournalSnapshot>>(null);
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => {
    setSnapshot(readJournalSnapshot());
  }, []);

  useEffect(() => {
    if (!user) {
      setFiles([]);
      setListLoading(false);
      return;
    }

    let cancelled = false;
    setListLoading(true);
    listFiles()
      .then((rows) => {
        if (!cancelled) {
          setFiles(newestFirst(rows));
          setStatus("");
          setFailed(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFailed(true);
          setStatus(friendlyAccountError(error, "files"));
        }
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const preview = useMemo(() => {
    if (!snapshot?.reference) return null;
    try {
      return formatPassageLabel(fileCreateBody("preview", snapshot));
    } catch {
      return null;
    }
  }, [snapshot]);

  const notice = (text: string, error = false) => {
    setFailed(error);
    setStatus(text);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      notice("Give this file a name.", true);
      return;
    }
    const current = readJournalSnapshot();
    if (!current?.reference && !current?.settings) {
      notice("Open the journal first so there is something to save.", true);
      return;
    }
    setBusy(true);
    try {
      const saved = await createFile(fileCreateBody(trimmed, current));
      setFiles((prev) => newestFirst([saved, ...prev.filter((row) => row.id !== saved.id)]));
      setName("");
      setSnapshot(current);
      notice("Saved. Find it in the library below.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Could not save file", true);
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
      notice("Removed from your library.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Could not delete file", true);
    } finally {
      setBusy(false);
    }
  };

  if (loading || listLoading) {
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
    <>
      <section className="library-block">
        <h2 className="library-block-title">Save</h2>
        <div className="library-block-body">
          {preview ? (
            <p className="panel-note">
              Current journal: <strong>{preview}</strong>
            </p>
          ) : (
            <p className="panel-note">
              No journal snapshot yet. Open the journal and pick a passage first.
            </p>
          )}
          <div className="save-row">
            <label className="control save-row-field">
              <span className="control-label">Name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="John 3 notes…"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSave();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="action-button action-button-inline"
              onClick={() => void handleSave()}
              disabled={busy}
            >
              Save
            </button>
          </div>
        </div>
      </section>

      <section className="library-block">
        <h2 className="library-block-title">Library</h2>
        <div className="library-block-body">
          {files.length ? (
            <ul className="record-list">
              {files.map((file) => (
                <li key={file.id} className="record-row">
                  <div className="record-copy">
                    <div className="record-name">{file.name}</div>
                    <div className="record-meta">
                      {formatPassageLabel(file)}
                      {" · "}
                      {formatDate(file.updated_at || file.created_at)}
                    </div>
                  </div>
                  <div className="record-actions">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        const ok = window.confirm(
                          `Open “${file.name}”? This replaces the passage and layout on screen.`,
                        );
                        if (!ok) return;
                        router.push(`/?file=${encodeURIComponent(file.id)}`);
                      }}
                    >
                      Open
                    </button>
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
              No files yet. Name the journal above, then Save — it will show up here.
            </p>
          )}
        </div>
      </section>

      {status ? (
        <div className={failed ? "warning" : "summary"} role={failed ? "alert" : "status"}>
          {status}
        </div>
      ) : null}
    </>
  );
}
