import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectGreenApiPlatformSender, sendGreenApiCustomerMessage } from "@/lib/whatsapp/green-api";

type HospitalNotification = { id: string; lease_token: string; phone: string; order_status: "accepted" | "cancelled"; language: "ar" | "en"; customer_name: string; order_number: number; reason: string };
export function hospitalNotificationText(job: HospitalNotification) {
  return job.language === "en"
    ? `MND\nOrder #${job.order_number}\n${job.order_status === "accepted" ? "Your hospital order has been accepted" : `Your hospital order was declined\nReason: ${job.reason}`}`
    : `MND\nالطلب رقم ${job.order_number}\n${job.order_status === "accepted" ? "تم تأكيد طلب المستشفى" : `تم رفض طلب المستشفى\nالسبب: ${job.reason}`}`;
}

/** Explicit activation is required at the later combined release; never dispatch from local preview. */
export async function runHospitalNotifications() {
  if (process.env.NODE_ENV !== "production" || process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "production" || process.env.HOSPITAL_NOTIFICATIONS_ENABLED !== "true") return { disabled: true, claimed: 0, queued: 0 };
  const client = createAdminClient();
  const claimed = await client.rpc("hospital_notifications_claim", { p_limit: 1 });
  if (claimed.error) throw new Error("Hospital notification queue unavailable");
  let queued = 0;
  for (const job of claimed.data as HospitalNotification[]) {
    let sender;
    try { sender = await selectGreenApiPlatformSender(); }
    catch {
      await client.rpc("hospital_notification_finish", { p_id: job.id, p_lease: job.lease_token, p_outcome: "not_sent", p_message_id: null });
      continue;
    }
    const approved = await client.rpc("hospital_notification_authorize", { p_id: job.id, p_lease: job.lease_token });
    if (approved.error || approved.data !== true) continue;
    let outcome: "queued" | "rejected" | "unknown" = "unknown", messageId: string | null = null;
    try {
      const result = await sendGreenApiCustomerMessage(sender, { phone: job.phone, message: hospitalNotificationText(job) });
      outcome = result.status; messageId = result.providerMessageId ?? null;
    } catch { /* Ambiguous attempts stay unknown and are never automatically replayed. */ }
    const finished = await client.rpc("hospital_notification_finish", { p_id: job.id, p_lease: job.lease_token, p_outcome: outcome, p_message_id: messageId });
    if (finished.error || finished.data !== true) throw new Error("Hospital notification acknowledgement unavailable");
    if (outcome === "queued") queued++;
  }
  return { disabled: false, claimed: claimed.data.length, queued };
}
