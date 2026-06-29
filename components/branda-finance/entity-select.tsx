type EntitySelectOption = {
  id: string;
  label: string;
  meta?: string;
};

type EntitySelectProps = {
  label: string;
  value: string;
  options: EntitySelectOption[];
  onChange: (value: string) => void;
  actionLabel?: string;
  onAction?: () => void;
};

export function EntitySelect({
  label,
  value,
  options,
  onChange,
  actionLabel,
  onAction,
}: EntitySelectProps) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 flex min-w-0 items-center justify-between gap-2 text-[11px] font-black text-[#6D5544]">
        <span className="min-w-0 truncate">{label}</span>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 rounded-[8px] border border-[#D9BD87] bg-[#F8E8C9] px-2 py-1 text-[10px] font-black text-[#6B431C] transition hover:bg-[#F1D9A8]"
          >
            {actionLabel}
          </button>
        ) : null}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] bg-white px-2 text-[12px] font-bold text-[#2F241D] outline-none transition focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20"
      >
        {!options.length ? (
          <option value="">لا توجد بيانات</option>
        ) : value ? null : (
          <option value="">غير محدد</option>
        )}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.meta ? `${option.label} - ${option.meta}` : option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
