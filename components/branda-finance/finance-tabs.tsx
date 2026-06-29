type FinanceTabsProps = {
  tabs: string[];
  active?: string;
};

export function FinanceTabs({ tabs, active = tabs[0] }: FinanceTabsProps) {
  return (
    <div className="flex max-w-full flex-wrap gap-1.5 rounded-[8px] border border-[#E8D8C2] bg-[#FFFDF8] p-2">
      {tabs.map((tab) => (
        <span
          key={tab}
          className={`rounded-[8px] px-3 py-1.5 text-[11px] font-black ${
            tab === active ? "bg-[#5B3926] text-white" : "border border-[#E1D1BD] bg-white text-[#5B3926]"
          }`}
        >
          {tab}
        </span>
      ))}
    </div>
  );
}
