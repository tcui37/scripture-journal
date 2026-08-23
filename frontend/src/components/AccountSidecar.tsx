"use client";

import { useEffect } from "react";

import AccountPanel from "./AccountPanel";

interface AccountSidecarProps {
  onClose: () => void;
}

export default function AccountSidecar({ onClose }: AccountSidecarProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        className="sidecar-backdrop"
        aria-label="Close account"
        onClick={onClose}
      />
      <aside id="account-sidecar" className="sidecar" aria-label="Account">
        <div className="sidecar-header">
          <div className="sidecar-heading">
            <h2 className="sidecar-title">Account</h2>
            <button
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
