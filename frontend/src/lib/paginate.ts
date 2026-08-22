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
import type { Settings } from "./types";

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
    return this.element.offsetHeight;
  }

  destroy() {
    this.element.remove();
  }
}

/** Returns one entry per page, each holding that page's slot markup. */
export function paginate(
  blocks: Block[],
  settings: Settings,
  measurer: Measurer,
): string[][] {
  const geo = geometry(settings);
  const slots: string[] = [];

  let slotIndex = 0;
  let current = "";
  let currentHeight = 0;
  let slotHeight = geo.slots[0].height;
  let slotWidth = geo.slots[0].width;

  const nextSlot = () => {
    slots.push(current);
    current = "";
    currentHeight = 0;
    slotIndex += 1;
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
      const remaining = block.units - offset;
      let fits = 0;

      if (remaining > 1 && room > MIN_SPLIT_ROOM) {
        let low = 1;
        let high = remaining - 1;
        while (low <= high) {
          const mid = (low + high) >> 1;
          if (measurer.measure(block.render(offset, offset + mid), slotWidth) <= room) {
            fits = mid;
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }
      }

      if (fits > 0) {
        current += block.render(offset, offset + fits);
        offset += fits;
        nextSlot();
      } else if (current) {
        // Nothing fits here, but the slot has content: start a fresh one.
        nextSlot();
      } else {
        // An empty slot still can't hold it — let it overflow rather than loop.
        current += html;
        currentHeight += height;
        break;
      }
    } while (offset < block.units);
  }

  if (current.trim()) slots.push(current);
  if (!slots.length) slots.push("");

  const pages: string[][] = [];
  for (let i = 0; i < slots.length; i += geo.perPage) {
    pages.push(slots.slice(i, i + geo.perPage));
  }
  return pages;
}
