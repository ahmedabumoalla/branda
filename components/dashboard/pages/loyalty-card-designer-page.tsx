"use client";

import Link from "next/link";
import {
  ArrowRight,
  Badge,
  Barcode,
  Check,
  CircleDot,
  Image,
  Palette,
  QrCode,
  RotateCcw,
  Save,
  Settings,
  Stamp,
  TextCursorInput,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useState } from "react";
import { saveLoyaltyCardProgramAction } from "@/app/actions/loyalty-cards";
import { saveLoyaltySettingsAction } from "@/app/actions/loyalty";
import { LoyaltyIconPicker } from "@/components/loyalty/loyalty-icon-picker";
import {
  LoyaltyCardPreview,
  type LoyaltyDesignerLayer,
  type LoyaltyGraphicLayer,
} from "@/components/loyalty/loyalty-card-preview";
import { LoyaltyLogoUploader } from "@/components/loyalty/loyalty-logo-uploader";
import { buildLoyaltyDashboardState } from "@/lib/loyalty/production-state";
import type { LoyaltyCardsDashboard } from "@/lib/data/loyalty-cards";
import type { LoyaltySettings } from "@/lib/mock/loyalty";
import type {
  LoyaltyCardDesign,
  LoyaltyDashboardState,
  LoyaltyTextAlign,
  LoyaltyTextElementId,
} from "@/lib/loyalty/types";

type DesignerGroup = "texts" | "logo" | "colors" | "stamps" | "barcode" | "qr" | "points" | "settings";

const inputClass =
  "h-8 w-full rounded-lg border border-[#D8C3A2] bg-white px-2 text-right text-[12px] font-bold text-[#2F241D] outline-none focus:border-[#9C6B2E]";
const textareaClass =
  "min-h-16 w-full resize-none rounded-lg border border-[#D8C3A2] bg-white px-2 py-2 text-right text-[12px] font-bold leading-5 text-[#2F241D] outline-none focus:border-[#9C6B2E]";
const labelClass = "space-y-1 text-[11px] font-black text-[#6B3A25]";

const groups: Array<{
  id: DesignerGroup;
  label: string;
  icon: typeof TextCursorInput;
  layer?: LoyaltyGraphicLayer;
}> = [
  { id: "texts", label: "النصوص", icon: TextCursorInput },
  { id: "logo", label: "الشعار", icon: Image, layer: "logo" },
  { id: "colors", label: "الألوان", icon: Palette },
  { id: "stamps", label: "الأختام", icon: Stamp },
  { id: "barcode", label: "الباركود", icon: Barcode, layer: "barcode" },
  { id: "qr", label: "QR", icon: QrCode, layer: "qr" },
  { id: "points", label: "النقاط", icon: Badge, layer: "points" },
  { id: "settings", label: "الإعدادات", icon: Settings },
];

const layerLabels: Record<LoyaltyGraphicLayer, string> = {
  logo: "الشعار",
  points: "وسم النقاط",
  barcode: "الباركود",
  qr: "رمز QR",
};

const layerDefaults: Record<LoyaltyGraphicLayer, { x: number; y: number; width: number; height: number }> = {
  logo: { x: 84, y: 6, width: 10, height: 10 },
  points: { x: 7, y: 13, width: 29, height: 19 },
  barcode: { x: 42, y: 45, width: 48, height: 21 },
  qr: { x: 7, y: 54, width: 25, height: 36 },
};

const textElementOrder: LoyaltyTextElementId[] = [
  "brand",
  "title",
  "subtitle",
  "reward",
  "helper",
  "pointsLabel",
  "pointsValue",
  "pointsValueSar",
  "barcodeLabel",
];

const textElementLabels: Record<LoyaltyTextElementId, string> = {
  brand: "اسم العلامة",
  title: "العنوان الرئيسي",
  subtitle: "النص الوصفي",
  reward: "نص المكافأة",
  helper: "النص المساعد",
  pointsLabel: "نص النقاط",
  pointsValue: "قيمة النقاط",
  pointsValueSar: "قيمة النقاط بالريال",
  barcodeLabel: "نص الباركود",
};

const legacyFieldByTextElement: Partial<Record<LoyaltyTextElementId, keyof LoyaltyCardDesign>> = {
  brand: "brandName",
  title: "cardTitle",
  subtitle: "subtitle",
  reward: "rewardTitle",
  helper: "supportingText",
};

type Props = {
  initialDashboard: LoyaltyCardsDashboard | null;
  initialSettings: LoyaltySettings | null;
  configError?: string;
};

const emptySettings: LoyaltySettings = {
  pointsPerSar: 1,
  welcomePoints: 0,
  enabled: false,
  earnRules: [],
  redemptionRules: [],
};

function pointsToSettings(current: LoyaltySettings, state: LoyaltyDashboardState): LoyaltySettings {
  const points = state.points;
  const earnRule = current.earnRules[0] ?? {
    id: "designer_earn_rule",
    type: "purchase_per_sar" as const,
    title: points.earningRule,
    enabled: true,
    pointsPerSar: current.pointsPerSar,
  };
  const redemptionRule = current.redemptionRules[0] ?? {
    id: "designer_redemption_rule",
    type: "fixed_discount" as const,
    title: points.redemptionRule,
    enabled: true,
    pointsCost: Math.max(1, points.minimumRedemptionPoints || 1),
    discountAmount: 0,
    description: points.policyText,
  };

  return {
    ...current,
    enabled: points.enabled,
    earnRules: [{ ...earnRule, enabled: points.enabled, title: points.earningRule || earnRule.title }, ...current.earnRules.slice(1)],
    redemptionRules: [
      {
        ...redemptionRule,
        enabled: points.enabled,
        title: points.redemptionRule || redemptionRule.title,
        pointsCost: Math.max(1, points.minimumRedemptionPoints || redemptionRule.pointsCost || 1),
        description: points.policyText,
      },
      ...current.redemptionRules.slice(1),
    ],
  };
}

function isGraphicLayer(layer: LoyaltyDesignerLayer | null): layer is LoyaltyGraphicLayer {
  return layer === "logo" || layer === "points" || layer === "barcode" || layer === "qr";
}

function isTextLayer(layer: LoyaltyDesignerLayer | null): layer is `text:${LoyaltyTextElementId}` {
  return typeof layer === "string" && layer.startsWith("text:");
}

function textLayerId(layer: `text:${LoyaltyTextElementId}`) {
  return layer.slice(5) as LoyaltyTextElementId;
}

export function LoyaltyCardDesignerPage({ initialDashboard, initialSettings, configError }: Props) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [settings, setSettings] = useState<LoyaltySettings>(initialSettings ?? emptySettings);
  const [initialState, setInitialState] = useState<LoyaltyDashboardState>(() =>
    buildLoyaltyDashboardState({
      cafeName: initialDashboard?.cafeName ?? "Branda",
      program: initialDashboard?.program ?? null,
      cards: initialDashboard?.cards ?? [],
      settings: initialSettings ?? emptySettings,
    }),
  );
  const [draft, setDraft] = useState<LoyaltyDashboardState>(initialState);
  const [activeGroup, setActiveGroup] = useState<DesignerGroup>("texts");
  const [activeLayer, setActiveLayer] = useState<LoyaltyDesignerLayer | null>("text:title");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function patchCard(next: Partial<LoyaltyCardDesign>) {
    setDraft((current) => ({ ...current, card: { ...current.card, ...next } }));
  }

  function patchPoints(next: Partial<LoyaltyDashboardState["points"]>) {
    setDraft((current) => ({ ...current, points: { ...current.points, ...next } }));
  }

  async function saveDesign() {
    if (!dashboard) {
      setMessage(configError || "تعذر تحميل بيانات الولاء للحفظ.");
      window.setTimeout(() => setMessage(""), 2600);
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const card = draft.card;
      const nextSettings = pointsToSettings(settings, draft);
      await saveLoyaltyCardProgramAction({
        enabled: card.enabled,
        cardTitle: card.cardTitle,
        cardSubtitle: card.subtitle,
        purchasesRequired: card.stampsRequired,
        rewardProductId: dashboard.program.rewardProductId,
        rewardName: card.rewardTitle,
        stampLabel: card.stampLabel,
        terms: card.terms,
        cardBackground: card.cardBackground,
        cardForeground: card.cardForeground,
        cardAccent: card.cardAccent,
        cardDesign: card,
      });
      await saveLoyaltySettingsAction(nextSettings);

      const nextDashboard = {
        ...dashboard,
        program: {
          ...dashboard.program,
          enabled: card.enabled,
          cardTitle: card.cardTitle,
          cardSubtitle: card.subtitle,
          purchasesRequired: card.stampsRequired,
          rewardName: card.rewardTitle,
          stampLabel: card.stampLabel,
          terms: card.terms,
          cardBackground: card.cardBackground,
          cardForeground: card.cardForeground,
          cardAccent: card.cardAccent,
          cardDesign: card,
        },
      };
      setDashboard(nextDashboard);
      setSettings(nextSettings);
      setInitialState(draft);
      setMessage("تم حفظ تصميم البطاقة في قاعدة البيانات");
    } catch {
      setMessage("تعذر حفظ تصميم البطاقة");
    } finally {
      setSaving(false);
      window.setTimeout(() => setMessage(""), 2600);
    }
  }

  function resetPreview() {
    setDraft(initialState);
    setActiveGroup("texts");
    setActiveLayer("text:title");
    setMessage("تمت إعادة المعاينة لآخر تصميم محفوظ");
    window.setTimeout(() => setMessage(""), 2200);
  }

  function selectGroup(group: DesignerGroup) {
    setActiveGroup(group);
    const target = groups.find((item) => item.id === group)?.layer;
    if (target) setActiveLayer(target);
  }

  function layerPrefix(layer: LoyaltyGraphicLayer) {
    return layer === "points" ? "pointsBadge" : layer;
  }

  function getLayerValue(layer: LoyaltyGraphicLayer, field: "X" | "Y" | "Width" | "Height") {
    const key = `${layerPrefix(layer)}${field}` as keyof LoyaltyCardDesign;
    return Number(draft.card[key] ?? 0);
  }

  function clampLayerValue(layer: LoyaltyGraphicLayer, field: "X" | "Y" | "Width" | "Height", value: number) {
    const width = field === "Width" ? value : getLayerValue(layer, "Width");
    const height = field === "Height" ? value : getLayerValue(layer, "Height");
    const x = field === "X" ? value : getLayerValue(layer, "X");
    const y = field === "Y" ? value : getLayerValue(layer, "Y");
    const minSize = layer === "qr" ? 12 : layer === "barcode" ? 14 : 6;
    const maxWidth = Math.max(minSize, 100 - x);
    const maxHeight = Math.max(minSize, 100 - y);

    if (field === "Width") return Math.max(minSize, Math.min(maxWidth, value));
    if (field === "Height") return Math.max(minSize, Math.min(maxHeight, value));
    if (field === "X") return Math.max(0, Math.min(100 - width, value));
    return Math.max(0, Math.min(100 - height, value));
  }

  function setLayerValue(layer: LoyaltyGraphicLayer, field: "X" | "Y" | "Width" | "Height", value: number) {
    const prefix = layerPrefix(layer);
    const key = `${prefix}${field}` as keyof LoyaltyCardDesign;
    patchCard({ [key]: clampLayerValue(layer, field, value) } as Partial<LoyaltyCardDesign>);
  }

  function resetLayer(layer: LoyaltyGraphicLayer) {
    const defaults = layerDefaults[layer];
    const prefix = layerPrefix(layer);
    patchCard({
      [`${prefix}X`]: defaults.x,
      [`${prefix}Y`]: defaults.y,
      [`${prefix}Width`]: defaults.width,
      [`${prefix}Height`]: defaults.height,
    } as Partial<LoyaltyCardDesign>);
  }

  function patchTextElement(id: LoyaltyTextElementId, next: Partial<LoyaltyCardDesign["textElements"][LoyaltyTextElementId]>) {
    setDraft((current) => {
      const currentElement = current.card.textElements[id];
      const textElements = {
        ...current.card.textElements,
        [id]: { ...currentElement, ...next, id },
      };
      const legacyField = legacyFieldByTextElement[id];
      const legacyPatch = legacyField && typeof next.text === "string" ? { [legacyField]: next.text } : {};

      return {
        ...current,
        card: {
          ...current.card,
          ...legacyPatch,
          textElements,
        },
      };
    });
  }

  function getTextElementId() {
    return isTextLayer(activeLayer) ? textLayerId(activeLayer) : "title";
  }

  function selectTextElement(id: LoyaltyTextElementId) {
    setActiveGroup("texts");
    setActiveLayer(`text:${id}`);
  }

  function clampTextElementValue(id: LoyaltyTextElementId, field: "x" | "y" | "width" | "height" | "fontSize", value: number) {
    const element = draft.card.textElements[id];
    if (field === "fontSize") return Math.max(8, Math.min(42, value));

    const width = field === "width" ? value : element.width;
    const height = field === "height" ? value : element.height;
    const x = field === "x" ? value : element.x;
    const y = field === "y" ? value : element.y;

    if (field === "width") return Math.max(6, Math.min(100 - x, value));
    if (field === "height") return Math.max(4, Math.min(100 - y, value));
    if (field === "x") return Math.max(0, Math.min(100 - width, value));
    return Math.max(0, Math.min(100 - height, value));
  }

  function setTextElementNumber(id: LoyaltyTextElementId, field: "x" | "y" | "width" | "height" | "fontSize", value: number) {
    patchTextElement(id, { [field]: clampTextElementValue(id, field, value) });
  }

  function resetTextElement(id: LoyaltyTextElementId) {
    const defaults = initialState.card.textElements[id];
    patchTextElement(id, defaults);
  }

  function CompactToggle({
    enabled,
    label,
    onClick,
  }: {
    enabled: boolean;
    label: string;
    onClick: () => void;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-black ${
          enabled ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
        }`}
      >
        {enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
        {label}
      </button>
    );
  }

  function Slider({
    label,
    layer,
    field,
    min = 0,
  }: {
    label: string;
    layer: LoyaltyGraphicLayer;
    field: "X" | "Y" | "Width" | "Height";
    min?: number;
  }) {
    const value = getLayerValue(layer, field);
    const max =
      field === "X"
        ? 100 - getLayerValue(layer, "Width")
        : field === "Y"
          ? 100 - getLayerValue(layer, "Height")
          : field === "Width"
            ? 100 - getLayerValue(layer, "X")
            : 100 - getLayerValue(layer, "Y");

    return (
      <label className="space-y-1">
        <span className="flex items-center justify-between text-[11px] font-black text-[#6B3A25]">
          <span>{label}</span>
          <span>{Math.round(value)}%</span>
        </span>
        <span className="grid grid-cols-[minmax(0,1fr)_58px] items-center gap-2">
          <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={(event) => setLayerValue(layer, field, Number(event.target.value))}
            className="h-5 w-full accent-[#6B3A25]"
          />
          <input
            type="number"
            min={min}
            max={max}
            value={Math.round(value)}
            onChange={(event) => setLayerValue(layer, field, Number(event.target.value))}
            className="h-8 rounded-lg border border-[#D8C3A2] bg-white px-2 text-center text-[12px] font-black text-[#2F241D] outline-none focus:border-[#9C6B2E]"
            aria-label={`${label} قيمة رقمية`}
          />
        </span>
      </label>
    );
  }

  function TextSlider({
    label,
    id,
    field,
    min = 0,
    max,
  }: {
    label: string;
    id: LoyaltyTextElementId;
    field: "x" | "y" | "width" | "height" | "fontSize";
    min?: number;
    max: number;
  }) {
    const value = Number(draft.card.textElements[id][field] ?? 0);

    return (
      <label className="space-y-1">
        <span className="flex items-center justify-between text-[11px] font-black text-[#6B3A25]">
          <span>{label}</span>
          <span>{Math.round(value)}</span>
        </span>
        <span className="grid grid-cols-[minmax(0,1fr)_58px] items-center gap-2">
          <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={(event) => setTextElementNumber(id, field, Number(event.target.value))}
            className="h-5 w-full accent-[#6B3A25]"
          />
          <input
            type="number"
            min={min}
            max={max}
            value={Math.round(value)}
            onChange={(event) => setTextElementNumber(id, field, Number(event.target.value))}
            className="h-8 rounded-lg border border-[#D8C3A2] bg-white px-2 text-center text-[12px] font-black text-[#2F241D] outline-none focus:border-[#9C6B2E]"
          />
        </span>
      </label>
    );
  }

  function renderGroupPanel() {
    if (activeGroup === "texts") {
      const activeTextId = getTextElementId();
      const element = draft.card.textElements[activeTextId];
      const xMax = Math.max(0, 100 - element.width);
      const yMax = Math.max(0, 100 - element.height);
      const widthMax = Math.max(6, 100 - element.x);
      const heightMax = Math.max(4, 100 - element.y);

      return (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-1">
            {textElementOrder.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => selectTextElement(id)}
                className={`h-8 rounded-lg px-2 text-[11px] font-black ${
                  activeTextId === id ? "bg-[#D9A33F] text-[#2F241D]" : "bg-white text-[#6B3A25]"
                }`}
              >
                {textElementLabels[id]}
              </button>
            ))}
          </div>

          <div className="rounded-[12px] bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-black text-[#2F241D]">{textElementLabels[activeTextId]}</h2>
              <CompactToggle enabled={element.enabled} label={element.enabled ? "إخفاء" : "إظهار"} onClick={() => patchTextElement(activeTextId, { enabled: !element.enabled })} />
            </div>

            <label className={labelClass}>النص<textarea className={textareaClass} value={element.text} onChange={(event) => patchTextElement(activeTextId, { text: event.target.value })} /></label>

            <div className="mt-3 grid gap-3">
              <TextSlider label="الموضع الأفقي / X" id={activeTextId} field="x" max={xMax} />
              <TextSlider label="الموضع العمودي / Y" id={activeTextId} field="y" max={yMax} />
              <TextSlider label="العرض" id={activeTextId} field="width" min={6} max={widthMax} />
              <TextSlider label="الطول" id={activeTextId} field="height" min={4} max={heightMax} />
              <TextSlider label="حجم الخط" id={activeTextId} field="fontSize" min={8} max={42} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className={labelClass}>لون النص<input className={`${inputClass} p-1`} type="color" value={element.color} onChange={(event) => patchTextElement(activeTextId, { color: event.target.value })} /></label>
              <label className={labelClass}>المحاذاة<select className={inputClass} value={element.align} onChange={(event) => patchTextElement(activeTextId, { align: event.target.value as LoyaltyTextAlign })}><option value="right">يمين</option><option value="center">وسط</option><option value="left">يسار</option></select></label>
            </div>

            <button type="button" onClick={() => resetTextElement(activeTextId)} className="mt-3 h-8 rounded-lg border border-[#D8C3A2] bg-[#FFF8EA] px-3 text-[12px] font-black text-[#6B3A25]">
              إعادة ضبط النص المحدد
            </button>
          </div>

          <label className={labelClass}>الشروط<textarea className={textareaClass} value={draft.card.terms} onChange={(event) => patchCard({ terms: event.target.value })} /></label>
        </div>
      );

      return (
        <div className="grid gap-2">
          <label className={labelClass}>اسم العلامة<input className={inputClass} value={draft.card.brandName} onChange={(event) => patchCard({ brandName: event.target.value })} /></label>
          <label className={labelClass}>عنوان البطاقة<input className={inputClass} value={draft.card.cardTitle} onChange={(event) => patchCard({ cardTitle: event.target.value })} /></label>
          <label className={labelClass}>وصف البطاقة<input className={inputClass} value={draft.card.subtitle} onChange={(event) => patchCard({ subtitle: event.target.value })} /></label>
          <label className={labelClass}>عنوان المكافأة<input className={inputClass} value={draft.card.rewardTitle} onChange={(event) => patchCard({ rewardTitle: event.target.value })} /></label>
          <label className={labelClass}>النص المساند<input className={inputClass} value={draft.card.supportingText} onChange={(event) => patchCard({ supportingText: event.target.value })} /></label>
          <label className={labelClass}>الشروط<textarea className={textareaClass} value={draft.card.terms} onChange={(event) => patchCard({ terms: event.target.value })} /></label>
        </div>
      );
    }

    if (activeGroup === "logo") {
      return (
        <div className="grid gap-2">
          <LoyaltyLogoUploader
            label="شعار البطاقة"
            value={draft.card.logoPreviewUrl}
            onChange={(logoPreviewUrl) => patchCard({ logoPreviewUrl })}
            removeLightBackground={draft.card.logoRemoveLightBackground}
            tolerance={draft.card.logoBackgroundTolerance}
            onRemoveLightBackgroundChange={(logoRemoveLightBackground) => patchCard({ logoRemoveLightBackground })}
            onToleranceChange={(logoBackgroundTolerance) => patchCard({ logoBackgroundTolerance })}
          />
          <p className="rounded-lg bg-[#FFF8EA] px-2 py-2 text-[11px] font-bold leading-5 text-[#806A5E]">
            اسحب الشعار مباشرة على البطاقة، أو استخدم منزلقات العنصر المحدد.
          </p>
        </div>
      );
    }

    if (activeGroup === "colors") {
      return (
        <div className="grid grid-cols-3 gap-2">
          <label className={labelClass}>الخلفية<input className={`${inputClass} p-1`} type="color" value={draft.card.cardBackground} onChange={(event) => patchCard({ cardBackground: event.target.value })} /></label>
          <label className={labelClass}>النص<input className={`${inputClass} p-1`} type="color" value={draft.card.cardForeground} onChange={(event) => patchCard({ cardForeground: event.target.value })} /></label>
          <label className={labelClass}>التمييز<input className={`${inputClass} p-1`} type="color" value={draft.card.cardAccent} onChange={(event) => patchCard({ cardAccent: event.target.value })} /></label>
        </div>
      );
    }

    if (activeGroup === "stamps") {
      return (
        <div className="grid gap-2">
          <div className="grid grid-cols-3 gap-2">
            <label className={labelClass}>عدد الأختام<input className={inputClass} type="number" min={1} max={16} value={draft.card.stampsRequired} onChange={(event) => patchCard({ stampsRequired: Math.max(1, Number(event.target.value) || 1) })} /></label>
            <label className={labelClass}>المكتمل<input className={inputClass} type="number" min={0} max={draft.card.stampsRequired} value={draft.card.completedStamps} onChange={(event) => patchCard({ completedStamps: Math.min(draft.card.stampsRequired, Math.max(0, Number(event.target.value) || 0)) })} /></label>
            <label className={labelClass}>التسمية<input className={inputClass} value={draft.card.stampLabel} onChange={(event) => patchCard({ stampLabel: event.target.value })} /></label>
          </div>
          <LoyaltyIconPicker
            value={draft.card.progressIcon}
            customIconPreviewUrl={draft.card.customIconPreviewUrl}
            onChange={(progressIcon) => patchCard({ progressIcon })}
            onCustomIconChange={(customIconPreviewUrl) => patchCard({ customIconPreviewUrl })}
          />
        </div>
      );
    }

    if (activeGroup === "barcode") {
      return (
        <div className="grid gap-2">
          <CompactToggle enabled={draft.card.barcodeVisible} label={draft.card.barcodeVisible ? "إخفاء الباركود" : "إظهار الباركود"} onClick={() => patchCard({ barcodeVisible: !draft.card.barcodeVisible })} />
          <label className={labelClass}>رمز البطاقة<input className={inputClass} value={draft.card.sampleCode} onChange={(event) => patchCard({ sampleCode: event.target.value })} /></label>
          <p className="rounded-lg bg-[#FFF8EA] px-2 py-2 text-[11px] font-bold leading-5 text-[#806A5E]">الباركود قابل للسحب وتغيير الحجم من اللوحة اليمنى.</p>
        </div>
      );
    }

    if (activeGroup === "qr") {
      return (
        <div className="grid gap-2">
          <label className={labelClass}>رمز البطاقة / QR<input className={inputClass} value={draft.card.sampleCode} onChange={(event) => patchCard({ sampleCode: event.target.value })} /></label>
          <p className="rounded-lg bg-[#FFF8EA] px-2 py-2 text-[11px] font-bold leading-5 text-[#806A5E]">
            يمكن سحب رمز QR مباشرة داخل البطاقة وتعديل موضعه وحجمه من اللوحة اليمنى. يتم ضبط الحدود تلقائياً حتى يبقى داخل البطاقة.
          </p>
        </div>
      );
    }

    if (activeGroup === "points") {
      return (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <CompactToggle enabled={draft.points.enabled} label={draft.points.enabled ? "إيقاف نقاط الولاء" : "تفعيل نقاط الولاء"} onClick={() => patchPoints({ enabled: !draft.points.enabled })} />
            <CompactToggle enabled={draft.card.pointsBadgeVisible} label={draft.card.pointsBadgeVisible ? "إخفاء وسم النقاط" : "إظهار وسم النقاط"} onClick={() => patchCard({ pointsBadgeVisible: !draft.card.pointsBadgeVisible })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className={labelClass}>الرصيد<input className={inputClass} type="number" value={draft.points.customerPointsBalance} onChange={(event) => patchPoints({ customerPointsBalance: Number(event.target.value) || 0 })} /></label>
            <label className={labelClass}>قيمة النقطة<input className={inputClass} type="number" step="0.01" value={draft.points.pointValueSar} onChange={(event) => patchPoints({ pointValueSar: Number(event.target.value) || 0 })} /></label>
            <label className={labelClass}>حد الاستبدال<input className={inputClass} type="number" value={draft.points.minimumRedemptionPoints} onChange={(event) => patchPoints({ minimumRedemptionPoints: Number(event.target.value) || 0 })} /></label>
          </div>
          <label className={labelClass}>قاعدة الكسب<input className={inputClass} value={draft.points.earningRule} onChange={(event) => patchPoints({ earningRule: event.target.value })} /></label>
          <label className={labelClass}>قاعدة الاستبدال<input className={inputClass} value={draft.points.redemptionRule} onChange={(event) => patchPoints({ redemptionRule: event.target.value })} /></label>
        </div>
      );
    }

    return (
      <div className="grid gap-2">
        <CompactToggle enabled={draft.card.enabled} label={draft.card.enabled ? "إيقاف بطاقة الولاء" : "تفعيل بطاقة الولاء"} onClick={() => patchCard({ enabled: !draft.card.enabled })} />
        <label className={labelClass}>انتهاء النقاط بعد أيام<input className={inputClass} type="number" value={draft.points.expiryDays} onChange={(event) => patchPoints({ expiryDays: Number(event.target.value) || 0 })} /></label>
        <label className={labelClass}>سياسة النقاط<textarea className={textareaClass} value={draft.points.policyText} onChange={(event) => patchPoints({ policyText: event.target.value })} /></label>
      </div>
    );
  }

  const activeSliderLayer = isGraphicLayer(activeLayer) ? activeLayer : "logo";

  return (
    <main dir="rtl" className="h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#F5EFE6] p-3 text-[#2F241D]">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-[#D8C3A2] bg-[#FFFDF8] shadow-[0_18px_48px_rgba(69,43,28,0.10)]">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[#E7D7C6] px-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black text-[#9C6B2E]">استوديو بطاقة الولاء</p>
            <h1 className="truncate text-lg font-black text-[#2F241D]">تصميم البطاقة</h1>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <CompactToggle enabled={draft.card.enabled} label={draft.card.enabled ? "إيقاف البطاقة" : "تفعيل البطاقة"} onClick={() => patchCard({ enabled: !draft.card.enabled })} />
            <CompactToggle enabled={draft.points.enabled} label={draft.points.enabled ? "إيقاف النقاط" : "تفعيل النقاط"} onClick={() => patchPoints({ enabled: !draft.points.enabled })} />
            {message ? (
              <span className="hidden rounded-lg bg-emerald-50 px-3 py-2 text-[12px] font-black text-emerald-700 lg:inline-flex">
                <Check className="me-1 h-4 w-4" />
                {message}
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={resetPreview} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#D8C3A2] bg-white px-3 text-[12px] font-black text-[#6B3A25]">
              <RotateCcw className="h-4 w-4" />
              إعادة ضبط المعاينة
            </button>
            <Link href="/dashboard/loyalty" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#D8C3A2] bg-white px-3 text-[12px] font-black text-[#6B3A25]">
              <ArrowRight className="h-4 w-4" />
              العودة للولاء
            </Link>
            <button type="button" onClick={saveDesign} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4A281D] px-4 text-[12px] font-black text-[#FCF8F3] disabled:opacity-60">
              <Save className="h-4 w-4" />
              {saving ? "جاري الحفظ" : "حفظ تصميم البطاقة"}
            </button>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto overflow-x-hidden p-3 lg:grid-cols-[260px_minmax(0,1fr)_250px] lg:overflow-hidden xl:grid-cols-[300px_minmax(0,1fr)_280px] 2xl:grid-cols-[320px_minmax(0,1fr)_300px]">
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-[#E7D7C6] bg-[#FCF8F3]">
            <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-[#E7D7C6] p-2">
              {groups.map((group) => {
                const Icon = group.icon;
                const active = activeGroup === group.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => selectGroup(group.id)}
                    className={`flex h-8 items-center justify-center gap-1.5 rounded-lg text-[12px] font-black ${
                      active ? "bg-[#4A281D] text-[#FCF8F3]" : "bg-white text-[#6B3A25]"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {group.label}
                  </button>
                );
              })}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">{renderGroupPanel()}</div>
          </aside>

          <section className="flex min-h-0 items-center justify-center overflow-hidden rounded-[14px] border border-[#E7D7C6] bg-[radial-gradient(circle_at_center,#FFF8EA_0,#F5EFE6_52%,#E9D9C0_100%)] p-4">
            <div className="w-full max-w-[860px]">
              <LoyaltyCardPreview
                card={{
                  ...draft.card,
                  pointsBadgeVisible: draft.points.enabled && draft.card.pointsBadgeVisible,
                }}
                pointsBalance={draft.points.customerPointsBalance}
                pointValueSar={draft.points.pointValueSar}
                editable
                activeLayer={activeLayer}
                onActiveLayerChange={(layer) => {
                  setActiveLayer(layer);
                  if (isTextLayer(layer)) setActiveGroup("texts");
                  if (layer === "logo") setActiveGroup("logo");
                  if (layer === "points") setActiveGroup("points");
                  if (layer === "barcode") setActiveGroup("barcode");
                  if (layer === "qr") setActiveGroup("qr");
                }}
                onCardChange={(card) => setDraft((current) => ({ ...current, card }))}
              />
              <p className="mt-3 text-center text-[12px] font-black text-[#2F7D69]">
                يتم تطبيق هذا التصميم على بطاقة العميل العامة بعد حفظ تصميم البطاقة.
              </p>
              <p className="mt-3 text-center text-[12px] font-black text-[#6B3A25]">
                اسحب العنصر داخل البطاقة، واستخدم منزلقات اللوحة الجانبية للضبط الدقيق.
              </p>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-[#E7D7C6] bg-[#FCF8F3]">
            <div className="shrink-0 border-b border-[#E7D7C6] p-3">
              <p className="text-[12px] font-black text-[#806A5E]">العنصر المحدد</p>
              <div className="mt-2 grid grid-cols-2 gap-1">
                {(["logo", "points", "barcode", "qr"] as LoyaltyGraphicLayer[]).map((layer) => (
                  <button
                    key={layer}
                    type="button"
                    onClick={() => {
                      setActiveLayer(layer);
                      if (layer === "logo") setActiveGroup("logo");
                      if (layer === "points") setActiveGroup("points");
                      if (layer === "barcode") setActiveGroup("barcode");
                      if (layer === "qr") setActiveGroup("qr");
                    }}
                    className={`flex h-8 items-center justify-center gap-1 rounded-lg text-[11px] font-black ${
                      activeLayer === layer ? "bg-[#D9A33F] text-[#2F241D]" : "bg-white text-[#6B3A25]"
                    }`}
                  >
                    <CircleDot className="h-3.5 w-3.5" />
                    {layerLabels[layer]}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="rounded-[12px] bg-white p-3">
                <h2 className="text-sm font-black text-[#2F241D]">{layerLabels[activeSliderLayer]}</h2>
                <p className="mt-1 text-[11px] font-bold text-[#806A5E]">اسحب العنصر داخل البطاقة</p>
                <button
                  type="button"
                  onClick={() => resetLayer(activeSliderLayer)}
                  className="mt-2 h-8 rounded-lg border border-[#D8C3A2] bg-[#FFF8EA] px-3 text-[12px] font-black text-[#6B3A25]"
                >
                  إعادة ضبط العنصر
                </button>
                <div className="mt-3 grid gap-3">
                  <Slider label="الموضع الأفقي / قيمة X" layer={activeSliderLayer} field="X" />
                  <Slider label="الموضع العمودي / قيمة Y" layer={activeSliderLayer} field="Y" />
                  <Slider label="العرض" layer={activeSliderLayer} field="Width" min={activeSliderLayer === "qr" ? 12 : 8} />
                  <Slider label="الطول" layer={activeSliderLayer} field="Height" min={activeSliderLayer === "qr" ? 12 : 8} />
                </div>
              </div>
              <div className="mt-3 rounded-[12px] bg-white p-3 text-[11px] font-bold leading-5 text-[#806A5E]">
                البطاقة تبقى ظاهرة دائماً أثناء تعديل النصوص، الشعار، الألوان، الأختام، الباركود أو النقاط.
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
