type Option = {
  id: string;
  label: string;
  meta?: string;
};

type EntitySelectProps = {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  actionLabel?: string;
  onAction?: () => void;
};

export function EntitySelect({ label, value, options, onChange, actionLabel, onAction }: EntitySelectProps) {
  return (
    <label className="grid gap-2 text-sm font-black text-[#3A2117]">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="rounded-full border border-[#D9A33F]/40 bg-[#FFF9EF] px-3 py-1 text-xs font-black text-[#6B3A25] transition hover:bg-[#F7E6C3]"
          >
            {actionLabel}
          </button>
        ) : null}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-2xl border border-[#E7D7C6] bg-white px-3 text-sm font-bold text-[#311912] outline-none transition focus:border-[#D9A33F]"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
            {option.meta ? ` - ${option.meta}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
