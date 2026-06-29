type FinanceStatCardProps = {
  label: string;
  value: string;
  hint?: string;
  tone?: "green" | "gold" | "red" | "brown";
};

const toneClass = {
  green: "border-[#CFE2D8] bg-[#EDF7F2]",
  gold: "border-[#D6B677] bg-[#FFF8EA]",
  red: "border-[#E6CFC8] bg-[#FFF7F4]",
  brown: "border-[#D8C3A2] bg-[#FFFDF8]",
};

export function FinanceStatCard({ label, value, hint, tone = "brown" }: FinanceStatCardProps) {
  return (
    <div className={`min-w-0 rounded-[8px] border p-3 shadow-[0_10px_22px_rgba(69,43,28,0.06)] ${toneClass[tone]}`}>
      <p className="truncate text-[11px] font-black text-[#806A58]">{label}</p>
      <p className="mt-1 truncate text-lg font-black text-[#2F241D]" dir="auto">{value}</p>
      {hint ? <p className="mt-1 truncate text-[11px] font-bold text-[#806A58]">{hint}</p> : null}
    </div>
  );
}
