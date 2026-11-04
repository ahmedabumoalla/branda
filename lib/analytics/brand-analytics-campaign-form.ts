export function analyticsCampaignSaudiInput(timestamp: number) {
  return new Date(timestamp + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function analyticsCampaignSchedule(value: string, now = Date.now()): { scheduledAt: string; error: null } | { scheduledAt: null; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return { scheduledAt: null, error: "اختر تاريخ ووقت الإرسال بتوقيت الرياض" };
  const timestamp = Date.parse(`${value}:00+03:00`);
  if (!Number.isFinite(timestamp) || analyticsCampaignSaudiInput(timestamp) !== value) return { scheduledAt: null, error: "اختر تاريخًا ووقتًا صحيحين" };
  if (timestamp <= now) return { scheduledAt: null, error: "اختر موعدًا لاحقًا للإرسال" };
  if (timestamp > now + 365 * 86400_000) return { scheduledAt: null, error: "اختر موعدًا خلال ٣٦٥ يومًا من الآن" };
  return { scheduledAt: new Date(timestamp).toISOString(), error: null };
}

export function analyticsCampaignMessageTemplate(brandName: string, segment: "inactive" | "loyal" | "absent") {
  return segment === "loyal"
    ? `أهلًا بك من ${brandName}\nوجودك المتكرر يسعدنا وشكرًا لولائك وثقتك\nننتظر زيارتك القادمة بكل محبة`
    : `أهلًا بك من ${brandName}\nاشتقنا لزيارتك ويسعدنا نشوفك من جديد\nمرّ علينا وخلّنا نجدد لقاءنا`;
}

export function analyticsCampaignDraftError(title: string, body: string) {
  if (!title.trim()) return "اكتب عنوانًا للحملة";
  if (title.trim().length > 100) return "عنوان الحملة لا يتجاوز ١٠٠ حرف";
  if (!body.trim()) return "اكتب الرسالة التي تريد إرسالها";
  if (body.trim().length > 3000) return "الرسالة لا تتجاوز ٣٠٠٠ حرف";
  return null;
}
