import type { components } from "./api-schema";

/**
 * API shapes, generated from the backend's OpenAPI schema — regenerate with
 * `npm run gen:types` after changing backend/app/schemas.py.
 */
type Schemas = components["schemas"];
export type BibleLimits = Schemas["BibleLimits"];
export type BibleSummary = Schemas["BibleSummary"];
export type LanguageSummary = Schemas["LanguageSummary"];
export type Chapter = Schemas["Chapter"];
export type Book = Schemas["Book"];
export type Segment = Schemas["Segment"];
export type Verse = Schemas["Verse"];
export type Paragraph = Schemas["Paragraph"];
export type Passage = Schemas["Passage"];

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
