import "server-only";
import { MERAM_CAFE_ID } from "@/lib/commerce/meram-profile";
import { getBrandCustomerWhatsAppCredentials } from "@/lib/data/brand-whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGreenApiMarketingAccount } from "@/lib/whatsapp/green-api-marketing";
import { isGreenApiBackupOnly, isGreenApiPlatformSender, sendGreenApiCustomerMessage } from "@/lib/whatsapp/green-api";
import { NOTIFICATION_SENDER_PHONE } from "@/lib/whatsapp/notification-sender";

type RejectionJob = { id: string; attempt: string; number: number; customerPhone: string; reason: string };

export async function runMeramRejections() {
  if (process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV !== "production" || process.env.VERCEL !== "1" || isGreenApiBackupOnly()) return { processed: 0 };
  const admin = createAdminClient();
  const due = await admin.rpc("meram_order_notice_due");
  if (due.error) throw new Error("Meram rejection queue unavailable");
  if (due.data !== true) return { processed: 0 };
  const sender = await getBrandCustomerWhatsAppCredentials(MERAM_CAFE_ID);
  if (!sender || isGreenApiPlatformSender(sender) || sender.expectedPhone === NOTIFICATION_SENDER_PHONE) return { processed: 0 };
  const account = await getGreenApiMarketingAccount(sender);
  if (account.phone !== sender.expectedPhone) return { processed: 0 };
  let processed = 0;
  while (processed < 5) {
    const { data, error } = await admin.rpc("meram_order_notice_claim", {
      p_generation: sender.generation, p_phone: sender.expectedPhone, p_instance: sender.idInstance,
    });
    if (error) throw new Error("Meram rejection claim failed");
    if (!data) break;
    const job = data as RejectionJob;
    let state: "sent" | "failed" | "unknown" = "unknown";
    try {
      const result = await sendGreenApiCustomerMessage(sender, {
        phone: job.customerPhone,
        message: `ميرام\nتعذر قبول طلبك رقم ${job.number}\nالسبب: ${job.reason}\nيمكنك الرد على هذه الرسالة للتواصل مع فريق ميرام`,
      });
      state = result.status === "queued" ? "sent" : result.status === "rejected" ? "failed" : "unknown";
    } catch { /* A timed-out submission cannot safely be replayed. */ }
    const finished = await admin.rpc("meram_order_notice_finish", { p_id: job.id, p_attempt: job.attempt, p_state: state });
    if (finished.error || finished.data !== true) throw new Error("Meram rejection acknowledgement unavailable");
    processed++;
  }
  return { processed };
}
