import { expect, test, type Page } from "@playwright/test";

const KEY = "scripture-journal-v3";

const saved = (page: Page) =>
  page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), KEY);

async function seed(page: Page, value: unknown) {
  // Only on the first load, so a reload sees what the app itself saved.
  await page.addInitScript(
    ([key, json]) => {
      if (!window.sessionStorage.getItem("seeded")) {
        window.localStorage.setItem(key, json);
        window.sessionStorage.setItem("seeded", "1");
      }
    },
    [KEY, JSON.stringify(value)] as const,
  );
}

const start = {
  reference: {
    bibleId: "bbe",
    compareId: "",
    bookId: "JHN",
    startChapter: "3",
    startVerse: "16",
    endChapter: "3",
    endVerse: "17",
  },
  languages: ["eng"],
  settings: { size: 14 },
  somethingFromAnotherVersion: "kept",
};

test("saves in the flat v3 shape and restores it after a reload", async ({ page }) => {
  await seed(page, start);
  await page.goto("/");
  await expect(page.locator(".topbar-reference")).toHaveText("John 3:16–17", { timeout: 30_000 });

  await page.getByRole("button", { name: "Passage" }).click();
  await page.getByLabel("Start chapter", { exact: true }).click();
  await page.getByRole("option", { name: /^(chapter )?4$/i }).click();
  await expect(page.locator(".topbar-reference")).toHaveText("John 4:1–54", { timeout: 30_000 });

  const stored = await saved(page);
  expect(stored.state).toBeUndefined(); // not zustand's own wrapper
  expect(stored.reference.startChapter).toBe("4");
  expect(stored.settings.size).toBe(14);
  expect(stored.somethingFromAnotherVersion).toBe("kept");
  expect(stored.openSections).toEqual({ passage: true });

  await page.reload();
  await expect(page.locator(".topbar-reference")).toHaveText("John 4:1–54", { timeout: 30_000 });
});

test("remembers a collapsed rail on desktop", async ({ page }) => {
  await seed(page, start);
  await page.goto("/");
  await expect(page.locator(".topbar-reference")).toHaveText("John 3:16–17", { timeout: 30_000 });

  await page.locator(".rail-header").getByRole("button", { name: "Hide settings" }).click();
  await expect(page.getByRole("button", { name: "Show settings" })).toBeVisible();
  expect((await saved(page)).railCollapsed).toBe(true);

  await page.reload();
  await expect(page.getByRole("button", { name: "Show settings" })).toBeVisible({
    timeout: 30_000,
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("starts with the rail closed, opens it, and Escape closes it", async ({ page }) => {
    await seed(page, { ...start, railCollapsed: false });
    await page.goto("/");
    const show = page.getByRole("button", { name: "Show settings" });
    await expect(show).toBeVisible({ timeout: 30_000 });

    await show.click();
    await expect(show).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(show).toBeVisible();
    // The phone drawer is not a preference: the desktop choice is untouched.
    expect((await saved(page)).railCollapsed).toBe(false);
  });
});
