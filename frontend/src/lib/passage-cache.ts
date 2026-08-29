import { fetchPassage } from "./api";
import type { Passage, Reference } from "./types";

/** Stable cache key for a bible + reference range. */
export function passageCacheKey(bibleId: string, reference: Reference): string {
  const { bookId, startChapter, startVerse, endChapter, endVerse } = reference;
  return `${bibleId}|${bookId}|${startChapter}:${startVerse}-${endChapter}:${endVerse}`;
}

const cache = new Map<string, Passage>();

/** In-flight deduplication — concurrent requests for the same passage share one fetch. */
const inflight = new Map<string, Promise<Passage>>();

export function peekPassageCache(bibleId: string, reference: Reference): Passage | undefined {
  return cache.get(passageCacheKey(bibleId, reference));
}

export function clearPassageCache(): void {
  cache.clear();
  inflight.clear();
}

/** Fetch a passage once; reuse for preview, library page counts, and file open. */
export async function fetchPassageCached(
  bibleId: string,
  reference: Reference,
  signal: AbortSignal,
): Promise<Passage> {
  const key = passageCacheKey(bibleId, reference);
  const hit = cache.get(key);
  if (hit) return hit;

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = fetchPassage(bibleId, reference, signal)
    .then((passage) => {
      cache.set(key, passage);
      inflight.delete(key);
      return passage;
    })
    .catch((error) => {
      inflight.delete(key);
      throw error;
    });

  inflight.set(key, request);
  return request;
}
