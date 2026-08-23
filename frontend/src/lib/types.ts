/** Mirrors the Pydantic models in backend/app/schemas.py. */

export interface BibleLimits {
  max_verses: number | null;
  max_book_fraction: number | null;
  exempt_single_chapter_books: boolean;
  note: string;
}

export interface BibleSummary {
  id: string;
  label: string;
  language: string;
  language_name: string;
  limits: BibleLimits | null;
}

export interface LanguageSummary {
  code: string;
  name: string;
  count: number;
}

export interface Chapter {
  number: string;
  /** Verses in this chapter; used to size a selection before requesting it. */
  verse_count: number;
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
  /** The publisher's copyright notice for this translation. */
  copyright: string;
  /** Provider attribution the licence requires on the page, if any. */
  attribution: string;
  paragraphs: Paragraph[];
}

export type Layout = "right" | "bottom" | "twocol" | "verso" | "wide";
export type LineStyle = "ruled" | "dots" | "blank" | "none";
export type FontChoice = "serif" | "sans";
export type NumberStyle = "sup" | "inline";
export type Flow = "para" | "line";
/** Hanging indent for USFM poetry lines (q / q2). */
export type PoetryIndent = "off" | "regular" | "deep";
export type Paper = "Ivory" | "Bright white" | "Warm grey";
export type PageSize =
  | "A3"
  | "A4"
  | "A5"
  | "A6"
  | "B5"
  | "B6"
  | "Letter"
  | "Half letter"
  | "Legal"
  | "Tabloid"
  | "Executive"
  | "6 × 9 in";
export type Orientation = "portrait" | "landscape";
/** How a second translation is arranged against the first. */
export type ParallelMode = "columns" | "flow" | "stacked" | "bands" | "facing";

/** Everything that affects how a page is drawn. */
export interface Settings {
  pageSize: PageSize;
  orientation: Orientation;
  layout: Layout;
  parallelMode: ParallelMode;
  lines: LineStyle;
  font: FontChoice;
  size: number;
  lead: number;
  numbers: NumberStyle;
  flow: Flow;
  poetryIndent: PoetryIndent;
  wordsOfChrist: boolean;
  pageNumbers: boolean;
  paper: Paper;
  justify: boolean;
  showHeadings: boolean;
  showChapterNumbers: boolean;
  /** Flip which translation sits left/top vs right/bottom. */
  parallelSwap: boolean;
  /** Date and title rules at the top of each writing area. */
  titleLine: boolean;
  /** Fraction of the inner area given to scripture text; the rest is writing. */
  textShare: number;
}

/**
 * Which passage is on screen. The range may span chapters, so the start verse
 * belongs to `startChapter` and the end verse to `endChapter`.
 */
export interface Reference {
  bibleId: string;
  /** Optional second translation, shown in a parallel column. */
  compareId: string;
  bookId: string;
  startChapter: string;
  startVerse: string;
  endChapter: string;
  endVerse: string;
}

/**
 * A named page layout: every setting that draws the sheet, excluding
 * translation. Same fields as `Settings` so applying a Design is a straight
 * assignment.
 */
export type Design = Settings;

export interface DesignRecord {
  id: string;
  name: string;
  settings: Design;
  created_at: string;
  updated_at: string;
}

/** Book/chapter/verse only — translation stays with the live journal. */
export interface PassageSelection {
  book_id: string;
  start_chapter: string;
  start_verse: string;
  end_chapter: string;
  end_verse: string;
}

/** A saved journal session: passage selection plus a Design snapshot. */
export interface JournalFile extends PassageSelection {
  id: string;
  name: string;
  design: Design;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
}
