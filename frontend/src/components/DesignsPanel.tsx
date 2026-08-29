"use client";

import { useEffect, useState } from "react";

import GuestPrompt from "@/components/GuestPrompt";
import PanelSkeleton from "@/components/PanelSkeleton";
import TrashButton from "@/components/TrashButton";
import { useLibrary } from "@/components/LibraryProvider";
import {
  builtinDefaultDesign,
  createDesign,
  deleteDesign,
  friendlyAccountError,
  newestFirst,
  sameDesign,
} from "@/lib/account";
import type { AuthUser, Design, DesignRecord, Settings } from "@/lib/types";

interface DesignsPanelProps {
  user: AuthUser | null;
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  active?: boolean;
}

const BUILTIN_DEFAULT = builtinDefaultDesign();

export default function DesignsPanel({
  user,
  settings,
  onSettingsChange,
  active = false,
}: DesignsPanelProps) {
  const {
    designs,
    setDesigns,
    designsLoading,
    designsStatus,
    designsFailed,
    ensureDesignsLoaded,
  } = useLibrary();
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  useEffect(() => {
    if (active) ensureDesignsLoaded();
  }, [active, ensureDesignsLoaded]);

  useEffect(() => {
    if (!designsStatus) return;
    setStatus(designsStatus);
    setFailed(designsFailed);
  }, [designsStatus, designsFailed]);

  const notice = (text: string, error = false) => {
    setFailed(error);
    setStatus(text);
  };

  const apply = (design: Design, label: string, alreadyOn: boolean) => {
    if (
      !alreadyOn &&
      !window.confirm(
        `Apply “${label}”? The current layout will change. Save it under Designs first if you want to keep it.`,
      )
    ) {
      return;
    }
    onSettingsChange(design);
    notice(alreadyOn ? "This design is already in use." : "Applied. The page preview uses this layout.");
  };

  const renderBuiltinRow = () => {
    const applied = sameDesign(BUILTIN_DEFAULT.settings, settings);
    return (
      <li
        key={BUILTIN_DEFAULT.id}
        className={`record-row is-builtin${applied ? " is-on" : ""}`}
      >
        <button
          type="button"
          className="record-main"
          onClick={() => apply(BUILTIN_DEFAULT.settings, BUILTIN_DEFAULT.name, applied)}
          aria-pressed={applied}
          title="Apply the journal default layout"
        >
          <span className="record-name">{BUILTIN_DEFAULT.name}</span>
          {applied ? <span className="record-badge">In use</span> : null}
        </button>
      </li>
    );
  };

  if (!user) {
    return (
      <div className="designs-panel" id="rail-designs">
        <p className="panel-note">Layout, type, and text styles — not scripture or translation.</p>
        <ul className="record-list">{renderBuiltinRow()}</ul>
        <GuestPrompt
          next="/"
          message="Sign in to save your own layouts alongside the journal default."
        />
      </div>
    );
  }

  if (designsLoading && !designs.length) {
    return <PanelSkeleton label="Loading designs…" />;
  }

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
      notice("Saved. Apply it from the list below.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Could not save design", true);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (pendingRemove !== id) {
      setPendingRemove(id);
      notice("Press Confirm to remove this design.");
      return;
    }
    setBusy(true);
    try {
      await deleteDesign(id);
      setDesigns((prev) => prev.filter((row) => row.id !== id));
      setPendingRemove(null);
      notice("Removed from your designs.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Could not remove design", true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="designs-panel" id="rail-designs">
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
          className="btn btn-primary btn-inline"
          onClick={() => void handleSave()}
          disabled={busy}
        >
          Save
        </button>
      </div>

      <ul className="record-list">
        {renderBuiltinRow()}
        {designs.map((row) => {
          const applied = sameDesign(row.settings, settings);
          return (
            <li key={row.id} className={`record-row${applied ? " is-on" : ""}`}>
              <button
                type="button"
                className="record-main"
                onClick={() => apply(row.settings, row.name, applied)}
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

      {designs.length === 0 ? (
        <p className="panel-note">
          No saved designs yet. Set the page how you like it, name it, and Save — it will show up
          above.
        </p>
      ) : null}

      {status ? (
        <div className={failed ? "warning" : "summary"} role={failed ? "alert" : "status"}>
          {status}
        </div>
      ) : null}
    </div>
  );
}
