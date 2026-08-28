"use client";

import { useAuth } from "./AuthProvider";

/** Spinner while the serverless API cold-starts; retry if the ping fails. */
export default function ApiWarmup() {
  const { apiStatus, retryWarmup } = useAuth();

  if (apiStatus === "ok") return null;

  if (apiStatus === "error") {
    return (
      <button type="button" className="api-warmup is-error" onClick={retryWarmup}>
        <span className="api-warmup-text">Server didn’t start — retry</span>
      </button>
    );
  }

  return (
    <span className="api-warmup" role="status">
      <span className="api-warmup-spinner" aria-hidden="true" />
      <span className="api-warmup-text">Starting server…</span>
    </span>
  );
}
