"use client";

import { useEffect, useState } from "react";

import GuestPrompt from "@/components/GuestPrompt";
import TrashButton from "@/components/TrashButton";
import {
  createDesign,
  deleteDesign,
  listDesigns,
  newestFirst,
  sameDesign,
} from "@/lib/account";
import type { AuthUser, Design, DesignRecord, Settings } from "@/lib/types";

interface DesignsPanelProps {
  user: AuthUser | null;
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
}

export default function DesignsPanel({ user, settings, onSettingsChange }: DesignsPanelProps) {
  const [name, setName] = useState("");
  const [designs, setDesigns] = useState<DesignRecord[]>([]);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setDesigns([]);
      return;
    }

    let cancelled = false;
    listDesigns()
      .then((rows) => {
        if (!cancelled) {
          setDesigns(newestFirst(rows));
          setStatus("");
          setFailed(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFailed(true);
          setStatus(error instanceof Error ? error.message : "Could not load designs");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) {
    return (
      <GuestPrompt
        next="/"
        message="A Design is layout, type, and text styles — not scripture or translation. Sign in to save, apply, and remove them."
      />
    );
  }

  const notice = (text: string, error = false) => {
    setFailed(error);
    setStatus(text);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      notice("Give this design a name.", true);
      return;
    }
    setBusy(true);
    try {
      const saved = await createDesign(trimmed, settings);
      setDesigns((prev) => newestFirst([saved, ...prev.filter((row) => row.id !== saved.id)]));
      setName("");
      notice("Saved.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Could not save design", true);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (pendingRemove !== id) {
      setPendingRemove(id);
      notice("Press the trash icon again to confirm.");
      return;
    }
    setBusy(true);
    try {
      await deleteDesign(id);
      setDesigns((prev) => prev.filter((row) => row.id !== id));
      setPendingRemove(null);
      notice("Removed.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Could not remove design", true);
    } finally {
      setBusy(false);
    }
  };

  const apply = (design: Design) => {
    onSettingsChange(design);
    notice("Applied.");
  };

  return (
    <>
      <p className="panel-note">Layout, type, and text styles — not scripture or translation.</p>
      <div className="save-row">
        <label className="control save-row-field">
          <span className="control-label">Name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Wide margin A5…"
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

      {designs.length ? (
        <ul className="record-list">
          {designs.map((row) => {
            const applied = sameDesign(row.settings, settings);
            return (
              <li key={row.id} className={`record-row${applied ? " is-on" : ""}`}>
                <button
                  type="button"
                  className="record-main"
                  onClick={() => apply(row.settings)}
                  aria-pressed={applied}
                  title="Apply this design"
                >
                  <span className="record-name">{row.name}</span>
                  {applied ? <span className="record-badge">In use</span> : null}
                </button>
                <TrashButton
                  confirming={pendingRemove === row.id}
                  onClick={() => void handleRemove(row.id)}
                  disabled={busy}
                  label="Remove"
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="panel-note">No designs yet. Set the page how you like it, name it, and save.</p>
      )}

      {status ? <div className={failed ? "warning" : "summary"}>{status}</div> : null}
    </>
  );
}
