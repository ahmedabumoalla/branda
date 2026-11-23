import "server-only";
import { getLocoCustomerWhatsAppCredentials, getBrandCustomerWhatsAppCredentials } from "@/lib/data/brand-whatsapp";
import { LOCO_CAFE_ID, supportsPrivateWhatsApp } from "@/lib/whatsapp/brand-connection-types";
import { isGreenApiBackupOnly, getGreenApiCustomerPlatformSenders, isGreenApiCustomerSenderReady, type GreenApiCustomerSender } from "@/lib/whatsapp/green-api";
import { getGreenApiMarketingAccount } from "@/lib/whatsapp/green-api-marketing";
import { selectNotificationSender } from "@/lib/whatsapp/notification-sender";

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
  return selectVerifiedBrandWhatsAppSender(cafeId);
}

export async function selectVerifiedBrandWhatsAppSender(cafeId: string): Promise<GreenApiCustomerSender | null> {
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
  const linked = isGreenApiBackupOnly() ? null : await selectBrandLoyaltySender(cafeId);
  if (linked) return linked;
  if (primary && await isGreenApiCustomerSenderReady(primary)) return primary;
  if (backup && await isGreenApiCustomerSenderReady(backup)) return backup;
  return null;
}

/** Customer verification codes of a brand with a private connection: the brand's own number, then Branda's
 * notifications number, then the primary and first standby as before. Documents keep selectBrandCustomerSender */
export async function selectBrandOtpSender(cafeId: string): Promise<GreenApiCustomerSender | null> {
  const linked = isGreenApiBackupOnly() ? null : await selectBrandLoyaltySender(cafeId);
  if (linked) return linked;
  const notify = await selectNotificationSender();
  if (notify && await isGreenApiCustomerSenderReady(notify)) return notify;
  return selectBrandCustomerSender(cafeId);
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
  const linked = isGreenApiBackupOnly() ? null : await selectLocoLoyaltySender(cafeId);
  if (linked) return linked;
  const { primary, backup } = getGreenApiCustomerPlatformSenders();
  if (primary && await isGreenApiCustomerSenderReady(primary)) return primary;
  if (backup && await isGreenApiCustomerSenderReady(backup)) return backup;
  return null;
}
