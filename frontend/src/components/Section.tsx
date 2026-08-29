import { useId, type ReactNode } from "react";

interface SectionProps {
  title: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}

/**
 * A collapsible sidebar group with animated open/close. Uses a button +
 * CSS grid accordion so height transitions smoothly; `open` is controlled by
 * the parent so the choice can be remembered between visits.
 */
export default function Section({ title, open, onToggle, children }: SectionProps) {
  const panelId = useId();

  return (
    <div className={`section${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="section-title"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onToggle(!open)}
      >
        <h2 className="section-name">{title}</h2>
        <svg
          className="chevron"
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
      </button>
      <div
        id={panelId}
        className="section-panel"
        aria-hidden={!open}
        {...(!open ? { inert: true } : {})}
      >
        <div className="section-panel-inner">
          <div className="section-body">{children}</div>
        </div>
      </div>
    </div>
  );
}
