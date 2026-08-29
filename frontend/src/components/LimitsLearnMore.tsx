"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { limitExplanations } from "@/lib/limits";
import type { BibleSummary, Book, Reference } from "@/lib/types";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

interface LimitsLearnMoreProps {
  bibles: BibleSummary[];
  book: Book | undefined;
  reference: Reference;
}

export default function LimitsLearnMore({ bibles, book, reference }: LimitsLearnMoreProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const explanations = useMemo(
    () =>
      limitExplanations(
        bibles,
        [reference.bibleId, reference.compareId],
        book,
        reference,
      ),
    [bibles, book, reference],
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    const previously = document.activeElement as HTMLElement | null;

    const items = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    items()[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previously && document.contains(previously)) previously.focus();
      else trigger?.focus();
    };
  }, [open]);

  if (!explanations.length) return null;

  const plural = explanations.length > 1;
  const title = plural ? "Print limits" : `${explanations[0].version} print limit`;

  const dialog =
    mounted && open
      ? createPortal(
          <div className="limits-dialog-root">
            <button
              type="button"
              className="limits-dialog-backdrop"
              aria-label="Close licence details"
              onClick={() => setOpen(false)}
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="limits-dialog"
            >
              <div className="limits-dialog-heading">
                <div>
                  <p className="limits-dialog-eyebrow">Licence terms</p>
                  <h2 id={titleId} className="limits-dialog-title">
                    {title}
                  </h2>
                </div>
                <button
                  type="button"
                  className="icon-btn dialog-close"
                  aria-label="Close licence details"
                  onClick={() => setOpen(false)}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="limits-dialog-body">
                {explanations.map((entry) => (
                  <section key={entry.version} className="limits-dialog-block">
                    {plural ? <h3 className="limits-dialog-version">{entry.version}</h3> : null}
                    <p>{entry.rule}</p>
                    {entry.href ? (
                      <p className="limits-dialog-source">
                        <a href={entry.href} target="_blank" rel="noreferrer noopener">
                          {entry.hrefLabel}
                        </a>
                      </p>
                    ) : null}
                  </section>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="learn-more"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        learn more
      </button>
      {dialog}
    </>
  );
}
