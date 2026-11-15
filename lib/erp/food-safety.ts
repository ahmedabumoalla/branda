import { z } from "zod";

export const foodSafetyKinds = {
  temperature: "قراءة حرارة", cleaning: "نظافة وتعقيم", pest_control: "مكافحة آفات", staff_health: "صحة ونظافة العاملين",
  receiving: "فحص استلام مواد", training: "تدريب العاملين", calibration: "معايرة أجهزة القياس", recall: "سحب منتج",
} as const;
export type FoodSafetyKind = keyof typeof foodSafetyKinds;
export const foodSafetyHelp: Record<FoodSafetyKind, string> = {
  temperature: "قراءة حرارة ثلاجة أو فريزر أو خزانة عرض مع حدها الأدنى والأعلى",
  cleaning: "تنفيذ جدول النظافة والتعقيم لمنطقة أو معدة",
  pest_control: "زيارة شركة المكافحة أو فحص المصائد وما لوحظ",
  staff_health: "فحص الشهادات الصحية والنظافة الشخصية قبل بدء العمل",
  receiving: "فحص مواد واردة من مورد: الحرارة والصلاحية وسلامة العبوات",
  training: "تدريب العاملين على اشتراطات سلامة الغذاء",
  calibration: "معايرة ميزان الحرارة أو أجهزة القياس",
  recall: "سحب منتج من الفروع بسبب خلل مع الكمية والتشغيلة والسبب",
};
export const foodSafetyRecordSchema = z.object({
  kind: z.enum(["temperature", "cleaning", "pest_control", "staff_health", "receiving", "training", "calibration", "recall"]),
  branchId: z.uuid(), subject: z.string().trim().min(2, "اكتب موضوع السجل").max(200), deviation: z.boolean(), corrective: z.string().trim().max(2000),
  details: z.record(z.string(), z.union([z.string().max(500), z.number().finite()])),
});
export type FoodSafetyRecord = {
  id: string; number: number; branchId: string; kind: FoodSafetyKind; deviation: boolean; recordedAt: string; subject: string;
  payload: Record<string, string | number>; corrective: string; actor: string; closedNote: string | null; closedAt: string | null; closedBy: string;
};
export type FoodSafetySnapshot = {
  role: string; branchId: string | null; canClose: boolean; slug: string; brand: string; from: string; to: string; kind: string; filterBranchId: string;
  branches: { id: string; name: string }[]; openDeviations: number; counts: Partial<Record<FoodSafetyKind, number>>; records: FoodSafetyRecord[];
};
