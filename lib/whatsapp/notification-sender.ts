import "server-only";
import { getGreenApiPartnerInstanceRecords } from "@/lib/whatsapp/green-api-partner";
import { getGreenApiMarketingAccount } from "@/lib/whatsapp/green-api-marketing";
import type { GreenApiCustomerSender } from "@/lib/whatsapp/green-api";

/** Branda's notifications number, which the user also calls the second standby number (رقم رسائل الإشعارات أو
 * الرقم الاحتياطي الثاني). Named by the user on 2026-11-22. It carries the loyalty card link message so that the
 * primary number and the first standby stay free for verification codes. It never carries verification codes. */
export const NOTIFICATION_SENDER_PHONE = "966558891694";

const FOUND_FOR_MS = 3 * 60_000;
const MISSING_FOR_MS = 60_000;
let cached: { sender: GreenApiCustomerSender | null; until: number } | null = null;

/** The instance is found by its phone on the partner account at run time, so no instance key lives in the code
 * or needs a deployment setting. Returns null unless that instance is paid, authorised and still holds this phone. */
export async function selectNotificationSender(now = Date.now()): Promise<GreenApiCustomerSender | null> {
  if (cached && cached.until > now) return cached.sender;
  let sender: GreenApiCustomerSender | null = null;
  try {
    for (const row of await getGreenApiPartnerInstanceRecords()) {
      if (row.deleted !== false || row.isExpired !== false || row.isPartner !== true || typeof row.apiTokenInstance !== "string") continue;
      const idInstance = String(row.idInstance);
      // Branda's primary and first standby are never candidates
      if (idInstance === process.env.GREEN_API_ID_INSTANCE?.trim() || idInstance === process.env.GREEN_API_OTP_BACKUP_ID_INSTANCE?.trim()) continue;
      const credentials = { idInstance, apiTokenInstance: row.apiTokenInstance, apiUrl: typeof row.apiUrl === "string" && row.apiUrl ? row.apiUrl : "https://api.greenapi.com" };
      try {
        // Throws unless the instance is authorised; the phone is read from WhatsApp itself, not from a label
        if ((await getGreenApiMarketingAccount(credentials)).phone !== NOTIFICATION_SENDER_PHONE) continue;
      } catch { continue; }
      sender = { apiUrl: credentials.apiUrl.replace(/\/+$/, ""), idInstance, apiTokenInstance: credentials.apiTokenInstance };
      break;
    }
  } catch { sender = null; }
  cached = { sender, until: now + (sender ? FOUND_FOR_MS : MISSING_FOR_MS) };
  return sender;
}
