export type WarmupStatus = "warming" | "ok" | "error";

const ATTEMPT_GAPS_MS = [0, 1500, 3000];
const ATTEMPT_TIMEOUT_MS = 20_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Ping the cheap health route until the API process is up. No catalogue or scripture. */
export async function waitForApi(signal?: AbortSignal): Promise<void> {
  let lastError: unknown;
  for (const gap of ATTEMPT_GAPS_MS) {
    await sleep(gap, signal);
    const attempt = new AbortController();
    const onAbort = () => attempt.abort();
    signal?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => attempt.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      const response = await fetch("/api/health", {
        cache: "no-store",
        signal: attempt.signal,
      });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("API did not start");
}
