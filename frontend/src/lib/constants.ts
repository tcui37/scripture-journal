import type { ParallelMode, Settings } from "./types";

/** Sheet sizes in CSS pixels at 96dpi, portrait. */
export const PAGE_SIZES = {
  A4: { width: 794, height: 1123 }, // 210 × 297 mm
  Letter: { width: 816, height: 1056 }, // 8.5 × 11 in
} as const;

/** Print margin and footer strip, shared by every sheet size. */
export const MARGIN = 54;
export const FOOTER = 26;
/**
 * Room reserved at the foot of every sheet for the copyright and provider
 * notices. Always reserved rather than measured, so turning the page footer on
 * or off cannot reflow the text: the notices are a licence condition, not a
 * user preference, and every source supplies at least a translation name.
 */
export const NOTICE = 26;

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
  orientation: "portrait",
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
};

export const DEFAULT_REFERENCE = {
  bibleId: "niv",
  compareId: "",
  bookId: "JHN",
  startChapter: "1",
  startVerse: "1",
  endChapter: "1",
  endVerse: "18",
};

export const PAGE_SIZE_OPTIONS = [
  { id: "A4", label: "A4" },
  { id: "Letter", label: "Letter" },
] as const;

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
