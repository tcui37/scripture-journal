"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { AccountError, authHref, fetchFile } from "@/lib/account";
import { syncJournalUrl } from "@/lib/journal-url";
import type { JournalFile } from "@/lib/types";

import { useLibrary } from "@/components/LibraryProvider";

/**
 * Opens the file a `?file=` link names, once saved state and the API are
 * ready, then drops the id from the URL so a reload does not reopen it.
 */
export function usePendingFile(
  fileId: string | null,
  ready: boolean,
  applyFile: (file: JournalFile) => void,
  setStatus: (status: string) => void,
) {
  const router = useRouter();
  const { getCachedFile } = useLibrary();
  const pendingRef = useRef(fileId);
  const applyRef = useRef(applyFile);
  applyRef.current = applyFile;

  useEffect(() => {
    const id = pendingRef.current;
    if (!ready || !id) return;

    pendingRef.current = null;
    let cancelled = false;

    const open = (file: JournalFile) => {
      if (cancelled) return;
      applyRef.current(file);
      syncJournalUrl({ file: null });
    };

    const cached = getCachedFile(id);
    if (cached) {
      open(cached);
      return;
    }

    fetchFile(id)
      .then(open)
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof AccountError && error.status === 401) {
          router.push(authHref("login", "/"));
          return;
        }
        if (error instanceof AccountError && error.status === 404) return;
        setStatus(error instanceof Error ? error.message : "Could not open file");
      });

    return () => {
      cancelled = true;
    };
  }, [ready, getCachedFile, router, setStatus]);
}
