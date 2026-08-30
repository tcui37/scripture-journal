import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  readJournalPanelsFromSearch,
  resetJournalUrlSyncForTests,
  resolveLandingPanels,
  syncJournalUrl,
} from "./journal-url";

describe("readJournalPanelsFromSearch", () => {
  it("reads panel flags and file id from the query string", () => {
    const params = new URLSearchParams("files=1&account=1&file=abc");
    assert.deepEqual(readJournalPanelsFromSearch(params), {
      files: true,
      account: true,
      fileId: "abc",
    });
  });

  it("defaults missing params to closed panels", () => {
    assert.deepEqual(readJournalPanelsFromSearch(new URLSearchParams()), {
      files: false,
      account: false,
      fileId: null,
    });
  });
});

describe("resolveLandingPanels", () => {
  it("prefers Files when both panels are requested", () => {
    assert.deepEqual(resolveLandingPanels({ files: true, account: true }), {
      files: true,
      account: false,
    });
  });

  it("keeps Account when Files was not requested", () => {
    assert.deepEqual(resolveLandingPanels({ files: false, account: true }), {
      files: false,
      account: true,
    });
  });
});

describe("syncJournalUrl", () => {
  const replaceStateCalls: string[] = [];

  afterEach(() => {
    resetJournalUrlSyncForTests();
    replaceStateCalls.length = 0;
    // @ts-expect-error test cleanup
    delete globalThis.window;
  });

  function installWindow(search = "") {
    const location = { pathname: "/", search };
    globalThis.window = {
      location,
      history: {
        replaceState(_state: null, _title: string, url: string) {
          replaceStateCalls.push(url);
          const parsed = new URL(url, "http://localhost");
          location.pathname = parsed.pathname;
          location.search = parsed.search;
        },
      },
    } as Window & typeof globalThis.window;
  }

  async function flushMicrotasks() {
    await new Promise<void>((resolve) => queueMicrotask(resolve));
  }

  it("merges rapid patches before writing history once", async () => {
    installWindow();
    syncJournalUrl({ files: true });
    syncJournalUrl({ account: false });
    await flushMicrotasks();

    assert.equal(replaceStateCalls.length, 1);
    assert.equal(replaceStateCalls[0], "/?files=1");
    assert.equal(window.location.search, "?files=1");
  });

  it("clears the file param while keeping other flags", async () => {
    installWindow("?file=abc&account=1");
    syncJournalUrl({ file: null });
    syncJournalUrl({ account: true });
    await flushMicrotasks();

    assert.equal(replaceStateCalls.length, 1);
    assert.equal(replaceStateCalls[0], "/?account=1");
  });

  it("skips replaceState when the url is already correct", async () => {
    installWindow("?account=1");
    syncJournalUrl({ account: true });
    await flushMicrotasks();
    assert.equal(replaceStateCalls.length, 0);
  });
});
