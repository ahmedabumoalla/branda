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

export function campaignDraftError(input: { title: string; body: string; recipients: string; consent: boolean; scheduledAt: string }, now = Date.now()) {
  if (!input.title.trim()) return "اكتب اسمًا للحملة لتتعرف عليها في السجل";
  if (!input.body.trim()) return "اكتب الرسالة التي تريد إرسالها";
  if (input.title.trim().length > 100 || input.body.trim().length > 3000) return "اختصر اسم الحملة أو نص الرسالة ثم أعد المراجعة";
  const parsed = parseCampaignRecipients(input.recipients);
  if (!parsed.phones.length) return "أضف أرقام العملاء الذين وافقوا على استقبال رسائلك";
  if (parsed.invalid.length) return "تحقق من أرقام الجوال السعودية واكتب كل رقم دون مسافات داخله";
  if (parsed.phones.length > 1000) return "قائمة الأرقام طويلة قسمها إلى حملات أصغر ثم أعد المراجعة";
  if (!input.consent) return "أكد موافقة العملاء قبل متابعة الحملة";
  if (input.scheduledAt && (!Number.isFinite(Date.parse(input.scheduledAt)) || Date.parse(input.scheduledAt) <= now)) return "اختر وقتًا لاحقًا لإرسال الحملة";
  if (input.scheduledAt && Date.parse(input.scheduledAt) > now + 90 * 86400_000) return "اختر موعدًا للحملة خلال التسعين يومًا القادمة";
  return null;
}
