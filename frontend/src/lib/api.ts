import type { BibleSummary, Book, Passage, Reference } from "./types";

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body) => body?.detail)
      .catch(() => null);
    throw new Error(detail ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const fetchBibles = (signal: AbortSignal) =>
  getJson<BibleSummary[]>("/api/bibles", signal);

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

export const fetchPassage = (reference: Reference, signal: AbortSignal) => {
  const { bibleId, bookId, startChapter, startVerse, endChapter, endVerse } = reference;
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
