"use client";

import { CreditCard, Sparkles } from "lucide-react";

export type LoyaltySectionTab = "card" | "points";

type Props = {
  value: LoyaltySectionTab;
  onChange: (value: LoyaltySectionTab) => void;
};

const tabs: Array<{
  id: LoyaltySectionTab;
  label: string;
  description: string;
  icon: typeof CreditCard;
}> = [
  {
    id: "card",
    label: "بطاقة الولاء",
    description: "تصميم البطاقة، الأختام، الشعار والباركود",
    icon: CreditCard,
  },
  {
    id: "points",
    label: "نقاط الولاء",
    description: "قيمة النقطة، قواعد الكسب والاستبدال",
    icon: Sparkles,
  },
];

export function LoyaltySectionTabs({ value, onChange }: Props) {
  return (
    <div className="grid gap-3 md:grid-cols-2" role="tablist" aria-label="أقسام الولاء">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const selected = tab.id === value;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`flex min-w-0 items-center gap-3 rounded-[14px] border px-4 py-3 text-right transition ${
              selected
                ? "border-[#D9A33F] bg-[#4A281D] text-[#FCF8F3] shadow-[0_14px_34px_rgba(49,25,18,0.16)]"
                : "border-[#E7D7C6] bg-[#FCF8F3] text-[#311912] hover:border-[#D9A33F]/60"
            }`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                selected ? "bg-white/10 text-[#D9A33F]" : "bg-white text-[#6B3A25]"
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black">{tab.label}</span>
              <span className={`mt-1 block text-xs font-bold ${selected ? "text-[#F2E7D9]" : "text-[#806A5E]"}`}>
                {tab.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
