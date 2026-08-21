interface Option<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly hint?: string;
}

interface OptionGroupProps<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Layout of the button grid. */
  variant?: "stack" | "grid-2" | "grid-3";
  /** Taller buttons with a hint line underneath. */
  tall?: boolean;
  label: string;
}

/** A segmented control rendered as a row/grid of pill buttons. */
export default function OptionGroup<T extends string>({
  options,
  value,
  onChange,
  variant = "grid-2",
  tall = false,
  label,
}: OptionGroupProps<T>) {
  return (
    <div className={variant} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`opt${tall ? " is-tall" : ""}${selected ? " is-on" : ""}`}
            onClick={() => onChange(option.id)}
          >
            {option.hint ? (
              <>
                <span className="opt-label">{option.label}</span>
                <span className="opt-hint">{option.hint}</span>
              </>
            ) : (
              option.label
            )}
          </button>
        );
      })}
    </div>
  );
}
