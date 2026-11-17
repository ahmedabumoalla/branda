/** Presentation examples only: never submitted to operational or financial ledgers. */
export type ManufacturingDemoStatus = "queued" | "processing" | "hold" | "ready";
export type ManufacturingDemoBatch = {
  id: string; product: string; sku: string; quantity: number; unit: string;
  status: ManufacturingDemoStatus; stage: number; owner: string; due: string;
  recipe: string; pack: string; note: string;
  destinations: { warehouse: string; reference: string; quantity: number }[];
  materials: { name: string; lot: string; quantity: string; warehouse: string; reference: string }[];
};

export const manufacturingDemoStatuses: Record<ManufacturingDemoStatus, string> = {
  queued: "بانتظار صرف الخامات", processing: "قيد التصنيع", hold: "موقوف للجودة", ready: "جاهز لاستلام المنتج النهائي",
};

export const manufacturingDemoBatches: ManufacturingDemoBatch[] = [
  {
    id: "DEMO-B2401", product: "كليجا القصيم", sku: "DEMO-101", quantity: 90, unit: "علبة",
    status: "ready", stage: 8, owner: "مشرف التعبئة", due: "10:30", recipe: "وصفة الكليجا / نسخة العرض 3", pack: "علبة 12 قطعة",
    note: "اكتملت مراجعة الجودة والإفراج في هذا المثال وتبقى مطابقة الكميات عند استلام المنتج النهائي في المستودع",
    destinations: [{ warehouse: "مستودع المنتجات النهائية", reference: "DEMO-FG101", quantity: 90 }],
    materials: [
      { name: "دقيق", lot: "DEMO-F101", quantity: "18 كجم", warehouse: "مستودع المصنع", reference: "استلام توضيحي 101" },
      { name: "حشوة التمر", lot: "DEMO-D201", quantity: "9 كجم", warehouse: "مستودع المصنع", reference: "صرف توضيحي 201" },
      { name: "علب غذائية", lot: "DEMO-P301", quantity: "90 علبة", warehouse: "المستودع الرئيسي", reference: "صرف توضيحي 301" },
    ],
  },
  {
    id: "DEMO-B2402", product: "براونيز الشوكولاتة", sku: "DEMO-102", quantity: 120, unit: "قطعة",
    status: "processing", stage: 3, owner: "مشرف خط الحلويات", due: "12:00", recipe: "وصفة البراونيز / نسخة العرض 2", pack: "تغليف فردي",
    note: "يستكمل المشغل سجل الإنتاج ثم يرسل التشغيلة للفحص قبل السماح بالإفراج عنها",
    destinations: [{ warehouse: "مستودع المنتجات النهائية", reference: "DEMO-FG102", quantity: 120 }],
    materials: [
      { name: "خليط الشوكولاتة", lot: "DEMO-C102", quantity: "6 كجم", warehouse: "مستودع خامات المصنع", reference: "استلام توضيحي 102" },
      { name: "دقيق", lot: "DEMO-F101", quantity: "4 كجم", warehouse: "مستودع خامات المصنع", reference: "صرف توضيحي 202" },
      { name: "غلاف غذائي", lot: "DEMO-P302", quantity: "120 غلاف", warehouse: "المستودع الرئيسي", reference: "صرف توضيحي 302" },
    ],
  },
  {
    id: "DEMO-B2403", product: "تشيزكيك الفراولة", sku: "DEMO-103", quantity: 48, unit: "قطعة",
    status: "hold", stage: 6, owner: "مسؤول الجودة", due: "13:00", recipe: "وصفة التشيزكيك / نسخة العرض 4", pack: "علبة فردية محكمة",
    note: "توقفت التشغيلة في المثال لعدم تطابق بطاقة العبوة مع نسخة المنتج ويجب تصحيح البطاقة وإعادة الفحص",
    destinations: [{ warehouse: "منطقة حجز الجودة في المصنع", reference: "DEMO-HOLD103", quantity: 48 }],
    materials: [
      { name: "قاعدة التشيزكيك", lot: "DEMO-K103", quantity: "4 كجم", warehouse: "مستودع خامات المصنع", reference: "استلام توضيحي 103" },
      { name: "حشوة الفراولة", lot: "DEMO-S203", quantity: "2 كجم", warehouse: "مستودع خامات المصنع", reference: "صرف توضيحي 203" },
      { name: "علب فردية", lot: "DEMO-P303", quantity: "48 علبة", warehouse: "المستودع الرئيسي", reference: "صرف توضيحي 303" },
    ],
  },
  {
    id: "DEMO-B2404", product: "معمول التمر", sku: "DEMO-104", quantity: 60, unit: "علبة",
    status: "queued", stage: 0, owner: "مسؤول تخطيط الإنتاج", due: "15:00", recipe: "وصفة المعمول / نسخة العرض 1", pack: "علبة ضيافة 20 قطعة",
    note: "أمر التصنيع ضمن خطة الإنتاج وينتظر فحص الخامات وصرفها وفق الوصفة قبل بدء التشغيل",
    destinations: [{ warehouse: "مستودع المنتجات النهائية", reference: "DEMO-FG104", quantity: 60 }],
    materials: [
      { name: "دقيق المعمول", lot: "DEMO-F104", quantity: "12 كجم", warehouse: "المستودع الرئيسي", reference: "طلب مواد توضيحي 104" },
      { name: "عجوة تمر", lot: "DEMO-D204", quantity: "8 كجم", warehouse: "المستودع الرئيسي", reference: "طلب مواد توضيحي 204" },
      { name: "علب ضيافة", lot: "DEMO-P304", quantity: "60 علبة", warehouse: "المستودع الرئيسي", reference: "طلب مواد توضيحي 304" },
    ],
  },
];

export function manufacturingDemoStageResult(batch: ManufacturingDemoBatch, index: number) {
  if (index < batch.stage) return { status: "pass", label: "مكتمل" } as const;
  if (index === batch.stage && batch.status === "hold") return { status: "hold", label: "يحتاج إجراء تصحيحي" } as const;
  if (index === batch.stage && batch.status === "processing") return { status: "active", label: "قيد التنفيذ" } as const;
  return { status: "pending", label: "بانتظار التنفيذ" } as const;
}

export function manufacturingDemoChecks(batch: ManufacturingDemoBatch) {
  const reviewed = batch.stage >= 6;
  return [
    { name: "هوية المنتج والوصفة", reference: batch.recipe, result: reviewed ? "pass" : "pending", note: reviewed ? "مطابقة الصنف والوصفة المسجلة" : "تراجع عند اكتمال الإنتاج" },
    { name: "التعبئة والبطاقة", reference: `بطاقة ${batch.sku}`, result: batch.status === "hold" ? "hold" : reviewed ? "pass" : "pending", note: batch.status === "hold" ? "نسخة البطاقة تحتاج تصحيحًا وإعادة فحص" : reviewed ? "مطابقة بيانات المنتج والتشغيلة على العبوة" : "تراجع بعد التعبئة" },
    { name: "فحص العينة", reference: `عينة توضيحية / ${batch.id}`, result: reviewed ? "pass" : "pending", note: reviewed ? "نتيجة عينة توضيحية ضمن مواصفة المنتج" : "العينة لم تسجل بعد في المثال" },
    { name: "قرار الإفراج", reference: "مراجعة مسؤول الجودة", result: batch.status === "ready" ? "pass" : batch.status === "hold" ? "hold" : "pending", note: batch.status === "ready" ? "مسموح بالتوزيع في هذا المثال" : "لا توزع التشغيلة قبل اكتمال المراجعة والإفراج" },
  ];
}
