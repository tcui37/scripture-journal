export type WarmupStatus = "warming" | "ok" | "error";

const ATTEMPT_GAPS_MS = [0, 1500, 3000];
const ATTEMPT_TIMEOUT_MS = 20_000;
/** Keep pinging through a Vercel Python cold start / local boot. */
const BUDGET_MS = 45_000;

export type WaitForApiOptions = {
  budgetMs?: number;
  attemptTimeoutMs?: number;
  gapsMs?: readonly number[];
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
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
export async function waitForApi(
  signal?: AbortSignal,
  options?: WaitForApiOptions,
): Promise<void> {
  const budgetMs = options?.budgetMs ?? BUDGET_MS;
  const attemptTimeoutMs = options?.attemptTimeoutMs ?? ATTEMPT_TIMEOUT_MS;
  const gaps = options?.gapsMs ?? ATTEMPT_GAPS_MS;
  const started = Date.now();
  let lastError: unknown;
  let attempt = 0;

  while (true) {
    const gap = gaps[Math.min(attempt, gaps.length - 1)] ?? 0;
    if (attempt > 0 && Date.now() - started >= budgetMs) break;
    await sleep(gap, signal);

    const ping = new AbortController();
    const onAbort = () => ping.abort();
    signal?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => ping.abort(), attemptTimeoutMs);
    try {
      const response = await fetch("/api/health", {
        cache: "no-store",
        signal: ping.signal,
      });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
    attempt += 1;
  }

  throw lastError instanceof Error ? lastError : new Error("API did not start");
}
