"use client";

import { useEffect, useRef, useState } from "react";

import { computeFilePageCounts } from "@/lib/file-page-counts";
import { Measurer } from "@/lib/paginate";
import type { JournalFile, Reference } from "@/lib/types";

/**
 * Compute per-file page counts when the Files panel is visible.
 * Defers DOM measurement until fonts are ready; aborts on unmount.
 */
/** Panel mounts only when the Files tab is open — no enabled gate needed. */
export function useFilePageCounts(
  files: readonly JournalFile[],
  bibleId: string,
  compareId: string,
): Record<string, number> {
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  const measurerRef = useRef<Measurer | null>(null);
  const [measureReady, setMeasureReady] = useState(false);

  useEffect(() => {
    const measurer = new Measurer();
    measurerRef.current = measurer;

    let cancelled = false;
    const markReady = () => {
      if (!cancelled) setMeasureReady(true);
    };

    if (document.fonts) void document.fonts.ready.then(markReady);
    else markReady();

    return () => {
      cancelled = true;
      measurer.destroy();
      measurerRef.current = null;
      setMeasureReady(false);
    };
  }, []);

  useEffect(() => {
    const measurer = measurerRef.current;
    if (!measureReady || !measurer || !files.length || !bibleId) {
      if (!files.length) setPageCounts({});
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    void computeFilePageCounts(files, bibleId, compareId, measurer, controller.signal).then(
      (next) => {
        if (!cancelled) setPageCounts(next);
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [files, measureReady, bibleId, compareId]);

  return pageCounts;
}
