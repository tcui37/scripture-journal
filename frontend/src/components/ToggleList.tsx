interface Toggle<T extends string> {
  readonly id: T;
  readonly label: string;
}

interface ToggleListProps<T extends string> {
  title: string;
  toggles: readonly Toggle<T>[];
  values: Record<T, boolean>;
  onChange: (id: T, next: boolean) => void;
}

/**
 * Independent on/off settings as a checkbox list. A highlighted pill can't say
 * whether it means "on" or "selected"; a tick can.
 */
export default function ToggleList<T extends string>({
  title,
  toggles,
  values,
  onChange,
}: ToggleListProps<T>) {
  return (
    <div className="control">
      <div className="control-label">{title}</div>
      <div className="toggle-list">
        {toggles.map((toggle) => (
          <label key={toggle.id} className="toggle">
            <input
              type="checkbox"
              checked={values[toggle.id]}
              onChange={(event) => onChange(toggle.id, event.target.checked)}
            />
            <span className="toggle-box" aria-hidden="true" />
            <span>{toggle.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
