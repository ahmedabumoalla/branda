import "server-only";
import { getLocoCustomerWhatsAppCredentials, getBrandCustomerWhatsAppCredentials } from "@/lib/data/brand-whatsapp";
import { LOCO_CAFE_ID, supportsPrivateWhatsApp } from "@/lib/whatsapp/brand-connection-types";
import { isGreenApiBackupOnly, getGreenApiCustomerPlatformSenders, isGreenApiCustomerSenderReady, type GreenApiCustomerSender } from "@/lib/whatsapp/green-api";
import { getGreenApiMarketingAccount } from "@/lib/whatsapp/green-api-marketing";

/** Input comes from the atomic admission/claim, never Auth user metadata or a phone lookup. */
export function isLocoCustomerOtp(cafeId: string | null | undefined, purpose: string | null | undefined) {
  return cafeId === LOCO_CAFE_ID && (purpose === "customer_signup" || purpose === "customer_login");
}

export function isBrandCustomerOtp(cafeId: string | null | undefined, purpose: string | null | undefined) {
  return supportsPrivateWhatsApp(cafeId) && (purpose === "customer_signup" || purpose === "customer_login");
}

/** Optional private sender is selected before submission; no retry after an uncertain send. */
export async function selectBrandLoyaltySender(cafeId: string): Promise<GreenApiCustomerSender | null> {
  if (cafeId === LOCO_CAFE_ID) return selectLocoLoyaltySender(cafeId);
  if (!supportsPrivateWhatsApp(cafeId)) return null;
  try {
    const linked = await getBrandCustomerWhatsAppCredentials(cafeId);
    if (linked && (await getGreenApiMarketingAccount(linked)).phone === linked.expectedPhone) return linked;
  } catch { /* The optional connection can fall back before any submission. */ }
  return null;
}

export async function selectBrandCustomerSender(cafeId: string): Promise<GreenApiCustomerSender | null> {
  if (cafeId === LOCO_CAFE_ID) return selectLocoCustomerSender(cafeId);
  if (!supportsPrivateWhatsApp(cafeId)) return null;
  const { primary, backup } = getGreenApiCustomerPlatformSenders();
  if (isGreenApiBackupOnly()) return backup && await isGreenApiCustomerSenderReady(backup) ? backup : null;
  const linked = await selectBrandLoyaltySender(cafeId);
  if (linked) return linked;
  if (primary && await isGreenApiCustomerSenderReady(primary)) return primary;
  if (backup && await isGreenApiCustomerSenderReady(backup)) return backup;
  return null;
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
  if (isGreenApiBackupOnly()) {
    const { backup } = getGreenApiCustomerPlatformSenders();
    return backup && await isGreenApiCustomerSenderReady(backup) ? backup : null;
  }
  if (cafeId !== LOCO_CAFE_ID) return null;
  const linked = await selectLocoLoyaltySender(cafeId);
  if (linked) return linked;
  const { primary, backup } = getGreenApiCustomerPlatformSenders();
  if (primary && await isGreenApiCustomerSenderReady(primary)) return primary;
  if (backup && await isGreenApiCustomerSenderReady(backup)) return backup;
  return null;
}
