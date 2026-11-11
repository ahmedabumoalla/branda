import "server-only";
import { getLocoCustomerWhatsAppCredentials } from "@/lib/data/brand-whatsapp";
import { LOCO_CAFE_ID } from "@/lib/whatsapp/brand-connection-types";
import { getGreenApiCustomerPlatformSenders, isGreenApiCustomerSenderReady, type GreenApiCustomerSender } from "@/lib/whatsapp/green-api";
import { getGreenApiMarketingAccount } from "@/lib/whatsapp/green-api-marketing";

/** Input comes from the atomic admission/claim, never Auth user metadata or a phone lookup. */
export function isLocoCustomerOtp(cafeId: string | null | undefined, purpose: string | null | undefined) {
  return cafeId === LOCO_CAFE_ID && (purpose === "customer_signup" || purpose === "customer_login");
}

/** Loyalty welcomes and card links must retain the brand's identity, even offline. */
export async function selectLocoLoyaltySender(cafeId: string): Promise<GreenApiCustomerSender | null> {
  if (cafeId !== LOCO_CAFE_ID) return null;
  try {
    const linked = await getLocoCustomerWhatsAppCredentials(cafeId);
    if (linked && (await getGreenApiMarketingAccount(linked)).phone === linked.expectedPhone) return linked;
  } catch { /* Leave loyalty jobs pending when the verified brand link is unavailable. */ }
  return null;
}

/** Existing access/document flows retain their pre-submit platform fallback. */
export async function selectLocoCustomerSender(cafeId: string): Promise<GreenApiCustomerSender | null> {
  if (cafeId !== LOCO_CAFE_ID) return null;
  const linked = await selectLocoLoyaltySender(cafeId);
  if (linked) return linked;
  const { primary, backup } = getGreenApiCustomerPlatformSenders();
  if (primary && await isGreenApiCustomerSenderReady(primary)) return primary;
  if (backup && await isGreenApiCustomerSenderReady(backup)) return backup;
  return null;
}
