import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import { build } from "esbuild";

import type { LayoutCase } from "./layout-harness";

/**
 * The typesetter in real Chrome, with the app's own fonts and CSS, over
 * public-domain fixtures (regenerate with backend/scripts/layout_fixtures.py).
 * Catches what unit tests cannot: real text measurement. Every bug of the
 * "verses get dropped" kind so far lived here.
 */

const here = __dirname;
const fixtures = readdirSync(path.join(here, "fixtures")).filter((name) => name.endsWith(".json"));

function cases(): LayoutCase[] {
  const out: LayoutCase[] = [];
  for (const pageSize of ["A4", "Letter", "A5", "A6"] as const)
    for (const orientation of ["landscape", "portrait"] as const)
      for (const layout of ["right", "bottom", "twocol", "verso", "wide"] as const)
        for (const size of [10, 16])
          for (const flow of ["para", "line"] as const)
            out.push({
              label: `${pageSize}/${orientation}/${layout}/${size}pt/${flow}`,
              settings: { pageSize, orientation, layout, size, flow },
              compare: false,
            });
  for (const lines of ["none"] as const)
    for (const layout of ["twocol", "wide"] as const)
      out.push({ label: `lines:${lines}/${layout}`, settings: { lines, layout }, compare: false });
  for (const parallelMode of ["columns", "stacked", "flow", "bands", "facing"] as const)
    for (const size of [10, 16])
      out.push({ label: `compare:${parallelMode}/${size}pt`, settings: { parallelMode, size }, compare: true });
  return out;
}

let harness = "";

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [path.join(here, "layout-harness.ts")],
    bundle: true,
    write: false,
    format: "iife",
    alias: { "@": path.join(here, "..", "src") },
    logLevel: "silent",
  });
  harness = result.outputFiles[0].text;
});

for (const name of fixtures) {
  test(`typesets ${name.replace(/\.json$/, "")} without losing text`, async ({ page }) => {
    const passage = JSON.parse(readFileSync(path.join(here, "fixtures", name), "utf8"));
    // The app page, so the real webfonts and stylesheet are what get measured.
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await page.addScriptTag({ content: harness });

    const problems = await page.evaluate(
      ([data, all]) =>
        (window as unknown as { __typesetCheck: (p: unknown, c: unknown) => string[] }).__typesetCheck(
          data,
          all,
        ),
      [passage, cases()] as const,
    );
    expect(problems, problems.slice(0, 10).join("\n")).toEqual([]);
  });
}
