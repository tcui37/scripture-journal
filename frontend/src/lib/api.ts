import type {
  BibleSummary,
  Book,
  LanguageSummary,
  Passage,
  Reference,
} from "./types";

/** A non-2xx answer from the API, keeping the status so callers can tell a
 * licence rejection (4xx, final) from an upstream hiccup (5xx, retryable). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body) => body?.detail)
      .catch(() => null);
    throw new ApiError(detail ?? `HTTP ${response.status}`, response.status);
  }

  return response.json() as Promise<T>;
}

export const fetchLanguages = (signal: AbortSignal) =>
  getJson<LanguageSummary[]>("/api/languages", signal);

export const fetchBibles = (language: string, signal: AbortSignal) =>
  getJson<BibleSummary[]>(`/api/bibles?language=${encodeURIComponent(language)}`, signal);

export const fetchBooks = (bibleId: string, signal: AbortSignal) =>
  getJson<Book[]>(`/api/bibles/${bibleId}/books`, signal);

export const fetchVerseNumbers = (
  bibleId: string,
  bookId: string,
  chapter: string,
  signal: AbortSignal,
) =>
  getJson<string[]>(
    `/api/bibles/${bibleId}/books/${bookId}/chapters/${chapter}/verses`,
    signal,
  );

export const fetchPassage = (
  bibleId: string,
  reference: Reference,
  signal: AbortSignal,
) => {
  const { bookId, startChapter, startVerse, endChapter, endVerse } = reference;
  const query = new URLSearchParams({
    start_chapter: startChapter,
    start_verse: startVerse,
    end_chapter: endChapter,
    end_verse: endVerse,
  });
  return getJson<Passage>(
    `/api/bibles/${bibleId}/books/${bookId}/passage?${query}`,
    signal,
  );
};
