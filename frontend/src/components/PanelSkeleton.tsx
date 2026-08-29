interface PanelSkeletonProps {
  label: string;
}

/** In-place placeholder while a signed-in panel fetches its list. */
export default function PanelSkeleton({ label }: PanelSkeletonProps) {
  return (
    <div className="panel-skeleton" role="status" aria-live="polite" aria-label={label}>
      <span className="visually-hidden">{label}</span>
      <div className="skeleton-line" />
      <div className="skeleton-line" />
      <div className="skeleton-line is-short" />
    </div>
  );
}
