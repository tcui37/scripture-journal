import type { PageSize, ParallelMode, Settings } from "./types";

/** Sheet sizes in CSS pixels at 96dpi, portrait. */
export const PAGE_SIZES: Record<PageSize, { width: number; height: number }> = {
  A3: { width: 1123, height: 1587 }, // 297 × 420 mm
  A4: { width: 794, height: 1123 }, // 210 × 297 mm
  A5: { width: 559, height: 794 }, // 148 × 210 mm
  A6: { width: 397, height: 559 }, // 105 × 148 mm
  B5: { width: 665, height: 945 }, // 176 × 250 mm
  B6: { width: 472, height: 665 }, // 125 × 176 mm
  Letter: { width: 816, height: 1056 }, // 8.5 × 11 in
  "Half letter": { width: 528, height: 816 }, // 5.5 × 8.5 in
  Legal: { width: 816, height: 1344 }, // 8.5 × 14 in
  Tabloid: { width: 1056, height: 1632 }, // 11 × 17 in
  Executive: { width: 696, height: 1008 }, // 7.25 × 10.5 in
  "6 × 9 in": { width: 576, height: 864 }, // trade paperback / journal
};

/** @page size tokens. Named sheets use CSS names; others are explicit. */
export const PAGE_CSS_SIZES: Record<PageSize, string> = {
  A3: "A3",
  A4: "A4",
  A5: "A5",
  A6: "A6",
  B5: "B5",
  B6: "125mm 176mm",
  Letter: "letter",
  "Half letter": "5.5in 8.5in",
  Legal: "legal",
  Tabloid: "ledger",
  Executive: "7.25in 10.5in",
  "6 × 9 in": "6in 9in",
};

export const cssPageSize = (pageSize: PageSize) => PAGE_CSS_SIZES[pageSize];

/** User-facing text/writing split: fraction of the inner area given to text. */
export const TEXT_SHARE_MIN = 0.35;
export const TEXT_SHARE_MAX = 0.75;
export const DEFAULT_TEXT_SHARE = 0.57;

/** Print margin and footer strip, shared by every sheet size. */
export const MARGIN = 54;
export const FOOTER = 26;
/**
 * Room reserved at the foot of every sheet for the copyright and provider
 * notices. Always reserved rather than measured, so pagination uses one slot
 * height. Tall enough for a full ESV (or ESV + NIV) paragraph at 5.8pt.
 */
export const NOTICE = 56;

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

/** Bumped when the stored shape changes, so old entries are ignored. */
export const STORAGE_KEY = "scripture-journal-v3";

export const DEFAULT_SETTINGS: Settings = {
  pageSize: "A4",
  orientation: "landscape",
  layout: "right",
  parallelMode: "columns",
  lines: "ruled",
  font: "serif",
  size: 12,
  lead: 1.6,
  numbers: "sup",
  flow: "para",
  poetryIndent: "regular",
  wordsOfChrist: true,
  pageNumbers: true,
  paper: "Ivory",
  justify: true,
  showHeadings: true,
  showChapterNumbers: true,
  parallelSwap: false,
  titleLine: false,
  textShare: DEFAULT_TEXT_SHARE,
};

export const DEFAULT_REFERENCE = {
  bibleId: "esv",
  compareId: "",
  bookId: "JHN",
  startChapter: "3",
  startVerse: "16",
  endChapter: "3",
  endVerse: "16",
};

export const PAGE_SIZE_OPTIONS = [
  { id: "A3", label: "A3", group: "ISO" },
  { id: "A4", label: "A4", group: "ISO" },
  { id: "A5", label: "A5", group: "ISO" },
  { id: "A6", label: "A6", group: "ISO" },
  { id: "B5", label: "B5", group: "ISO" },
  { id: "B6", label: "B6", group: "ISO" },
  { id: "Letter", label: "Letter", group: "US" },
  { id: "Half letter", label: "Half letter", group: "US" },
  { id: "Legal", label: "Legal", group: "US" },
  { id: "Tabloid", label: "Tabloid / Ledger", group: "US" },
  { id: "Executive", label: "Executive", group: "US" },
  { id: "6 × 9 in", label: "6 × 9 in", group: "Book" },
] as const satisfies readonly { id: PageSize; label: string; group: string }[];

export const ORIENTATION_OPTIONS = [
  { id: "portrait", label: "Portrait" },
  { id: "landscape", label: "Landscape" },
] as const;

/** Where the primary translation sits, given the current parallel arrangement. */
export function parallelSideLabels(
  mode: ParallelMode,
  swapped: boolean,
): { primary: string; compare: string } {
  const sides: { primary: string; compare: string } =
    mode === "bands"
      ? { primary: "Top", compare: "Bottom" }
      : mode === "stacked"
        ? { primary: "First", compare: "Second" }
        : mode === "facing"
          ? { primary: "Left page", compare: "Right page" }
          : { primary: "Left", compare: "Right" };
  return swapped
    ? { primary: sides.compare, compare: sides.primary }
    : sides;
}

export const PARALLEL_OPTIONS = [
  {
    id: "columns",
    label: "Verse columns",
    hint: "Same verse on one line — NIV/RVR and most parallel Bibles",
  },
  {
    id: "flow",
    label: "Flowing columns",
    hint: "Each language keeps its paragraphs — JPS, CUV/NIV",
  },
  {
    id: "stacked",
    label: "Stacked",
    hint: "Each verse, then its translation below — a diglot",
  },
  {
    id: "bands",
    label: "Above and below",
    hint: "One language on the top half, the other beneath",
  },
  {
    id: "facing",
    label: "Facing pages",
    hint: "One translation per sheet, print double-sided",
  },
] as const;

export const LAYOUT_OPTIONS = [
  {
    id: "right",
    label: "Passage left, lines right",
    hint: "Classic journalling spread",
  },
  {
    id: "bottom",
    label: "Passage top, lines below",
    hint: "Room to reflect underneath",
  },
  {
    id: "twocol",
    label: "Two columns, lines in margin",
    hint: "Fits the most text per page",
  },
  {
    id: "verso",
    label: "Passage page, facing lined page",
    hint: "For double-sided printing",
  },
  {
    id: "wide",
    label: "Centre column, lines both sides",
    hint: "Wide-margin study bible",
  },
] as const;

export const LINE_OPTIONS = [
  { id: "ruled", label: "Ruled lines" },
  { id: "dots", label: "Dot grid" },
  { id: "blank", label: "Blank" },
  { id: "none", label: "None" },
] as const;

export const FONT_OPTIONS = [
  { id: "serif", label: "Serif" },
  { id: "sans", label: "Sans serif" },
] as const;

export const NUMBER_OPTIONS = [
  { id: "sup", label: "Superscript" },
  { id: "inline", label: "Inline" },
] as const;

export const FLOW_OPTIONS = [
  { id: "para", label: "Flowing paragraphs" },
  { id: "line", label: "One verse per line" },
] as const;

export const POETRY_INDENT_OPTIONS = [
  { id: "off", label: "Off" },
  { id: "regular", label: "Regular" },
  { id: "deep", label: "Deep" },
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

/** Checkbox-style settings, rendered as one labelled list. */
export const TEXT_TOGGLES = [
  { id: "showHeadings", label: "Section headings" },
  { id: "showChapterNumbers", label: "Chapter numbers" },
  { id: "wordsOfChrist", label: "Words of Christ in red" },
  { id: "justify", label: "Justified text" },
] as const satisfies readonly { id: keyof Settings; label: string }[];
