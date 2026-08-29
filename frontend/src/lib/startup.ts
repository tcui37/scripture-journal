import type { WaitForApiOptions } from "./warmup";

/** True when the UI is served from a local dev origin. */
export function isLocalDevHost(hostname = ""): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/** Warmup tuned for local FastAPI — fail fast, retry briefly. */
export function localWarmupOptions(): WaitForApiOptions {
  return {
    budgetMs: 12_000,
    attemptTimeoutMs: 5_000,
    gapsMs: [0, 400, 1_000],
  };
}

/** Production / Vercel — tolerate cold starts. */
export function remoteWarmupOptions(): WaitForApiOptions {
  return {
    budgetMs: 45_000,
    attemptTimeoutMs: 20_000,
    gapsMs: [0, 1_500, 3_000],
  };
}

export function warmupOptionsForHost(hostname: string): WaitForApiOptions {
  return isLocalDevHost(hostname) ? localWarmupOptions() : remoteWarmupOptions();
}
