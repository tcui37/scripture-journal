/**
 * Every scripture request the app makes, as TanStack Query definitions.
 *
 * One `queryClient` for the whole app: React reads through `useQuery`, and
 * plain code (library page counts) through `queryClient.fetchQuery`, so a
 * passage fetched for the preview is the same entry the library reuses.
 * Scripture does not change under us, so nothing goes stale in a session.
 */

import { QueryClient, queryOptions } from "@tanstack/react-query";

import {
  ApiError,
  fetchBibles,
  fetchBooks,
  fetchLanguages,
  fetchPassage,
  fetchVerseNumbers,
} from "./api";
import type { Passage, Reference } from "./types";

/** One retry, and only for failures a retry can fix: the network or a 5xx.
 * A 4xx (a licence cap, an unknown id) is final, and api.bible bills retries. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof DOMException && error.name === "AbortError") return false;
  return !(error instanceof ApiError) || error.status >= 500;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: 30 * 60 * 1000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
}

export const queryClient = createQueryClient();

export const languagesQuery = () =>
  queryOptions({
    queryKey: ["languages"],
    queryFn: ({ signal }) => fetchLanguages(signal),
  });

export const biblesQuery = (language: string) =>
  queryOptions({
    queryKey: ["bibles", language],
    queryFn: ({ signal }) => fetchBibles(language, signal),
  });

export const booksQuery = (bibleId: string) =>
  queryOptions({
    queryKey: ["books", bibleId],
    queryFn: ({ signal }) => fetchBooks(bibleId, signal),
  });

export const versesQuery = (bibleId: string, bookId: string, chapter: string) =>
  queryOptions({
    queryKey: ["verses", bibleId, bookId, chapter],
    queryFn: ({ signal }) => fetchVerseNumbers(bibleId, bookId, chapter, signal),
  });

/** The range alone, so the same passage is one entry whatever else differs. */
export const rangeKey = ({ bookId, startChapter, startVerse, endChapter, endVerse }: Reference) =>
  [bookId, startChapter, startVerse, endChapter, endVerse] as const;

export const passageQuery = (bibleId: string, reference: Reference) =>
  queryOptions({
    queryKey: ["passage", bibleId, ...rangeKey(reference)],
    queryFn: ({ signal }) => fetchPassage(bibleId, reference, signal),
  });

export interface PassagePair {
  primary: Passage;
  compare: Passage | null;
}

/**
 * The primary and compare passages as one result, so the preview never pairs
 * a new primary with the previous compare text. Each side is still its own
 * cached `passageQuery`, shared with the library.
 */
export const passagePairQuery = (reference: Reference, client: QueryClient = queryClient) =>
  queryOptions({
    queryKey: ["passage-pair", reference.bibleId, reference.compareId, ...rangeKey(reference)],
    queryFn: async (): Promise<PassagePair> => {
      const [primary, compare] = await Promise.all([
        client.fetchQuery(passageQuery(reference.bibleId, reference)),
        reference.compareId
          ? client.fetchQuery(passageQuery(reference.compareId, reference))
          : Promise.resolve(null),
      ]);
      return { primary, compare };
    },
  });
