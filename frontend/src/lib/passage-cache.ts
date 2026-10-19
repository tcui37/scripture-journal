/**
 * Passages for code outside React (library page counts), from the same
 * TanStack Query cache the preview uses — one fetch per bible and range.
 */

import { passageQuery, queryClient } from "./queries";
import type { Passage, Reference } from "./types";

export function peekPassageCache(bibleId: string, reference: Reference): Passage | undefined {
  return queryClient.getQueryData(passageQuery(bibleId, reference).queryKey);
}

export function clearPassageCache(): void {
  queryClient.removeQueries({ queryKey: ["passage"] });
  queryClient.removeQueries({ queryKey: ["passage-pair"] });
}

/**
 * Fetch a passage once; reuse for preview, library page counts, and file open.
 *
 * `signal` abandons only this caller's wait: the request itself is shared,
 * so it carries on for anyone else waiting and is cached when it lands.
 */
export function fetchPassageCached(
  bibleId: string,
  reference: Reference,
  signal: AbortSignal,
): Promise<Passage> {
  const request = queryClient.fetchQuery(passageQuery(bibleId, reference));
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    request.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
