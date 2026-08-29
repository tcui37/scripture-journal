import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  AccountError,
  authErrorField,
  authHref,
  changePassword,
  createDesign,
  fetchMe,
  fileCreateBody,
  formatPassageLabel,
  friendlyAccountError,
  newestFirst,
  nextLabel,
  safeNext,
  sameDesign,
  signIn,
} from "./account";
import { DEFAULT_SETTINGS } from "./constants";
import type { Design } from "./types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("formatPassageLabel", () => {
  const base = {
    book_id: "JHN",
    start_chapter: "3",
    start_verse: "16",
    end_chapter: "3",
    end_verse: "16",
  };

  it("uses book_id and a single verse", () => {
    assert.equal(formatPassageLabel(base), "JHN 3:16");
  });

  it("ranges verses in one chapter", () => {
    assert.equal(formatPassageLabel({ ...base, end_verse: "18" }), "JHN 3:16–18");
  });

  it("spans chapters", () => {
    assert.equal(
      formatPassageLabel({ ...base, end_chapter: "4", end_verse: "2" }),
      "JHN 3:16–4:2",
    );
  });
});

describe("sameDesign", () => {
  it("treats matching settings as equal regardless of key order", () => {
    const flipped = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).reverse()) as Design;
    assert.equal(sameDesign(DEFAULT_SETTINGS, flipped), true);
  });

  it("detects a changed field", () => {
    assert.equal(sameDesign(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, size: 14 }), false);
  });
});

describe("newestFirst", () => {
  it("sorts by created_at descending", () => {
    const rows = [
      { created_at: "2026-01-01T00:00:00Z" },
      { created_at: "2026-03-01T00:00:00Z" },
      { created_at: "2026-02-01T00:00:00Z" },
    ];
    assert.deepEqual(
      newestFirst(rows).map((row) => row.created_at),
      ["2026-03-01T00:00:00Z", "2026-02-01T00:00:00Z", "2026-01-01T00:00:00Z"],
    );
  });
});

describe("fileCreateBody", () => {
  it("maps the journal snapshot and omits translation ids", () => {
    const body = fileCreateBody("Morning pages", {
      settings: { ...DEFAULT_SETTINGS, paper: "Warm grey" },
      reference: {
        bibleId: "esv",
        compareId: "niv",
        bookId: "PSA",
        startChapter: "23",
        startVerse: "1",
        endChapter: "23",
        endVerse: "6",
      },
    });
    assert.equal(body.name, "Morning pages");
    assert.equal(body.book_id, "PSA");
    assert.equal(body.start_chapter, "23");
    assert.equal(body.start_verse, "1");
    assert.equal(body.end_chapter, "23");
    assert.equal(body.end_verse, "6");
    assert.equal(body.design.paper, "Warm grey");
    assert.equal("bibleId" in body, false);
    assert.equal("compareId" in body, false);
    assert.equal("bible_id" in body, false);
  });
});

describe("safeNext", () => {
  it("allows the journal, files rail, and account sidecar destinations", () => {
    assert.equal(safeNext("/"), "/");
    assert.equal(safeNext("/?files=1"), "/?files=1");
    assert.equal(safeNext("/?account=1"), "/?account=1");
  });

  it("maps legacy /files and /account to journal query modes", () => {
    assert.equal(safeNext("/files"), "/?files=1");
    assert.equal(safeNext("/files?x=1"), "/?files=1");
    assert.equal(safeNext("/account"), "/?account=1");
  });

  it("strips a hash and still allows the path", () => {
    assert.equal(safeNext("/account#profile"), "/?account=1");
    assert.equal(safeNext("/?files=1#panel"), "/?files=1");
    assert.equal(safeNext("/?account=1#panel"), "/?account=1");
  });

  it("rejects missing, open-redirect, and unknown paths", () => {
    assert.equal(safeNext(null), "/");
    assert.equal(safeNext(""), "/");
    assert.equal(safeNext("//evil.example"), "/");
    assert.equal(safeNext("https://evil.example"), "/");
    assert.equal(safeNext("/settings"), "/");
    assert.equal(safeNext("/files/extra"), "/");
    assert.equal(safeNext("/?other=1"), "/");
  });
});

describe("authHref", () => {
  it("omits next when the destination is the journal", () => {
    assert.equal(authHref("login", "/"), "/login");
    assert.equal(authHref("signup"), "/signup");
  });

  it("encodes a safe next destination", () => {
    assert.equal(authHref("login", "/files"), "/login?next=%2F%3Ffiles%3D1");
    assert.equal(authHref("login", "/?files=1"), "/login?next=%2F%3Ffiles%3D1");
    assert.equal(authHref("signup", "/account"), "/signup?next=%2F%3Faccount%3D1");
    assert.equal(authHref("signup", "/?account=1"), "/signup?next=%2F%3Faccount%3D1");
  });

  it("drops an unsafe next", () => {
    assert.equal(authHref("login", "https://evil.example"), "/login");
  });
});

describe("nextLabel", () => {
  it("names the three destinations", () => {
    assert.equal(nextLabel("/"), "journal");
    assert.equal(nextLabel("/?files=1"), "files");
    assert.equal(nextLabel("/files"), "files");
    assert.equal(nextLabel("/account"), "account");
    assert.equal(nextLabel("/?account=1"), "account");
  });
});

describe("sendJson", () => {
  it("posts JSON with credentials", async () => {
    const calls: { input: unknown; init: RequestInit | undefined }[] = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ user: { id: "1", email: "a@b.c" }, needs_confirmation: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await signIn("a@b.c", "secret");
    assert.equal(result.user.email, "a@b.c");
    assert.equal(calls[0]?.input, "/api/auth/signin");
    assert.equal(calls[0]?.init?.credentials, "include");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(calls[0]?.init?.body, JSON.stringify({ email: "a@b.c", password: "secret" }));
  });

  it("turns FastAPI detail into AccountError", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ detail: "Email already registered" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    await assert.rejects(() => createDesign("Wide", DEFAULT_SETTINGS), (error: unknown) => {
      assert.ok(error instanceof AccountError);
      assert.equal(error.status, 400);
      assert.equal(error.message, "Email already registered");
      return true;
    });
  });

  it("treats 401 on /me as signed out", async () => {
    globalThis.fetch = (async () => new Response("", { status: 401 })) as typeof fetch;
    assert.equal(await fetchMe(), null);
  });

  it("posts current and new password to change-password", async () => {
    const calls: { input: unknown; init: RequestInit | undefined }[] = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ input, init });
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    await changePassword("old-secret", "new-secret");
    assert.equal(calls[0]?.input, "/api/auth/change-password");
    assert.equal(calls[0]?.init?.credentials, "include");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(
      calls[0]?.init?.body,
      JSON.stringify({ current_password: "old-secret", new_password: "new-secret" }),
    );
  });
});

describe("friendlyAccountError", () => {
  it("names a wrong password and what to do next", () => {
    assert.equal(
      friendlyAccountError(new AccountError(401, "Invalid email or password."), "signin"),
      "That email or password is not right. Try again.",
    );
  });

  it("names unavailable account storage", () => {
    assert.equal(
      friendlyAccountError(new AccountError(503, "Not configured"), "signup"),
      "Account storage is not available right now. Try again in a moment.",
    );
  });

  it("keeps a specific 400 from the API", () => {
    assert.equal(
      friendlyAccountError(new AccountError(400, "Enter a valid email address."), "signup"),
      "Enter a valid email address.",
    );
  });

  it("asks to retry when the server is down", () => {
    assert.equal(
      friendlyAccountError(new AccountError(502, "HTTP 502"), "signin"),
      "Could not sign in. Check your connection and try again.",
    );
  });
});

describe("authErrorField", () => {
  it("puts a wrong-password error on the password field", () => {
    assert.equal(authErrorField(new AccountError(401, "Invalid"), "signin"), "password");
  });

  it("puts a signup 400 on the email field", () => {
    assert.equal(authErrorField(new AccountError(400, "Enter a valid email address."), "signup"), "email");
  });

  it("keeps storage-down errors on the form", () => {
    assert.equal(authErrorField(new AccountError(503, "Not configured"), "signin"), "form");
  });
});
