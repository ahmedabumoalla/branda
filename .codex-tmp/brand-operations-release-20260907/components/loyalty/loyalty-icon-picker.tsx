"use client";

import { Crown, Gift, Heart, Star, Trophy } from "lucide-react";
import type { LoyaltyProgressIcon } from "@/lib/loyalty/types";
import { LoyaltyLogoUploader } from "@/components/loyalty/loyalty-logo-uploader";

type Props = {
  value: LoyaltyProgressIcon;
  customIconPreviewUrl?: string;
  onChange: (value: LoyaltyProgressIcon) => void;
  onCustomIconChange: (value?: string) => void;
};

const icons: Array<{ id: LoyaltyProgressIcon; label: string; icon: typeof Star }> = [
  { id: "star", label: "نجمة", icon: Star },
  { id: "cup", label: "كأس", icon: Trophy },
  { id: "gift", label: "هدية", icon: Gift },
  { id: "heart", label: "قلب", icon: Heart },
  { id: "crown", label: "تاج", icon: Crown },
];

export function LoyaltyIconPicker({ value, customIconPreviewUrl, onChange, onCustomIconChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {icons.map((item) => {
          const Icon = item.icon;
          const selected = item.id === value;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-black ${
                selected
                  ? "border-[#D9A33F] bg-[#FFF8EA] text-[#6B3A25]"
                  : "border-[#E7D7C6] bg-white text-[#806A5E]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>
      <LoyaltyLogoUploader
        label="أيقونة تقدم مخصصة"
        value={customIconPreviewUrl}
        onChange={onCustomIconChange}
      />
    </div>
  );
}
