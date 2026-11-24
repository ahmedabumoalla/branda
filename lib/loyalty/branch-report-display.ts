export function activityAge(value: string | null, asOf: string): string {
  if (!value) return "لا يوجد نشاط مسجل";
  const difference = Date.parse(asOf) - Date.parse(value);
  if (!Number.isFinite(difference)) return "وقت غير متاح";
  if (difference < 0) return "وقت النشاط بعد وقت التقرير";
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return "قبل أقل من دقيقة";
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `قبل ${hours} ساعة` : `قبل ${Math.floor(hours / 24)} يوم`;
}

export function branchActivityLabel(kind: string | null): string {
  return ({ issue: "إصدار بطاقة", download: "تحميل أو حفظ بطاقة آبل", installed: "تثبيت بطاقة آبل", save_link: "إنشاء رابط حفظ جوجل", scan: "قراءة بطاقة", stamp: "إضافة ختم", redeem: "صرف مكافأة", void: "إلغاء عملية" } as Record<string, string>)[kind ?? ""] ?? (kind ? "نشاط ولاء" : "لا يوجد نشاط مسجل");
}
