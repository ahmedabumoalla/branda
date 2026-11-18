import "server-only";
import { brandAllowsNewWork } from "@/lib/data/account-cancellation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGreenApiLoyaltyWelcomeReady, sendGreenApiLoyaltyWelcome } from "@/lib/whatsapp/green-api";

type Greeting = { id: string; claimToken: string; cafeId: string; brandName: string; customerName: string | null; phone: string };
const line = (value: string) => value.replace(/[\r\n\u0000-\u001f]/g, " ").trim().slice(0, 120);

export function birthdayGreetingMessage(job: Greeting) {
  const brand = line(job.brandName);
  const name = line(job.customerName ?? "").split(/\s+/u)[0] ?? "";
  return [
    name ? `كل عام وأنت بخير يا ${name} 🎉` : "كل عام وأنت بخير 🎉",
    `${brand} يهنئك بيوم ميلادك ويتمنى لك عامًا مليئًا بالفرح`,
    `يسعدنا أن تحتفل معنا وبطاقة ولاء ${brand} معك في كل زيارة`,
    `مع تحيات فريق ${brand} 🤍`,
  ].join("\n\n");
}

/** One greeting per customer per year; the database claim deduplicates concurrent cron workers */
export async function dispatchBirthdayGreetings(limit = 1) {
  const startedAt = Date.now();
  const result = { processed: 0, queued: 0, rejected: 0, unknown: 0, deferred: false };
  if (!await isGreenApiLoyaltyWelcomeReady()) return { ...result, deferred: true };
  const admin = createAdminClient();
  for (let index = 0; index < Math.min(5, Math.max(1, limit)) && (index === 0 || Date.now() - startedAt < 70_000); index++) {
    const { data, error } = await admin.rpc("claim_loyalty_birthday_greeting", { p_primary_ready: true });
    if (error) throw new Error("birthday_greeting_claim_unavailable");
    if (!data) break;
    const job = data as Greeting;
    let outcome: Awaited<ReturnType<typeof sendGreenApiLoyaltyWelcome>>;
    try {
      outcome = await brandAllowsNewWork(job.cafeId)
        ? await sendGreenApiLoyaltyWelcome({ phone: job.phone, message: birthdayGreetingMessage(job) })
        : { status: "rejected" };
    } catch { outcome = { status: "unknown" }; }
    const { data: saved, error: saveError } = await admin.rpc("finish_loyalty_birthday_greeting", {
      p_id: job.id, p_token: job.claimToken, p_status: outcome.status, p_provider_message_id: outcome.providerMessageId ?? null,
    });
    if (saveError || !saved) throw new Error("birthday_greeting_result_unavailable");
    result.processed++;
    result[outcome.status]++;
  }
  return result;
}
