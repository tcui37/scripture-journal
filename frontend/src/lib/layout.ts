/** Keep in sync with `@media screen and (max-width: 768px)` and
 *  `@container preview (min-width: 769px)` in globals.css. */
export const NARROW_UI_MAX_PX = 768;

/** Keep in sync with `@media screen and (max-width: 1100px)` tablet chrome. */
export const MEDIUM_UI_MAX_PX = 1100;

/** Keep in sync with `@container desk (max-width: …px)` in globals.css. */
export const TOPBAR_STACK_MAX_PX = 680;

export const PREVIEW_GUTTER_WIDE = 90;
export const PREVIEW_GUTTER_NARROW = 24;

export function isNarrowWidth(width: number): boolean {
  return width <= NARROW_UI_MAX_PX;
}

export function previewGutter(availableWidth: number): number {
  return isNarrowWidth(availableWidth) ? PREVIEW_GUTTER_NARROW : PREVIEW_GUTTER_WIDE;
}

/** Horizontal padding on `.preview-canvas`, or the gutter fallback before mount. */
export function readPreviewPaddingInline(
  canvas: Element | null,
  fallbackWidth: number,
): number {
  if (!canvas || typeof getComputedStyle !== "function") {
    return previewGutter(fallbackWidth);
  }
  const style = getComputedStyle(canvas);
  const left = Number.parseFloat(style.paddingLeft);
  const right = Number.parseFloat(style.paddingRight);
  const padding = (Number.isFinite(left) ? left : 0) + (Number.isFinite(right) ? right : 0);
  return padding > 0 ? padding : previewGutter(fallbackWidth);
}

/** Scale a print sheet so it fits the preview pane without clipping. */
export function fitPreviewScale(
  availableWidth: number,
  sheetWidth: number,
  paddingInline?: number,
): number {
  if (sheetWidth <= 0) return 1;
  const gutter = paddingInline ?? previewGutter(availableWidth);
  const inner = availableWidth - gutter;
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

/**
 * After a viewport change, pick rail collapse state.
 * Widening preserves an open rail; narrowing uses the phone drawer rules.
 */
export function railCollapsedAfterViewportChange(
  narrow: boolean,
  filesOpen: boolean,
  currentlyCollapsed: boolean,
  storedCollapsed?: boolean,
): boolean {
  if (narrow) return startRailCollapsed(true, filesOpen);
  if (!currentlyCollapsed) return false;
  return startRailCollapsed(false, filesOpen, storedCollapsed);
}

/** Maximum horizontal scroll offset for a scroll container. */
export function maxStageScrollLeft(scrollWidth: number, clientWidth: number): number {
  return Math.max(0, scrollWidth - clientWidth);
}

export function narrowUiQuery(): string {
  return `(max-width: ${NARROW_UI_MAX_PX}px)`;
}
