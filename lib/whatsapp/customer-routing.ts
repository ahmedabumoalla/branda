import "server-only";
import { getLocoCustomerWhatsAppCredentials } from "@/lib/data/brand-whatsapp";
import { LOCO_CAFE_ID } from "@/lib/whatsapp/brand-connection-types";
import { getGreenApiCustomerPlatformSenders, isGreenApiCustomerSenderReady, type GreenApiCustomerSender } from "@/lib/whatsapp/green-api";
import { getGreenApiMarketingAccount } from "@/lib/whatsapp/green-api-marketing";

/** Input comes from the atomic admission/claim, never Auth user metadata or a phone lookup. */
export function isLocoCustomerOtp(cafeId: string | null | undefined, purpose: string | null | undefined) {
  return cafeId === LOCO_CAFE_ID && (purpose === "customer_signup" || purpose === "customer_login");
}

/** Read-only health checks choose one sender before any message is submitted. */
export async function selectLocoCustomerSender(cafeId: string): Promise<GreenApiCustomerSender | null> {
  if (cafeId !== LOCO_CAFE_ID) return null;
  try {
    const linked = await getLocoCustomerWhatsAppCredentials(cafeId);
    if (linked && (await getGreenApiMarketingAccount(linked)).phone === linked.expectedPhone) return linked;
  } catch { /* Unavailable or changed link falls back before submitting a message. */ }
  const { primary, backup } = getGreenApiCustomerPlatformSenders();
  if (primary && await isGreenApiCustomerSenderReady(primary)) return primary;
  if (backup && await isGreenApiCustomerSenderReady(backup)) return backup;
  return null;
}
