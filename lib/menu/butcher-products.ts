import { z } from "zod";

export const BUTCHER_MEAT_TYPES = [
  { id: "calf", label: "عجل" },
  { id: "sheep", label: "خروف" },
  { id: "camel", label: "حاشي" },
  { id: "goat", label: "ماعز" },
] as const;

export const BUTCHER_STANDARD_UNITS = [
  { id: "kg", label: "كيلو" },
  { id: "g", label: "جرام" },
  { id: "carcass", label: "ذبيحة" },
  { id: "half", label: "نصف ذبيحة" },
  { id: "quarter", label: "ربع ذبيحة" },
] as const;

export const butcherUnitPriceSchema = z.object({
  id: z.string().regex(/^(kg|g|carcass|half|quarter|custom_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/, "اختر وحدة قياس صحيحة"),
  label: z.string().trim().min(1, "اكتب اسم الوحدة").max(60, "اسم الوحدة طويل جدًا"),
  priceMode: z.enum(["fixed", "cashier"]).optional(),
  price: z.number().finite().min(0, "أدخل سعرًا أكبر من صفر لكل وحدة").max(1_000_000, "السعر أعلى من الحد المسموح")
    .refine(value => Math.abs(value * 1_000_000 - Math.round(value * 1_000_000)) < 0.0001, "استخدم ست خانات عشرية كحد أقصى للسعر"),
}).strict().superRefine((unit, context) => {
  if (unit.priceMode === "cashier" ? unit.price !== 0 : unit.price <= 0) context.addIssue({ code: "custom", path: ["price"], message: unit.priceMode === "cashier" ? "يحدد الكاشير السعر عند البيع ولا يحفظ سعر ثابت لهذه الوحدة" : "أدخل سعرًا أكبر من صفر لكل وحدة" });
  const standard = BUTCHER_STANDARD_UNITS.find(item => item.id === unit.id);
  if (standard && unit.label !== standard.label) context.addIssue({ code: "custom", path: ["label"], message: "اسم وحدة القياس لا يطابق نوعها" });
});

export const butcherProductDetailsSchema = z.object({
  meatType: z.enum(["calf", "sheep", "camel", "goat"], { error: "اختر نوع اللحم" }),
  origin: z.string().trim().max(60, "منشأ اللحم طويل جدًا").nullable().transform(value => value || null),
  units: z.array(butcherUnitPriceSchema).min(1, "أضف وحدة قياس وسعرها").max(24, "الحد الأقصى أربع وعشرون وحدة"),
}).strict().superRefine((details, context) => {
  const ids = new Set<string>(), labels = new Set<string>();
  details.units.forEach((unit, index) => {
    const label = unit.label.trim().toLocaleLowerCase("ar");
    if (ids.has(unit.id) || labels.has(label)) context.addIssue({ code: "custom", path: ["units", index, "label"], message: "وحدة القياس مكررة" });
    ids.add(unit.id); labels.add(label);
  });
});

export type ButcherProductDetails = z.infer<typeof butcherProductDetailsSchema>;
export type ButcherUnitPrice = z.infer<typeof butcherUnitPriceSchema>;

export function readButcherDetails(value: unknown): ButcherProductDetails | undefined {
  const parsed = butcherProductDetailsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Raw prices stay as strings so an empty field never silently becomes a free unit. */
export type ButcherProductDraft = {
  meatType: ButcherProductDetails["meatType"] | "";
  origin: string;
  units: { id: string; label: string; price: string; priceMode?: "fixed" | "cashier" }[];
};

export function createButcherProductDraft(details?: ButcherProductDetails, legacyPrice?: number): ButcherProductDraft {
  return {
    meatType: details?.meatType ?? "",
    origin: details?.origin ?? "",
    units: details?.units.map(unit => ({ ...unit, price: unit.priceMode === "cashier" ? "" : String(unit.price) }))
      ?? [{ id: "kg", label: "كيلو", price: legacyPrice == null ? "" : String(legacyPrice) }],
  };
}

export function parseButcherProductDraft(draft: ButcherProductDraft) {
  return butcherProductDetailsSchema.safeParse({
    ...draft,
    origin: draft.origin.trim() || null,
    units: draft.units.map(unit => ({ ...unit, price: unit.priceMode === "cashier" ? 0 : unit.price.trim() ? Number(unit.price) : NaN })),
  });
}

/** The generic customer catalog has no cashier to supply a transaction price. */
export function butcherPriceAtSale(product: { butcherDetails?: ButcherProductDetails }) {
  return product.butcherDetails?.units[0]?.priceMode === "cashier";
}
