export function FinanceEmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[8px] border border-dashed border-[#D6B677] bg-[#FFF8EA] p-4 text-[12px] font-bold leading-6 text-[#6B431C]">
      <p className="font-black">{title}</p>
      <p className="mt-1">{detail}</p>
    </div>
  );
}
