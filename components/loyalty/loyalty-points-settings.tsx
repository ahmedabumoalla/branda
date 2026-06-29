"use client";

import { ToggleLeft, ToggleRight } from "lucide-react";
import { LoyaltyPointsSummary } from "@/components/loyalty/loyalty-points-summary";
import { NeumoInput, NeumoTextarea } from "@/components/ui/design-system";
import type { LoyaltyPointsSettings as LoyaltyPointsSettingsType } from "@/lib/loyalty/types";

type Props = {
  value: LoyaltyPointsSettingsType;
  onChange: (value: LoyaltyPointsSettingsType) => void;
};

export function LoyaltyPointsSettings({ value, onChange }: Props) {
  function patch(next: Partial<LoyaltyPointsSettingsType>) {
    onChange({ ...value, ...next });
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="rounded-[16px] border border-[#E7D7C6] bg-[#FCF8F3] p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[#311912]">قسم نقاط الولاء</h2>
            <p className="mt-1 text-xs font-bold text-[#806A5E]">قواعد مالية واضحة لقيمة النقطة والاستبدال والرصيد الظاهر للعميل.</p>
          </div>
          <button
            type="button"
            onClick={() => patch({ enabled: !value.enabled })}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black ${
              value.enabled ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {value.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
            {value.enabled ? "مفعلة" : "متوقفة"}
          </button>
        </div>

        <LoyaltyPointsSummary points={value} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-[16px] border border-[#E7D7C6] bg-white p-4">
          <h3 className="text-base font-black text-[#311912]">القيمة والاستبدال</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-black text-[#6B3A25]">قيمة النقطة بالريال</span>
              <NeumoInput type="number" min={0} step="0.01" value={value.pointValueSar} onChange={(event) => patch({ pointValueSar: Number(event.target.value) || 0 })} />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-[#6B3A25]">الحد الأدنى للاستبدال</span>
              <NeumoInput type="number" min={0} value={value.minimumRedemptionPoints} onChange={(event) => patch({ minimumRedemptionPoints: Number(event.target.value) || 0 })} />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-[#6B3A25]">رصيد عميل للمعاينة</span>
              <NeumoInput type="number" min={0} value={value.customerPointsBalance} onChange={(event) => patch({ customerPointsBalance: Number(event.target.value) || 0 })} />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-[#6B3A25]">نقاط مستخدمة</span>
              <NeumoInput type="number" min={0} value={value.usedPoints} onChange={(event) => patch({ usedPoints: Number(event.target.value) || 0 })} />
            </label>
          </div>
        </div>

        <div className="rounded-[16px] border border-[#E7D7C6] bg-white p-4">
          <h3 className="text-base font-black text-[#311912]">قواعد البرنامج</h3>
          <div className="mt-4 grid gap-4">
            <label className="space-y-2">
              <span className="text-xs font-black text-[#6B3A25]">قاعدة الكسب</span>
              <NeumoInput value={value.earningRule} onChange={(event) => patch({ earningRule: event.target.value })} />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-[#6B3A25]">قاعدة الاستبدال</span>
              <NeumoInput value={value.redemptionRule} onChange={(event) => patch({ redemptionRule: event.target.value })} />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-[#6B3A25]">انتهاء النقاط بعد عدد أيام</span>
              <NeumoInput type="number" min={0} value={value.expiryDays} onChange={(event) => patch({ expiryDays: Number(event.target.value) || 0 })} />
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-[16px] border border-[#E7D7C6] bg-white p-4">
        <label className="space-y-2">
          <span className="text-xs font-black text-[#6B3A25]">سياسة النقاط الظاهرة للعميل</span>
          <NeumoTextarea value={value.policyText} onChange={(event) => patch({ policyText: event.target.value })} className="min-h-24" />
        </label>
      </div>
    </div>
  );
}
