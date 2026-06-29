type FinanceStatusBadgeProps = {
  children: string;
  tone?: "green" | "gold" | "red" | "brown";
};

const toneClass = {
  green: "border-[#CFE2D8] bg-[#EDF7F2] text-[#2F5D50]",
  gold: "border-[#D6B677] bg-[#F8E8C9] text-[#6B431C]",
  red: "border-[#E6CFC8] bg-[#FFF7F4] text-[#9B3327]",
  brown: "border-[#D8C7B2] bg-[#FFFDF8] text-[#5B3926]",
};

export function FinanceStatusBadge({ children, tone = "gold" }: FinanceStatusBadgeProps) {
  return (
    <span className={`inline-flex max-w-full rounded-[8px] border px-2.5 py-1 text-[11px] font-black ${toneClass[tone]}`}>
      {children}
    </span>
  );
}
