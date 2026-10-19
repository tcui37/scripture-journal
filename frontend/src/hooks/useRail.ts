"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { restoreFocusFromPanel } from "@/lib/focus";
import { narrowUiQuery, railCollapsedAfterViewportChange, startRailCollapsed } from "@/lib/layout";
import { useJournalStore } from "@/lib/store";

const SETTINGS_RAIL_ID = "settings-rail";
const SETTINGS_FOCUS_FALLBACKS = [".topbar-settings", "#journal-main"] as const;

const isNarrow = () => window.matchMedia(narrowUiQuery()).matches;

function restoreSettingsFocus(): void {
  restoreFocusFromPanel(document.getElementById(SETTINGS_RAIL_ID), SETTINGS_FOCUS_FALLBACKS);
}

interface RailOptions {
  hydrated: boolean;
  /** Files was asked for in the URL, so the rail must start open. */
  filesRequested: boolean;
  filesPanelOpen: boolean;
  accountOpen: boolean;
  setAccountOpen: (open: boolean) => void;
}

/**
 * The settings rail: open or collapsed, a drawer on phones and a column on
 * desktop. The desktop choice is remembered; phones always start it closed.
 */
export function useRail({
  hydrated,
  filesRequested,
  filesPanelOpen,
  accountOpen,
  setAccountOpen,
}: RailOptions) {
  // When Files is deep-linked the rail must start open — avoids a collapsed flash.
  const [railCollapsed, setRailCollapsed] = useState(() => !filesRequested);
  const setRailPreference = useJournalStore((state) => state.setRailPreference);
  const railCollapsedRef = useRef(railCollapsed);
  railCollapsedRef.current = railCollapsed;

  // Saved state read back: start from the remembered desktop preference.
  useEffect(() => {
    if (!hydrated) return;
    const stored = useJournalStore.getState().railPreference;
    setRailCollapsed(startRailCollapsed(isNarrow(), filesRequested, stored));
    // Once, when hydration completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Phone layout forces the rail closed; only desktop state is a preference.
  useEffect(() => {
    if (hydrated && !isNarrow()) setRailPreference(railCollapsed);
  }, [hydrated, railCollapsed, setRailPreference]);

  useEffect(() => {
    const mq = window.matchMedia(narrowUiQuery());
    const syncRail = () => {
      const stored = useJournalStore.getState().railPreference;
      setRailCollapsed((current) =>
        railCollapsedAfterViewportChange(mq.matches, filesPanelOpen, current, stored),
      );
    };
    mq.addEventListener("change", syncRail);
    return () => mq.removeEventListener("change", syncRail);
  }, [filesPanelOpen]);

  // Files lives in the rail, so showing it opens the rail and closes Account.
  useEffect(() => {
    if (!hydrated || !filesPanelOpen) return;
    if (accountOpen) setAccountOpen(false);
    if (railCollapsed) setRailCollapsed(false);
  }, [hydrated, filesPanelOpen, accountOpen, railCollapsed, setAccountOpen]);

  useEffect(() => {
    if (!railCollapsed) return;
    restoreSettingsFocus();
  }, [railCollapsed]);

  useEffect(() => {
    if (railCollapsed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isNarrow()) return;
      setRailCollapsed(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [railCollapsed]);

  useEffect(() => {
    const syncOverlay = () => {
      const overlay = isNarrow() && (!railCollapsed || accountOpen);
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

  const toggleRail = useCallback(() => {
    const opening = railCollapsedRef.current;
    if (!opening) restoreSettingsFocus();
    // On a phone the rail and Account are both drawers; only one at a time.
    if (opening && isNarrow()) setAccountOpen(false);
    setRailCollapsed(!opening);
  }, [setAccountOpen]);

  return { railCollapsed, setRailCollapsed, toggleRail };
}
