type FinanceSelectProps = {
  label: string;
  options: string[];
};

export function FinanceSelect({ label, options }: FinanceSelectProps) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-black text-[#6D5544]">{label}</span>
      <select className="h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] bg-white px-2 text-[12px] font-bold text-[#2F241D] outline-none">
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
