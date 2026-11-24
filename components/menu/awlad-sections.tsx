import { Coffee, Scissors, Sparkles } from "lucide-react";
import type { AwladSection } from "@/lib/menu/awlad-al-izz-catalog";

const sections = [
  { id: "salon", label: "الصالون", Icon: Scissors },
  { id: "cafe", label: "المنيو", Icon: Coffee },
  { id: "laser", label: "الليزر", Icon: Sparkles },
] as const;

export function AwladSections({ selected, onSelect }: { selected: AwladSection; onSelect: (section: AwladSection) => void }) {
  return <div role="group" aria-label="أقسام الخدمات والمنيو" className="col-span-full inline-flex flex-wrap gap-1 rounded-xl border border-stone-200 bg-white p-1">
    {sections.map(({ id, label, Icon }) => <button key={id} type="button" aria-pressed={selected === id}
      onClick={() => onSelect(id)} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold aria-pressed:bg-[#1609b8] aria-pressed:text-white">
      <Icon size={16} aria-hidden="true" />{label}
    </button>)}
  </div>;
}
