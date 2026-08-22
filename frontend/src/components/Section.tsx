import type { ReactNode } from "react";

interface SectionProps {
  /** Step number shown before the title, e.g. "01". */
  index: string;
  title: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}

/**
 * A collapsible sidebar group. Built on <details> so it keeps native keyboard
 * and screen-reader behaviour; `open` is mirrored into state only so the
 * choice can be remembered between visits.
 */
export default function Section({ index, title, open, onToggle, children }: SectionProps) {
  return (
    <details
      className="section"
      open={open}
      onToggle={(event) => onToggle(event.currentTarget.open)}
    >
      <summary className="section-title">
        <span className="section-index">{index}</span>
        <span className="section-name">{title}</span>
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
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
