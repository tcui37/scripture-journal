"use client";

import { useEffect, useRef } from "react";

import { FOCUSABLE, restoreFocusFromPanel } from "@/lib/focus";

import AccountPanel from "./AccountPanel";

interface AccountSidecarProps {
  open: boolean;
  onClose: () => void;
}

export default function AccountSidecar({ open, onClose }: AccountSidecarProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
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

    closeRef.current?.focus();

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
      const panel = panelRef.current;
      if (
        !restoreFocusFromPanel(panel, [".account-icon.is-label", ".app-nav-tab", "#journal-main"]) &&
        previously &&
        document.contains(previously)
      ) {
        previously.focus();
      }
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`sidecar-backdrop${open ? " is-open" : ""}`}
        aria-label="Close account"
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        id="account-sidecar"
        className={`sidecar${open ? " is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-sidecar-title"
        aria-hidden={!open}
        {...(!open ? { inert: true } : {})}
      >
        <div className="sidecar-header">
          <div className="sidecar-heading">
            <h2 id="account-sidecar-title" className="sidecar-title">
              Account
            </h2>
            <button
              ref={closeRef}
              type="button"
              className="rail-toggle"
              aria-controls="account-sidecar"
              aria-label="Close account"
              onClick={onClose}
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
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
          <p className="sidecar-tagline">Email, password, and sign out.</p>
        </div>
        <div className="sidecar-body">
          <AccountPanel />
        </div>
      </aside>
    </>
  );
}
