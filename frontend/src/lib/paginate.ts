/**
 * Flows paragraphs into fixed-height page slots.
 *
 * There is no way to know how tall a paragraph renders without rendering it, so
 * this measures candidate markup in a hidden, off-screen div. When a paragraph
 * overflows the current slot it binary-searches for the largest number of
 * verses that still fit, splits there, and continues on the next slot.
 */

import { geometry, paragraphHtml } from "./render";
import type { Paragraph, Settings } from "./types";

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
  paragraphs: Paragraph[],
  settings: Settings,
  measurer: Measurer,
): string[][] {
  const geo = geometry(settings);
  const slots: string[] = [];

  let slotIndex = 0;
  let current = "";
  let currentHeight = 0;
  let { height: slotHeight, width: slotWidth } = geo.slots[0];

  const nextSlot = () => {
    slots.push(current);
    current = "";
    currentHeight = 0;
    slotIndex += 1;
    ({ height: slotHeight, width: slotWidth } = geo.slots[slotIndex % geo.slots.length]);
  };

  for (const paragraph of paragraphs) {
    // Headings and chapter markers are indivisible blocks.
    if (paragraph.kind !== "text") {
      const html = paragraphHtml(paragraph, settings);
      if (!html) continue;
      const height = measurer.measure(html, slotWidth);
      // Don't strand a heading at the foot of a slot with no text under it.
      if (currentHeight + height > slotHeight - 40 && current) nextSlot();
      current += html;
      currentHeight += height;
      continue;
    }

    let rest = paragraph.verses;

    while (rest.length) {
      const chunk: Paragraph = { ...paragraph, verses: rest };
      const html = paragraphHtml(chunk, settings);
      const height = measurer.measure(html, slotWidth);

      if (currentHeight + height <= slotHeight) {
        current += html;
        currentHeight += height;
        break;
      }

      const room = slotHeight - currentHeight;
      let fits = 0;

      // Only bother splitting if there is a usable amount of room left.
      if (rest.length > 1 && room > 64) {
        let low = 1;
        let high = rest.length - 1;
        while (low <= high) {
          const mid = (low + high) >> 1;
          if (measurer.measure(paragraphHtml(chunk, settings, mid), slotWidth) <= room) {
            fits = mid;
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }
      }

      if (fits > 0) {
        current += paragraphHtml({ ...paragraph, verses: rest.slice(0, fits) }, settings);
        rest = rest.slice(fits);
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
    }
  }

  if (current.trim()) slots.push(current);
  if (!slots.length) slots.push("");

  const pages: string[][] = [];
  for (let i = 0; i < slots.length; i += geo.perPage) {
    pages.push(slots.slice(i, i + geo.perPage));
  }
  return pages;
}
