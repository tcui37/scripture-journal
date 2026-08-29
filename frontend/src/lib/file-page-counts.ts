import { referenceFromJournalFile } from "./account";
import { fetchPassageCached } from "./passage-cache";
import { countPrintedPages } from "./pages";
import type { Measurer } from "./paginate";
import type { JournalFile } from "./types";

const DEFAULT_CONCURRENCY = 3;

/**
 * Run async work on `items` with at most `concurrency` tasks in flight.
 * Preserves result order matching `items`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const limit = Math.max(1, concurrency);
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function run(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

/** Page counts for library rows — bounded parallelism, skips failures. */
export async function computeFilePageCounts(
  files: readonly JournalFile[],
  bibleId: string,
  compareId: string,
  measurer: Measurer,
  signal: AbortSignal,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<Record<string, number>> {
  if (!files.length || !bibleId) return {};

  const entries = await mapWithConcurrency(files, concurrency, async (file) => {
    try {
      const fileReference = referenceFromJournalFile(file, bibleId, compareId);
      const primary = await fetchPassageCached(bibleId, fileReference, signal);
      const secondary = compareId
        ? await fetchPassageCached(compareId, fileReference, signal)
        : null;
      const count = countPrintedPages(primary, secondary, file.design, measurer);
      return [file.id, count] as const;
    } catch {
      return null;
    }
  });

  const next: Record<string, number> = {};
  for (const entry of entries) {
    if (entry) next[entry[0]] = entry[1];
  }
  return next;
}

export { DEFAULT_CONCURRENCY as FILE_PAGE_COUNT_CONCURRENCY };
