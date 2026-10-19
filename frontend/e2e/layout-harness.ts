/**
 * Runs inside the browser page (bundled by layout.spec.ts). Typesets a
 * passage under many settings with the real pipeline, paints every sheet, and
 * reports anything a reader would lose: a text box whose content overflows
 * (clipped by overflow:hidden), a verse whose text never appears, or verse
 * numbers that do not add up.
 */

import { DEFAULT_SETTINGS } from "@/lib/constants";
import {
  alignPassages,
  geometry,
  Measurer,
  pageHtml,
  paginatePassages,
  singleTextGeometry,
} from "@/lib/typeset";
import type { Passage, Settings } from "@/lib/types";

export interface LayoutCase {
  label: string;
  settings: Partial<Settings>;
  compare: boolean;
}

const norm = (text: string) => text.replace(/ /g, " ").replace(/\s+/g, " ").trim();

function check(passage: Passage, cases: LayoutCase[]): string[] {
  const expected: string[] = [];
  let numbered = 0;
  for (const paragraph of passage.paragraphs) {
    if (paragraph.kind !== "text") continue;
    for (const verse of paragraph.verses) {
      const text = norm(verse.segments.map((segment) => segment.text).join(""));
      if (text) expected.push(text);
      if (verse.number) numbered += 1;
    }
  }

  const problems: string[] = [];
  const measurer = new Measurer();
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:0;top:0;";
  document.body.appendChild(host);

  for (const { label, settings: patch, compare } of cases) {
    const settings = { ...DEFAULT_SETTINGS, ...patch } as Settings;
    const secondary = compare ? (structuredClone(passage) as Passage) : null;
    const pages = paginatePassages(passage, secondary, settings, measurer) ?? [];
    const layout =
      secondary && settings.parallelMode !== "facing" ? singleTextGeometry(settings) : geometry(settings);

    let text = "";
    pages.forEach((slots, index) => {
      const sheet = document.createElement("div");
      sheet.style.cssText = `position:relative;width:${layout.page.width}px;height:${layout.page.height}px`;
      sheet.innerHTML = pageHtml({
        slots,
        pageNumber: index + 1,
        total: pages.length,
        blank: false,
        reference: "",
        citation: "BSB",
        sources: "",
        copyright: "",
        settings,
        layout,
      });
      host.appendChild(sheet);
      sheet.querySelectorAll<HTMLElement>("div[style*='overflow:hidden']").forEach((slot) => {
        const over = slot.scrollHeight - slot.clientHeight;
        if (over > 1) problems.push(`${label}: sheet ${index + 1} overflows by ${over}px`);
        text += ` ${slot.textContent}`;
      });
      host.removeChild(sheet);
    });

    text = norm(text);
    const missing = expected.filter((verse) => !text.includes(verse));
    if (missing.length) {
      problems.push(`${label}: ${missing.length} verses missing, e.g. "${missing[0].slice(0, 40)}"`);
    }
    if (!secondary) {
      const numbers = (pages.flat().join("").match(/<sup/g) ?? []).length;
      if (numbers !== numbered) problems.push(`${label}: ${numbers} verse numbers, expected ${numbered}`);
    }
  }

  const rows = alignPassages(passage.paragraphs, structuredClone(passage.paragraphs)).filter(
    (row) => row.kind === "verse",
  );
  if (rows.length !== numbered || !rows.every((row) => row.primary && row.secondary)) {
    problems.push(`compare alignment: ${rows.length} rows for ${numbered} verses`);
  }

  measurer.destroy();
  host.remove();
  return problems;
}

(window as unknown as { __typesetCheck: typeof check }).__typesetCheck = check;
