import { MARKETING_MEDIA_BODY_LIMIT, MARKETING_MEDIA_TYPES } from "@/lib/marketing/media-rules";

export function parseCampaignRecipients(value: string) {
  const entries = value.trim().split(/[\s,،;؛]+/u).filter(Boolean);
  const numbers = entries.map((entry) => {
    let phone = entry.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776)).replace(/^\+|^00/, "");
    if (/^05\d{8}$/.test(phone)) phone = `966${phone.slice(1)}`;
    else if (/^5\d{8}$/.test(phone)) phone = `966${phone}`;
    return phone;
  });
  const invalid = numbers.filter((phone) => !/^9665\d{8}$/.test(phone));
  return { phones: [...new Set(numbers)], invalid, duplicates: numbers.length - new Set(numbers).size };
}

export function campaignQrSource(value: string | null | undefined) {
  if (!value) return null;
  const raw = value.replace(/^data:image\/png;base64,/, "").replace(/[\r\n]/g, "");
  return value.length < 300000 && /^[A-Za-z0-9+/]+={0,2}$/.test(raw) ? `data:image/png;base64,${raw}` : null;
}

export function campaignMediaError(file: { type: string; size: number }) {
  const rule = MARKETING_MEDIA_TYPES[file.type as keyof typeof MARKETING_MEDIA_TYPES];
  if (!rule) return "اختر صورة بصيغة JPG أو PNG أو WebP أو فيديو بصيغة MP4";
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return "الملف فارغ اختر صورة أو فيديو آخر";
  if (file.size > rule.maxSize) return rule.kind === "image" ? "اختر صورة بحجم لا يتجاوز ١٠ ميجابايت" : "اختر فيديو بحجم لا يتجاوز ٥٠ ميجابايت";
  return null;
}
export function campaignDraftError(input: { title: string; body: string; customerIds: string[]; consent: boolean; scheduledAt: string; mediaId?: string; mediaStatus?: "uploading" | "ready" | "failed" }, now = Date.now()) {
  if (input.mediaStatus === "uploading") return "انتظر حتى يكتمل رفع المرفق والتحقق منه";
  if (input.mediaStatus === "failed") return "أعد رفع المرفق أو أزله قبل مراجعة الحملة";
  if (input.mediaStatus === "ready" && !input.mediaId) return "تعذر التحقق من المرفق أعد رفعه";
  if (!input.title.trim()) return "اكتب اسمًا للحملة لتتعرف عليها في السجل";
  if (!input.body.trim()) return "اكتب الرسالة التي تريد إرسالها";
  if (input.mediaId && input.body.trim().length > MARKETING_MEDIA_BODY_LIMIT) return `اختصر الرسالة المرفقة إلى ${MARKETING_MEDIA_BODY_LIMIT.toLocaleString("ar-SA")} حرفًا لتصل مع الصورة أو الفيديو`;
  if (input.title.trim().length > 100 || input.body.trim().length > 3000) return "اختصر اسم الحملة أو نص الرسالة ثم أعد المراجعة";
  if (!input.customerIds.length) return "اختر من عملاء علامتك من وافقوا على استقبال رسائلك";
  if (input.customerIds.length > 1000) return "قائمة العملاء طويلة قسمها إلى حملات أصغر ثم أعد المراجعة";
  if (!input.consent) return "أكد موافقة العملاء قبل متابعة الحملة";
  if (input.scheduledAt && (!Number.isFinite(Date.parse(input.scheduledAt)) || Date.parse(input.scheduledAt) <= now)) return "اختر وقتًا لاحقًا لإرسال الحملة";
  if (input.scheduledAt && Date.parse(input.scheduledAt) > now + 90 * 86400_000) return "اختر موعدًا للحملة خلال التسعين يومًا القادمة";
  return null;
}
