import type { BibleSummary } from "./types";

/** First occurrence of each code, or English if the list is empty. */
export const uniqueLanguages = (codes: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const code of codes) {
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out.length ? out : ["eng"];
};

/** Concatenate per-language catalogues, keeping the first listing of each id. */
export function mergeBibles(lists: BibleSummary[][]) {
  const byId = new Map<string, BibleSummary>();
  const order: string[] = [];
  for (const list of lists) {
    for (const entry of list) {
      if (byId.has(entry.id)) continue;
      byId.set(entry.id, entry);
      order.push(entry.id);
    }
  }
  return order.map((id) => byId.get(id)!);
}
