import { expect, test } from "@playwright/test";

/**
 * A capped translation over its limit: nothing is requested, the top bar says
 * so in one short line without moving, and the sidebar carries the detail.
 * Keyless backends have no capped translation, so BBE is given ESV-style
 * limits on the way to the browser.
 */
test("over a licence cap: no request, one quiet line, detail in the sidebar", async ({ page }) => {
  await page.route("**/api/bibles?language=eng", async (route) => {
    const response = await route.fetch();
    const bibles = await response.json();
    for (const bible of bibles) {
      if (bible.id === "bbe") {
        bible.limits = {
          max_verses: 500,
          max_book_fraction: 0.5,
          exempt_single_chapter_books: true,
          note: "Crossway permits at most 500 verses, or half a book, per passage.",
          allowances: { RUT: 42, JHN: 439 },
        };
      }
    }
    await route.fulfill({ response, json: bibles });
  });
  const passageRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/passage?")) passageRequests.push(request.url());
  });

  await page.addInitScript(() => {
    window.localStorage.setItem(
      "scripture-journal-v3",
      JSON.stringify({
        reference: {
          bibleId: "bbe",
          compareId: "",
          bookId: "RUT",
          startChapter: "1",
          startVerse: "1",
          endChapter: "1",
          endVerse: "22",
        },
        languages: ["eng"],
        openSections: { passage: true },
      }),
    );
  });
  await page.goto("/");
  await expect(page.locator(".jpage").first()).toContainText("Naomi", { timeout: 30_000 });
  const topbar = page.locator(".topbar");
  const heightBefore = (await topbar.boundingBox())!.height;
  const requestsBefore = passageRequests.length;

  await page.getByRole("button", { name: "Entire book" }).click();

  const status = page.locator(".topbar-status");
  await expect(status).toHaveText("BBE allows 42 verses here · 85 selected");
  await expect(status).toHaveClass(/is-error/);
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeDisabled();
  await expect(page.locator(".warning")).toContainText("at most 42 verses");
  expect((await topbar.boundingBox())!.height).toBe(heightBefore);
  await page.waitForTimeout(500);
  expect(passageRequests.length).toBe(requestsBefore);
});

test("a long status stays on one line", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const status = page.locator(".topbar-status");
  await status.evaluate((element) => {
    element.textContent = "x ".repeat(200);
  });
  const lineHeight = await status.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight));
  expect((await status.boundingBox())!.height).toBeLessThanOrEqual(lineHeight + 1);
});
