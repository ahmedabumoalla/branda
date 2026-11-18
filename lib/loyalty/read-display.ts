import type { LocalRead } from "./read-outbox";

/** A device save is never evidence of a committed stamp. */
export function readDisplay(row: LocalRead) {
  const operation = row.operation;
  if (operation?.status === "succeeded") return { state: "succeeded" as const, label: "تم تسجيل الختم", detail: "تم حفظ الختم في بطاقة العميل" };
  if (operation?.status === "duplicate") return { state: "failed" as const, label: "قراءة مكررة", detail: operation.errorMessage || "لم يُسجل ختم إضافي لهذه القراءة" };
  if (row.errorCode?.startsWith("rejected:") || operation?.status === "needs_review" || (operation?.status === "failed" && !operation.retryable)) {
    return { state: "failed" as const, label: "لم يُسجل الختم", detail: operation?.errorMessage || row.errorMessage || "راجع بيانات القراءة قبل المحاولة مجددًا" };
  }
  return { state: "pending" as const, label: "لم يتأكد الختم بعد", detail: operation?.errorMessage || row.errorMessage || (operation ? "وصلت القراءة للنظام وجارٍ تنفيذها" : "القراءة محفوظة على الجهاز وتنتظر وصولها للنظام") };
}
