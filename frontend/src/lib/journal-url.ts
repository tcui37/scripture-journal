/** Shallow URL sync for the journal shell — avoids Next.js router navigation. */

export type JournalUrlPanel = {
  files?: boolean;
  account?: boolean;
  file?: string | null;
};

export function readJournalPanelsFromSearch(params: URLSearchParams): {
  files: boolean;
  account: boolean;
  fileId: string | null;
} {
  return {
    files: params.get("files") === "1",
    account: params.get("account") === "1",
    fileId: params.get("file"),
  };
}

/** Update query params with history.replaceState (no Next.js remount). */
export function syncJournalUrl(patch: JournalUrlPanel): void {
  if (typeof window === "undefined") return;

  const search = new URLSearchParams(window.location.search);

  if (patch.files !== undefined) {
    if (patch.files) search.set("files", "1");
    else search.delete("files");
  }
  if (patch.account !== undefined) {
    if (patch.account) search.set("account", "1");
    else search.delete("account");
  }
  if (patch.file !== undefined) {
    if (patch.file) search.set("file", patch.file);
    else search.delete("file");
  }

  const query = search.toString();
  const next = query ? `/?${query}` : "/";
  const current = `${window.location.pathname}${window.location.search}`;
  if (current !== next) {
    window.history.replaceState(null, "", next);
  }
}
