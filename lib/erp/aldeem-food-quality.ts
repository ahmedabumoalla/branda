import { z } from "zod";

export const foodStages = [
  { id: "receiving", name: "استلام المواد واعتماد المورد", fields: ["المورد المعتمد ومرجع اعتماده", "المواد وأرقام تشغيلاتها وكمياتها وصلاحيتها", "فحص الاستلام والحجر وقرار القبول أو الرفض"] },
  { id: "storage", name: "التخزين وفصل المواد", fields: ["المستودع وموقع المواد وتدوير الصلاحيات", "حدود الحفظ المعتمدة والقراءات الفعلية", "فصل مسببات الحساسية والمواد المرفوضة"] },
  { id: "preparation", name: "الوصفة وجاهزية التشغيل", fields: ["نسخة الوصفة وملف سلامة المنتج المعتمد", "النظافة والتعقيم وصحة العاملين", "المياه والمعايرة والصيانة ومكافحة الآفات"] },
  { id: "processing", name: "الإنتاج ونقاط التحكم الحرجة", fields: ["مرجع خطة تحليل المخاطر ونقاط التحكم الحرجة", "الحدود المعتمدة لكل نقطة والقراءات وأوقات القياس", "الانحرافات والإجراءات التصحيحية والتحقق"] },
  { id: "cooling", name: "التبريد والحفظ المرحلي", optional: true, fields: ["طريقة التبريد المعتمدة للمنتج", "حدود الوقت والحرارة وقراءات البداية والنهاية", "منع التلوث أثناء التبريد والحفظ"] },
  { id: "packaging", name: "التعبئة والبطاقة والتشغيلة", fields: ["مواد التعبئة الغذائية وفحص سلامة الإغلاق", "بطاقة المنتج والمكونات والحساسية وأرقام التشغيلات", "تاريخ الإنتاج والصلاحية وتعليمات الحفظ"] },
  { id: "verification", name: "الفحص والتحقق من الجودة", fields: ["خطة الفحص والعينات ومرجع نتائج المختبر", "مراجعة السجلات والانحرافات وإغلاقها", "نتيجة التحقق والمسؤول عن المراجعة"] },
  { id: "release", name: "اعتماد الإفراج عن التشغيلة", fields: ["مرجع مراجعة مسؤول الجودة", "الكمية المقبولة والمرفوضة ومصير المرفوض", "قرار الإفراج ومراجع المستندات"] },
  { id: "dispatch", name: "التوزيع والتتبع", fields: ["الجهة المستلمة والفرع ومرجع التسليم", "أرقام التشغيلات والكميات الموزعة", "المركبة وشروط النقل وقراءات التسليم"] },
] as const;
export const prerequisiteKinds = { license: "تراخيص المنشأة والشهادات", haccp: "خطة سلامة الغذاء وتحليل المخاطر", water: "سلامة المياه والفحوص", maintenance: "الصيانة الوقائية", cleaning: "النظافة والتعقيم", pest_control: "مكافحة الآفات", staff_health: "صحة العاملين", training: "التدريب", calibration: "المعايرة" } as const;
export type FoodStageId = typeof foodStages[number]["id"];
export type FoodEvidence = { result: "pass" | "fail" | "na"; fields: string[]; reason: string; at: string; actor: string; actorName?: string };
export type FoodTrace = { materials: { id: string; name: string; quantity: number; returned: number; warehouse: string; document_id: string }[]; movements: { id: string; name: string; lot: string; serial: string; expires_on: string | null; quantity: number; warehouse: string; document_id: string; created_at: string }[] };
export type FoodCase = { order_id: string; revision: number; manufacturing_order_id: string | null; stages: Partial<Record<FoodStageId, FoodEvidence>> };
export type FoodProgram = { id: string; branch_id: string; kind: keyof typeof prerequisiteKinds; reference: string; responsible: string; reviewed_on: string; valid_until: string; revision: number };
export type FoodQualitySnapshot = { canWrite: boolean; canApprove: boolean; cases: FoodCase[]; programs: FoodProgram[]; events: { id: string; order_id: string | null; action: string; created_at: string; payload: Record<string, unknown> }[]; orders: { id: string; code: string; name: string }[] };
export const foodQualityCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("stage"), requestId: z.uuid(), id: z.uuid(), revision: z.number().int().min(0), stage: z.enum(foodStages.map(x => x.id)), result: z.enum(["pass", "fail", "na"]), fields: z.array(z.string().trim().max(2000)).length(3), reason: z.string().trim().max(2000), manufacturingOrderId: z.union([z.uuid(), z.literal("")]).optional() }),
  z.object({ action: z.literal("program"), requestId: z.uuid(), id: z.uuid(), revision: z.number().int().min(0), branchId: z.uuid(), kind: z.enum(Object.keys(prerequisiteKinds) as [keyof typeof prerequisiteKinds, ...(keyof typeof prerequisiteKinds)[]]), reference: z.string().trim().min(3).max(2000), responsible: z.string().trim().min(2).max(200), reviewedOn: z.iso.date(), validUntil: z.iso.date() }),
]);
