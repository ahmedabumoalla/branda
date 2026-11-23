import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGreenApiBackupOnly, sendGreenApiCustomerMessage } from "@/lib/whatsapp/green-api";
import { MERAM_CAFE_ID } from "@/lib/commerce/meram-profile";
import { selectVerifiedBrandWhatsAppSender } from "@/lib/whatsapp/customer-routing";
import { selectNotificationSender } from "@/lib/whatsapp/notification-sender";

type RejectionJob = { id: string; attempt: string; number: number; customerPhone: string; reason: string };

export async function runMeramRejections() {
  if (process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV !== "production" || process.env.VERCEL !== "1" || isGreenApiBackupOnly()) return { processed: 0 };
  const admin = createAdminClient();
  const due = await admin.rpc("meram_order_notice_due");
  if (due.error) throw new Error("Meram rejection queue unavailable");
  if (due.data !== true) return { processed: 0 };

  let processed = 0;
  while (processed < 5) {
    const privateSender = await selectVerifiedBrandWhatsAppSender(MERAM_CAFE_ID);
    const sender = privateSender ?? await selectNotificationSender();
    if (!sender) break;
    const { data, error } = await admin.rpc("meram_order_notice_claim");
    if (error) throw new Error("Meram rejection claim failed");
    if (!data) break;
    const job = data as RejectionJob;
    let state: "sent" | "failed" | "unknown" = "unknown";
    try {
      const result = await sendGreenApiCustomerMessage(sender, {
        phone: job.customerPhone,
        message: `${privateSender ? "إشعار من ميرام بخصوص طلبك" : "إشعار من برندة بخصوص طلبك لدى ميرام"}\nتعذر قبول الطلب رقم ${job.number}\nالسبب: ${job.reason}`,
      });
      state = result.status === "queued" ? "sent" : result.status === "rejected" ? "failed" : "unknown";
    } catch { /* A timed-out submission cannot safely be replayed. */ }
    const finished = await admin.rpc("meram_order_notice_finish", { p_id: job.id, p_attempt: job.attempt, p_state: state });
    if (finished.error || finished.data !== true) throw new Error("Meram rejection acknowledgement unavailable");
    processed++;
  }
  return { processed };
}
