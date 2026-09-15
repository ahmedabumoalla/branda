"use client";

import { Coins, ReceiptText, TrendingUp, Wallet } from "lucide-react";
import type { LoyaltyPointsSettings } from "@/lib/loyalty/types";

type Props = {
  points: LoyaltyPointsSettings;
};

export function LoyaltyPointsSummary({ points }: Props) {
  const availableValue = Math.round(points.customerPointsBalance * points.pointValueSar * 100) / 100;
  const usedValue = Math.round(points.usedPoints * points.pointValueSar * 100) / 100;

  const stats = [
    { label: "الرصيد", value: `${points.customerPointsBalance} نقطة`, hint: `${availableValue} ر.س`, icon: Wallet },
    { label: "قيمة النقطة", value: `${points.pointValueSar} ر.س`, hint: "قابلة للتعديل", icon: Coins },
    { label: "نقاط مستخدمة", value: points.usedPoints, hint: `${usedValue} ر.س`, icon: ReceiptText },
    { label: "آخر عملية", value: `+${points.earnedLastOperation}`, hint: `${points.sampleInvoiceAmount} ر.س`, icon: TrendingUp },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.label} className="rounded-[14px] border border-[#E7D7C6] bg-[#FCF8F3] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black text-[#806A5E]">{stat.label}</p>
              <Icon className="h-4 w-4 text-[#6B3A25]" />
            </div>
            <p className="mt-2 text-xl font-black text-[#311912]">{stat.value}</p>
            <p className="mt-1 text-xs font-bold text-[#806A5E]">{stat.hint}</p>
          </div>
        );
      })}
    </div>
  );
}
