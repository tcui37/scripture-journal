/** Mirrors the Pydantic models in backend/app/schemas.py. */

export interface BibleSummary {
  id: string;
  label: string;
}

export interface Chapter {
  number: string;
}

export interface Book {
  id: string;
  name: string;
  chapters: Chapter[];
}

export interface Segment {
  text: string;
  wj: boolean;
  italic: boolean;
}

export interface Verse {
  number: string | null;
  segments: Segment[];
}

export interface Paragraph {
  /** "chapter" marks a chapter boundary within a multi-chapter passage. */
  kind: "heading" | "text" | "chapter";
  style: string;
  heading: string;
  verses: Verse[];
}

export interface Passage {
  reference: string;
  copyright: string;
  paragraphs: Paragraph[];
}

export type Layout = "right" | "bottom" | "twocol" | "verso" | "wide";
export type LineStyle = "ruled" | "dots" | "blank";
export type FontChoice = "serif" | "sans";
export type NumberStyle = "sup" | "inline";
export type Flow = "para" | "line";
export type Paper = "Ivory" | "Bright white" | "Warm grey";

/** Everything that affects how a page is drawn. */
export interface Settings {
  layout: Layout;
  lines: LineStyle;
  font: FontChoice;
  size: number;
  lead: number;
  numbers: NumberStyle;
  flow: Flow;
  wordsOfChrist: boolean;
  pageNumbers: boolean;
  paper: Paper;
  justify: boolean;
  showHeadings: boolean;
  showChapterNumbers: boolean;
}

/**
 * Which passage is on screen. The range may span chapters, so the start verse
 * belongs to `startChapter` and the end verse to `endChapter`.
 */
export interface Reference {
  bibleId: string;
  bookId: string;
  startChapter: string;
  startVerse: string;
  endChapter: string;
  endVerse: string;
}
