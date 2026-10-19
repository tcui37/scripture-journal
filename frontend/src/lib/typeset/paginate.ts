/**
 * Flows blocks into fixed-height page slots.
 *
 * There is no way to know how tall a block renders without rendering it, so
 * this measures candidate markup in a hidden, off-screen div. When a
 * splittable block overflows the current slot it binary-searches for the
 * largest number of units that still fit, splits there, and continues on the
 * next slot.
 */

import type { Block } from "./blocks";
import { geometry } from "./render";
import type { Settings } from "../types";

/** Minimum room a heading needs below it to avoid being stranded. */
const ORPHAN_GUARD = 40;
/** Below this, splitting a block is not worth the ragged result. */
const MIN_SPLIT_ROOM = 64;

export class Measurer {
  private element: HTMLDivElement;

  constructor() {
    this.element = document.createElement("div");
    this.element.setAttribute(
      "style",
      "position:fixed;left:-99999px;top:0;visibility:hidden;",
    );
    document.body.appendChild(this.element);
  }

  measure(html: string, width: number) {
    this.element.style.width = `${width}px`;
    this.element.innerHTML = html;
    // Fractional, not offsetHeight: that rounds each block to whole pixels,
    // and over a page of short poetry lines the shortfall adds up to a
    // clipped last line.
    return this.element.getBoundingClientRect().height;
  }

  destroy() {
    this.element.remove();
  }
}

/** Largest candidate that fits, or 0. Height grows with the end, so bisect. */
function largestFitting(candidates: number[], fits: (end: number) => boolean): number {
  let best = 0;
  let low = 0;
  let high = candidates.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (fits(candidates[mid])) {
      best = candidates[mid];
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

/** As `largestFitting`, over every end in [from, to]. */
function largestFittingIn(from: number, to: number, fits: (end: number) => boolean): number {
  let best = 0;
  let low = from;
  let high = to;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (fits(mid)) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

/** Returns one entry per page, each holding that page's slot markup. */
export function paginate(
  blocks: Block[],
  settings: Settings,
  measurer: Measurer,
  slot?: { width: number; height: number },
): string[][] {
  const geo = geometry(settings);
  const slots: string[] = [];

  let slotIndex = 0;
  let current = "";
  let currentHeight = 0;
  let slotHeight = slot?.height ?? geo.slots[0].height;
  let slotWidth = slot?.width ?? geo.slots[0].width;

  const nextSlot = () => {
    slots.push(current);
    current = "";
    currentHeight = 0;
    slotIndex += 1;
    if (slot) {
      slotHeight = slot.height;
      slotWidth = slot.width;
      return;
    }
    const box = geo.slots[slotIndex % geo.slots.length];
    slotHeight = box.height;
    slotWidth = box.width;
  };

  for (const block of blocks) {
    let offset = 0;

    do {
      const html = block.render(offset);
      if (!html) break;

      const height = measurer.measure(html, slotWidth);
      const limit = block.keepWithNext ? slotHeight - ORPHAN_GUARD : slotHeight;

      if (currentHeight + height <= limit) {
        current += html;
        currentHeight += height;
        break;
      }

      const room = slotHeight - currentHeight;
      const fitsTo = (end: number) =>
        measurer.measure(block.render(offset, end), slotWidth) <= room;
      // Candidate split points strictly inside what is left, preferring the
      // block's own breaks (verse starts) over arbitrary units (words).
      const preferred = (block.breaks ?? []).filter(
        (unit) => unit > offset && unit < block.units,
      );
      let end = 0;

      // An empty slot is always worth splitting into, however small it is.
      if (block.units - offset > 1 && (room > MIN_SPLIT_ROOM || !current)) {
        end = block.breaks
          ? largestFitting(preferred, fitsTo)
          : largestFittingIn(offset + 1, block.units - 1, fitsTo);
        // A stretch between breaks taller than a whole slot can only be
        // placed by splitting inside it, so do that rather than overflow.
        if (!end && !current && block.breaks) {
          end = largestFittingIn(offset + 1, (preferred[0] ?? block.units) - 1, fitsTo);
        }
      }

      if (end > 0) {
        current += block.render(offset, end);
        offset = end;
        nextSlot();
      } else if (current) {
        // Nothing fits here, but the slot has content: start a fresh one.
        nextSlot();
      } else if (block.units - offset > 1) {
        // Not even one unit fits an empty slot. Let that unit overflow, but
        // carry the rest on — overflowing the whole block would hide it.
        current += block.render(offset, offset + 1);
        offset += 1;
        nextSlot();
      } else {
        current += html;
        currentHeight += height;
        break;
      }
    } while (offset < block.units);
  }

  if (current.trim()) slots.push(current);
  if (!slots.length) slots.push("");

  const perPage = slot ? 1 : geo.perPage;
  const pages: string[][] = [];
  for (let i = 0; i < slots.length; i += perPage) {
    pages.push(slots.slice(i, i + perPage));
  }
  return pages;
}
