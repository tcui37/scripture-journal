import type { Settings } from "./types";

/** A4 at 96dpi, plus the print margin and footer strip. */
export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;
export const MARGIN = 54;
export const FOOTER = 26;

export const INK = "#201e1d";
export const MUTED = "#82796a";
export const RULE = "#dcd3c4";
export const HAIRLINE = "#e4dccf";
export const WORDS_OF_CHRIST = "#8c491a";

export const PAPER_COLORS: Record<string, string> = {
  Ivory: "#faf5ec",
  "Bright white": "#ffffff",
  "Warm grey": "#f2ece1",
};

export const STORAGE_KEY = "scripture-journal-v1";

export const DEFAULT_SETTINGS: Settings = {
  layout: "right",
  lines: "ruled",
  font: "serif",
  size: 12,
  lead: 1.6,
  numbers: "sup",
  flow: "para",
  wordsOfChrist: true,
  pageNumbers: true,
  paper: "Ivory",
  justify: true,
  showHeadings: true,
};

export const DEFAULT_REFERENCE = {
  bibleId: "78a9f6124f344018-01",
  bookId: "JHN",
  chapter: "1",
  start: "1",
  end: "18",
};

export const LAYOUT_OPTIONS = [
  { id: "right", label: "Text left / lines right", hint: "Classic journaling spread" },
  { id: "bottom", label: "Text top / lines below", hint: "Reflection under the passage" },
  { id: "twocol", label: "Two columns + outer margin", hint: "More text per page" },
  { id: "verso", label: "Text page + facing lined page", hint: "Print double-sided" },
  { id: "wide", label: "Center column, lines both sides", hint: "Wide-margin study bible" },
] as const;

export const LINE_OPTIONS = [
  { id: "ruled", label: "Ruled" },
  { id: "dots", label: "Dots" },
  { id: "blank", label: "Blank" },
] as const;

export const FONT_OPTIONS = [
  { id: "serif", label: "Serif" },
  { id: "sans", label: "Sans" },
] as const;

export const NUMBER_OPTIONS = [
  { id: "sup", label: "Superscript №" },
  { id: "inline", label: "Inline №" },
] as const;

export const FLOW_OPTIONS = [
  { id: "para", label: "Paragraphs" },
  { id: "line", label: "Verse per line" },
] as const;

export const PAPER_OPTIONS = [
  { id: "Ivory", label: "Ivory" },
  { id: "Bright white", label: "Bright white" },
  { id: "Warm grey", label: "Warm grey" },
] as const;

export const ZOOM_OPTIONS = [
  { id: "fit", label: "Fit" },
  { id: "0.75", label: "75%" },
  { id: "1", label: "100%" },
] as const;
