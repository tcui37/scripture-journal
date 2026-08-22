"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface ComboboxOption {
  readonly id: string;
  readonly label: string;
}

interface ComboboxProps {
  /** Names the control for screen readers; the visible label sits outside. */
  label: string;
  options: readonly ComboboxOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** Longest list we will put in the DOM at once; the rest needs a narrower query. */
const MAX_VISIBLE = 300;

/**
 * A select that can be typed into.
 *
 * There are ninety-odd English translations and well over a thousand across
 * all languages, which is more than a native `<select>` can reasonably be
 * scrolled through. This keeps the same single-value semantics but filters as
 * you type, matching either the label or the short id — so "niv", "king" and
 * "standard" all find something.
 *
 * Built from an input plus a listbox rather than `<datalist>`, which cannot be
 * styled and behaves differently in every browser.
 */
export default function Combobox({
  label,
  options,
  value,
  onChange,
  disabled = false,
  placeholder = "Search…",
}: ComboboxProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((option) => option.id === value);

  // Matching on the id as well as the label is what lets "niv" and "lsv" find
  // their translation — the short form is the part people remember.
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.id.toLowerCase().includes(needle),
    );
  }, [options, query]);

  const matches = useMemo(() => filtered.slice(0, MAX_VISIBLE), [filtered]);
  const hidden = filtered.length - matches.length;

  // Opening should land on the current selection, not the top of the list.
  useEffect(() => {
    if (!open) return;
    const index = matches.findIndex((option) => option.id === value);
    setActive(index >= 0 ? index : 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the highlight in range as the query narrows the list.
  useEffect(() => {
    setActive((prev) => (prev < matches.length ? prev : 0));
  }, [matches.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Follow the highlight when it moves by keyboard.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function commit(option: ComboboxOption) {
    onChange(option.id);
    close();
    inputRef.current?.blur();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((prev) => {
        if (!matches.length) return 0;
        return (prev + step + matches.length) % matches.length;
      });
      return;
    }

    if (event.key === "Enter") {
      if (open && matches[active]) {
        event.preventDefault();
        commit(matches[active]);
      }
      return;
    }

    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        close();
      }
      return;
    }

    if (event.key === "Tab" && open) close();
  }

  return (
    <div className="combobox" ref={wrapperRef}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && matches[active] ? `${listId}-${active}` : undefined
        }
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        className="combobox-input"
        // Closed, this reads as the current choice; open, it is the query box.
        value={open ? query : (selected?.label ?? "")}
        placeholder={selected ? placeholder : (placeholder ?? "")}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      <svg
        className="combobox-chevron"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>

      {open ? (
        <ul className="combobox-list" id={listId} role="listbox" ref={listRef}>
          {matches.map((option, index) => (
            <li
              key={option.id}
              id={`${listId}-${index}`}
              data-index={index}
              role="option"
              aria-selected={option.id === value}
              className={`combobox-option${index === active ? " is-active" : ""}${
                option.id === value ? " is-selected" : ""
              }`}
              // Pointer down beats blur, so the click always registers.
              onPointerDown={(event) => {
                event.preventDefault();
                commit(option);
              }}
              onPointerEnter={() => setActive(index)}
            >
              {option.label}
            </li>
          ))}

          {!matches.length ? (
            <li className="combobox-empty">No match for “{query.trim()}”</li>
          ) : null}

          {hidden > 0 ? (
            <li className="combobox-empty">
              {hidden} more — keep typing to narrow
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
