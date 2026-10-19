import { expect, test, type Page } from "@playwright/test";

/** Start the app on a given selection, as if the user had left it there. */
async function openAt(page: Page, reference: Record<string, string>) {
  await page.addInitScript((saved) => {
    window.localStorage.setItem(
      "scripture-journal-v3",
      JSON.stringify({ reference: saved, languages: ["eng"] }),
    );
  }, reference);
  await page.goto("/");
}

/** Every sheet's text, lower-cased (chapter markers are uppercased in CSS). */
const pageText = (page: Page) =>
  page.locator(".jpage").allInnerTexts().then((t) => t.join(" ").toLowerCase());

test("loads a passage through books, verses and text", async ({ page }) => {
  await openAt(page, {
    bibleId: "bbe",
    compareId: "",
    bookId: "JHN",
    startChapter: "3",
    startVerse: "16",
    endChapter: "3",
    endVerse: "17",
  });

  await expect(page.locator(".jpage").first()).toContainText("God", { timeout: 30_000 });
  const text = await pageText(page);
  expect(text).toContain("16");
  expect(text).toContain("17");
  expect(text).not.toMatch(/passage failed|books failed|chapter failed/);
});

test("a multi-chapter compare keeps every verse in its chapter", async ({ page }) => {
  await openAt(page, {
    bibleId: "bbe",
    compareId: "darby",
    bookId: "RUT",
    startChapter: "1",
    startVerse: "1",
    endChapter: "2",
    endVerse: "23",
  });

  await expect.poll(() => pageText(page), { timeout: 30_000 }).toContain("chapter 2");
  const text = await pageText(page);
  // Ruth 2:1 opens chapter 2 in both translations, naming Boaz. It used to be
  // merged into the 1:1 row, leaving "Chapter 2" with nothing under it.
  const chapterTwo = text.slice(text.indexOf("chapter 2"));
  expect(chapterTwo).toMatch(/^chapter 2\s*1[^]{0,400}boaz/);
  expect(text.indexOf("chapter 1")).toBeLessThan(text.indexOf("chapter 2"));
});

test("changing the chapter in the sidebar loads that chapter whole", async ({ page }) => {
  await openAt(page, {
    bibleId: "bbe",
    compareId: "",
    bookId: "JHN",
    startChapter: "3",
    startVerse: "16",
    endChapter: "3",
    endVerse: "17",
  });
  await expect.poll(() => pageText(page), { timeout: 30_000 }).toContain("john 3:16–17");

  await page.getByRole("button", { name: "Passage" }).click();
  await page.getByLabel("Start chapter", { exact: true }).click();
  await page.getByRole("option", { name: /^(chapter )?4$/i }).click();

  // Moving the start past the end pulls the end along and snaps it to the
  // last verse of chapter 4 — which needs that chapter's verse list first.
  await expect.poll(() => pageText(page), { timeout: 30_000 }).toContain("john 4:1–54");
  expect(await pageText(page)).not.toContain("failed");
});
