"use client";

import { Eye, Move, Palette, ToggleLeft, ToggleRight } from "lucide-react";
import { LoyaltyIconPicker } from "@/components/loyalty/loyalty-icon-picker";
import { LoyaltyLogoUploader } from "@/components/loyalty/loyalty-logo-uploader";
import { NeumoInput, NeumoTextarea } from "@/components/ui/design-system";
import type { LoyaltyCardDesign } from "@/lib/loyalty/types";

type Props = {
  value: LoyaltyCardDesign;
  onChange: (value: LoyaltyCardDesign) => void;
};

type LayerKey = "logo" | "pointsBadge" | "barcode";

function percentLabel(value: number) {
  return `${Math.round(value)}%`;
}

export function LoyaltyCardBuilder({ value, onChange }: Props) {
  function patch(next: Partial<LoyaltyCardDesign>) {
    onChange({ ...value, ...next });
  }

  function updateLayer(layer: LayerKey, field: "X" | "Y" | "Width" | "Height", nextValue: number) {
    const key = `${layer}${field}` as keyof LoyaltyCardDesign;
    patch({ [key]: nextValue } as Partial<LoyaltyCardDesign>);
  }

  function LayerSlider({
    label,
    layer,
    field,
    min = 0,
    max = 100,
  }: {
    label: string;
    layer: LayerKey;
    field: "X" | "Y" | "Width" | "Height";
    min?: number;
    max?: number;
  }) {
    const key = `${layer}${field}` as keyof LoyaltyCardDesign;
    const current = Number(value[key] ?? 0);

    return (
      <label className="space-y-2">
        <span className="flex justify-between gap-2 text-xs font-black text-[#6B3A25]">
          <span>{label}</span>
          <span>{percentLabel(current)}</span>
        </span>
        <NeumoInput
          type="range"
          min={min}
          max={max}
          value={current}
          onChange={(event) => updateLayer(layer, field, Number(event.target.value))}
          className="h-10"
        />
      </label>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-[16px] border border-[#E7D7C6] bg-[#FCF8F3] p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-[#311912]">إعدادات البطاقة</h2>
            <p className="mt-1 text-xs font-bold text-[#806A5E]">كل التعديلات محفوظة محلياً داخل المعاينة.</p>
          </div>
          <button
            type="button"
            onClick={() => patch({ enabled: !value.enabled })}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black ${
              value.enabled ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {value.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
            {value.enabled ? "إيقاف بطاقة الولاء" : "تفعيل بطاقة الولاء"}
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <label className="space-y-2">
            <span className="text-xs font-black text-[#6B3A25]">اسم العلامة</span>
            <NeumoInput value={value.brandName} onChange={(event) => patch({ brandName: event.target.value })} />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black text-[#6B3A25]">عنوان البطاقة</span>
            <NeumoInput value={value.cardTitle} onChange={(event) => patch({ cardTitle: event.target.value })} />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black text-[#6B3A25]">عنوان المكافأة</span>
            <NeumoInput value={value.rewardTitle} onChange={(event) => patch({ rewardTitle: event.target.value })} />
          </label>
          <label className="space-y-2 lg:col-span-2">
            <span className="text-xs font-black text-[#6B3A25]">وصف البطاقة</span>
            <NeumoInput value={value.subtitle} onChange={(event) => patch({ subtitle: event.target.value })} />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black text-[#6B3A25]">النص المساند</span>
            <NeumoInput value={value.supportingText} onChange={(event) => patch({ supportingText: event.target.value })} />
          </label>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[16px] border border-[#E7D7C6] bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <Palette className="h-5 w-5 text-[#6B3A25]" />
            <h3 className="text-sm font-black text-[#311912]">الألوان والشعار</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-2">
              <span className="text-xs font-black text-[#6B3A25]">الخلفية</span>
              <NeumoInput type="color" value={value.cardBackground} onChange={(event) => patch({ cardBackground: event.target.value })} className="h-11 p-2" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-[#6B3A25]">النص</span>
              <NeumoInput type="color" value={value.cardForeground} onChange={(event) => patch({ cardForeground: event.target.value })} className="h-11 p-2" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-[#6B3A25]">التمييز</span>
              <NeumoInput type="color" value={value.cardAccent} onChange={(event) => patch({ cardAccent: event.target.value })} className="h-11 p-2" />
            </label>
          </div>
          <div className="mt-4">
            <LoyaltyLogoUploader
              label="شعار البطاقة"
              value={value.logoPreviewUrl}
              onChange={(logoPreviewUrl) => patch({ logoPreviewUrl })}
              removeLightBackground={value.logoRemoveLightBackground}
              tolerance={value.logoBackgroundTolerance}
              onRemoveLightBackgroundChange={(logoRemoveLightBackground) => patch({ logoRemoveLightBackground })}
              onToleranceChange={(logoBackgroundTolerance) => patch({ logoBackgroundTolerance })}
            />
          </div>
        </div>

        <div className="rounded-[16px] border border-[#E7D7C6] bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <Eye className="h-5 w-5 text-[#6B3A25]" />
            <h3 className="text-sm font-black text-[#311912]">الأختام وأيقونة التقدم</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-2">
              <span className="text-xs font-black text-[#6B3A25]">عدد الأختام</span>
              <NeumoInput type="number" min={1} max={16} value={value.stampsRequired} onChange={(event) => patch({ stampsRequired: Math.max(1, Number(event.target.value) || 1) })} />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-[#6B3A25]">المكتمل</span>
              <NeumoInput type="number" min={0} max={value.stampsRequired} value={value.completedStamps} onChange={(event) => patch({ completedStamps: Math.min(value.stampsRequired, Math.max(0, Number(event.target.value) || 0)) })} />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-[#6B3A25]">تسمية الختم</span>
              <NeumoInput value={value.stampLabel} onChange={(event) => patch({ stampLabel: event.target.value })} />
            </label>
          </div>
          <div className="mt-4">
            <LoyaltyIconPicker
              value={value.progressIcon}
              customIconPreviewUrl={value.customIconPreviewUrl}
              onChange={(progressIcon) => patch({ progressIcon })}
              onCustomIconChange={(customIconPreviewUrl) => patch({ customIconPreviewUrl })}
            />
          </div>
        </div>
      </div>

      <div className="rounded-[16px] border border-[#E7D7C6] bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <Move className="h-5 w-5 text-[#6B3A25]" />
          <h3 className="text-sm font-black text-[#311912]">السحب والحجم</h3>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-[14px] bg-[#FCF8F3] p-3">
            <p className="mb-3 text-xs font-black text-[#311912]">الشعار</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <LayerSlider label="يمين / يسار" layer="logo" field="X" max={90} />
              <LayerSlider label="أعلى / أسفل" layer="logo" field="Y" max={86} />
              <LayerSlider label="العرض" layer="logo" field="Width" min={8} max={36} />
              <LayerSlider label="الارتفاع" layer="logo" field="Height" min={8} max={36} />
            </div>
          </div>

          <div className="rounded-[14px] bg-[#FCF8F3] p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-black text-[#311912]">وسم النقاط</p>
              <button
                type="button"
                onClick={() => patch({ pointsBadgeVisible: !value.pointsBadgeVisible })}
                className="rounded-lg bg-white px-2 py-1 text-[11px] font-black text-[#6B3A25]"
              >
                {value.pointsBadgeVisible ? "إخفاء" : "إظهار"}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <LayerSlider label="يمين / يسار" layer="pointsBadge" field="X" max={85} />
              <LayerSlider label="أعلى / أسفل" layer="pointsBadge" field="Y" max={88} />
              <LayerSlider label="العرض" layer="pointsBadge" field="Width" min={18} max={42} />
              <LayerSlider label="الارتفاع" layer="pointsBadge" field="Height" min={10} max={24} />
            </div>
          </div>

          <div className="rounded-[14px] bg-[#FCF8F3] p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-black text-[#311912]">الباركود</p>
              <button
                type="button"
                onClick={() => patch({ barcodeVisible: !value.barcodeVisible })}
                className="rounded-lg bg-white px-2 py-1 text-[11px] font-black text-[#6B3A25]"
              >
                {value.barcodeVisible ? "إخفاء" : "إظهار"}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <LayerSlider label="يمين / يسار" layer="barcode" field="X" max={86} />
              <LayerSlider label="أعلى / أسفل" layer="barcode" field="Y" max={86} />
              <LayerSlider label="العرض" layer="barcode" field="Width" min={24} max={48} />
              <LayerSlider label="الارتفاع" layer="barcode" field="Height" min={14} max={30} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[16px] border border-[#E7D7C6] bg-white p-4">
        <label className="space-y-2">
          <span className="text-xs font-black text-[#6B3A25]">الشروط والنص السفلي</span>
          <NeumoTextarea value={value.terms} onChange={(event) => patch({ terms: event.target.value })} className="min-h-20" />
        </label>
      </div>
    </div>
  );
}
