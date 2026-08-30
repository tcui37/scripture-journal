const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** True when focus sits inside `container` (or on the container itself). */
export function focusIsInside(container: Element | null | undefined): boolean {
  if (!container || typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!active || active === document.body) return false;
  return container.contains(active);
}

/**
 * Move focus out of a panel before it is hidden (`aria-hidden` / `inert`).
 * Tries each fallback selector in order; skips elements inside the panel.
 */
export function restoreFocusFromPanel(
  panel: Element | null | undefined,
  fallbackSelectors: readonly string[],
): boolean {
  if (!focusIsInside(panel)) return false;

  for (const selector of fallbackSelectors) {
    const candidate = document.querySelector<HTMLElement>(selector);
    if (!candidate || panel?.contains(candidate)) continue;
    candidate.focus();
    return true;
  }

  return false;
}

export { FOCUSABLE };
