interface FilterGroupProps {
  label: string;
  options: string[];
  labels: string[];
  value: string;
  onChange: (val: string) => void;
  colors?: string[];
}

// One labelled row of toggle badges inside a filter dropdown. Clicking the
// active option clears it, so every group is optional.
export default function FilterGroup({
  label,
  options,
  labels,
  value,
  onChange,
  colors,
}: FilterGroupProps): JSX.Element {
  return (
    <div>
      <div className="text-sm text-base-content/40 mb-1.5">{label}</div>
      <div className="flex gap-1 flex-wrap">
        {options.map((opt, i) => {
          const color = colors?.[i];
          const cls = color
            ? value === opt
              ? `badge-${color}`
              : `badge-soft badge-${color}`
            : value === opt
              ? "badge-neutral"
              : "badge-soft";
          return (
            <button
              key={opt}
              className={`badge badge-sm cursor-pointer ${cls}`}
              onClick={() => onChange(value === opt ? "" : opt)}
            >
              {labels[i]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
