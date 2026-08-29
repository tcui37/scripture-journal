interface TrashButtonProps {
  confirming: boolean;
  disabled?: boolean;
  label?: string;
  onClick: () => void;
}

export default function TrashButton({
  confirming,
  disabled,
  label = "Remove",
  onClick,
}: TrashButtonProps) {
  const ariaLabel = confirming ? `Confirm ${label.toLowerCase()}` : label;

  return (
    <button
      type="button"
      className={`icon-button${confirming ? " is-danger is-label" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
      {confirming ? <span>Confirm</span> : null}
    </button>
  );
}
