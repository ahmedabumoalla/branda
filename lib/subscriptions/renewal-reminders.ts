import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGreenApiSubscriptionReminder } from "@/lib/whatsapp/green-api";

export type RenewalReminder = { id: string; lease_token: string; phone: string; brand_name: string; hours_before: 24 | 12; expires_at: string };
export function subscriptionReminderText(job: RenewalReminder) {
  if (![24,12].includes(job.hours_before) || !Number.isFinite(Date.parse(job.expires_at))) throw new Error("INVALID_REMINDER");
  const expiry = new Intl.DateTimeFormat("ar-SA", { calendar: "gregory", dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(job.expires_at));
  return `تذكير بتجديد الاشتراك من برندة\n${job.brand_name}\nمتبقي على انتهاء اشتراكك حوالي ${job.hours_before === 24 ? "٢٤" : "١٢"} ساعة\nموعد الانتهاء: ${expiry} بتوقيت الرياض\nجدد اشتراكك الآن لاستمرار خدماتك\nhttps://barndaksa.com/dashboard/subscription`;
}

export async function runSubscriptionRenewalReminders() {
  const db = createAdminClient();
  const { data, error } = await db.rpc("claim_subscription_renewal_reminders", { p_limit: 20 });
  if (error) throw new Error("REMINDER_CLAIM_FAILED");
  const jobs = (data ?? []) as RenewalReminder[];
  const result = { claimed: jobs.length, queued: 0, skipped: 0, unknown: 0, retry: 0, failed: 0 };
  for (let offset = 0; offset < jobs.length; offset += 5) {
    await Promise.all(jobs.slice(offset,offset+5).map(async job => {
      try {
        const message = subscriptionReminderText(job);
        const sent = await sendGreenApiSubscriptionReminder({ phone: job.phone, message }, async () => {
          const authorized = await db.rpc("authorize_subscription_renewal_reminder", { p_id: job.id, p_token: job.lease_token });
          if (authorized.error) throw new Error("REMINDER_AUTHORIZATION_FAILED");
          return authorized.data === true;
        });
        if (sent.status === "skipped") { result.skipped++; return; }
        const finished = await db.rpc("finish_subscription_renewal_reminder", { p_id: job.id, p_token: job.lease_token, p_outcome: sent.status, p_provider_id: sent.providerMessageId ?? null });
        if (finished.error || finished.data !== true) throw new Error("REMINDER_FINISH_FAILED");
        if (sent.status === "queued") result.queued++;
        else if (sent.status === "unknown") result.unknown++;
        else result.retry++;
      } catch { result.failed++; }
    }));
  }
  return result;
}
