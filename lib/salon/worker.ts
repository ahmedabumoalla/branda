import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { salonPortalToken } from "@/lib/data/salon";
import { salonLoyaltyToken } from "./loyalty-link";
import { getCafeFeatureCodes } from "@/lib/data/feature-entitlements";
import { isGreenApiConfigured, sendGreenApiPagerMessage } from "@/lib/whatsapp/green-api";
import { salonTime } from "./types";

export async function runSalonMessageJobs(limit = 10) {
  const result = { configured: isGreenApiConfigured(), claimed: 0, sent: 0, skipped: 0, uncertain: 0 };
  if (!result.configured) return result;
  const db = createAdminClient();
  const { data, error } = await db.rpc("salon_claim_messages_v3", { p_limit: Math.min(20, Math.max(1, limit)) });
  if (error) throw error;
  const jobs = (data ?? []) as { id: string; booking_id: string; cafe_id: string; kind: string; phone: string; lease_token: string }[];
  result.claimed = jobs.length;
  for (let offset = 0; offset < jobs.length; offset += 5) {
    await Promise.all(jobs.slice(offset, offset + 5).map(async job => {
      try {
        const [bookingResult, brandResult, features] = await Promise.all([
          db.from("salon_bookings").select("customer_name,phone,status,requested_start,scheduled_start,proposed_start").eq("id", job.booking_id).eq("cafe_id", job.cafe_id).single(),
          db.from("cafes").select("name,slug").eq("id", job.cafe_id).single(), getCafeFeatureCodes(job.cafe_id),
        ]);
        const b = bookingResult.data, brand = brandResult.data;
        if (bookingResult.error || brandResult.error || !b || !brand) throw new Error("context_unavailable");
        const portal = `https://barndaksa.com/salon/booking/${salonPortalToken(job.booking_id)}`;
        let content: string;
        if (job.kind === "owner_new") content = `عندك حجز جديد باسم ${b.customer_name}\nالموعد المطلوب: ${salonTime(b.requested_start)}\nتأكيد الحجز أو اقتراح موعد آخر\nhttps://barndaksa.com/dashboard/bookings?booking=${job.booking_id}`;
        else if (job.kind === "owner_response") content = `${b.customer_name}\n${b.status === "confirmed" ? "وافق العميل على الموعد المقترح" : "رفض العميل الموعد المقترح"}\nhttps://barndaksa.com/dashboard/bookings?booking=${job.booking_id}`;
        else if (job.kind === "owner_declined") content = `${b.customer_name}\nرفض العميل الموعد المقترح\nرقم العميل: ${b.phone}\nيمكنك التواصل معه لتنسيق الموعد\nhttps://barndaksa.com/dashboard/bookings?booking=${job.booking_id}`;
        else if (job.kind === "loyalty_welcome") content = `أهلًا ${b.customer_name}\nبطاقة ولائك جاهزة\nافتح بطاقتك وأضفها إلى محفظة جوالك\nhttps://barndaksa.com/salon/card/${salonLoyaltyToken(job.booking_id)}\n\nمتابعة طلب الحجز\n${portal}\nالموعد ينتظر تأكيد الصالون`;
        else if (job.kind === "call") content = `${b.customer_name} دورك جاء\nتفضل إلى الصالون لبدء خدمتك`;
        else if (job.kind === "completed") content = `شكرًا لزيارتك ${b.customer_name}\nيسعدنا تقييمك للخدمة\n${portal}${features.includes("loyalty") ? `\n\nبطاقة الولاء والمكافآت\nhttps://barndaksa.com/loyalty/${brand.slug}` : ""}`;
        else if (job.kind === "proposed") content = `اقترح الصالون موعدًا بديلًا\n${salonTime(b.proposed_start)}\nوافق على الموعد أو ارفضه من رابط حجزك\n${portal}`;
        else if (job.kind === "confirmed") content = `تم تأكيد موعدك\n${salonTime(b.scheduled_start)}\nتفاصيل الحجز\n${portal}`;
        else content = `تعذر تأكيد حجزك لدى الصالون\nتفاصيل الحجز\n${portal}`;
        const message = `${brand.name}\n\n${content}\n\nأُرسلت عبر برندة نيابة عن ${brand.name}`;
        const authorization = await db.rpc("salon_authorize_dispatch", { p_job: job.id, p_lease: job.lease_token });
        if (authorization.error) throw authorization.error;
        if (!authorization.data) { result.skipped++; return; }
        let providerId: string | null = null;
        try { providerId = (await sendGreenApiPagerMessage({ phone: job.phone, message })).providerMessageId; }
        catch { /* Ambiguous sends are never replayed */ }
        const finished = await db.rpc("salon_finish_message", { p_job: job.id, p_lease: job.lease_token, p_provider_id: providerId, p_error: providerId ? null : "provider_send_uncertain" });
        if (finished.error || !providerId) result.uncertain++; else result.sent++;
      } catch { result.uncertain++; }
    }));
  }
  return result;
}
