/** Keep in sync with `@media screen and (max-width: 768px)` in globals.css. */
export const NARROW_UI_MAX_PX = 768;

export const PREVIEW_GUTTER_WIDE = 90;
export const PREVIEW_GUTTER_NARROW = 24;

export function isNarrowWidth(width: number): boolean {
  return width <= NARROW_UI_MAX_PX;
}

export function previewGutter(availableWidth: number): number {
  return isNarrowWidth(availableWidth) ? PREVIEW_GUTTER_NARROW : PREVIEW_GUTTER_WIDE;
}

/** Scale a print sheet so it fits the preview pane without clipping. */
export function fitPreviewScale(availableWidth: number, sheetWidth: number): number {
  if (sheetWidth <= 0) return 1;
  const inner = availableWidth - previewGutter(availableWidth);
  if (inner <= 0) return 0.2;
  return Math.min(1, Math.max(0.2, inner / sheetWidth));
}

/**
 * Phone layout opens as a full-screen drawer, so start closed unless Files
 * was requested. Desktop keeps the stored (or default open) rail.
 */
export function startRailCollapsed(
  narrow: boolean,
  filesOpen: boolean,
  stored?: boolean,
): boolean {
  if (narrow) return !filesOpen;
  if (typeof stored === "boolean") return stored;
  return false;
}

export function narrowUiQuery(): string {
  return `(max-width: ${NARROW_UI_MAX_PX}px)`;
}
