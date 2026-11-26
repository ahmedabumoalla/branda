import { MERAM_CAFE_ID } from "@/lib/commerce/meram-profile";
import { canonicalBrandMobile } from "@/lib/auth/brand-phone";
import { LOCO_CAFE_ID, supportsBrandWhatsAppConnection } from "./brand-connection-types";
import type { MarketingConnectionStatus } from "@/lib/marketing/types";

/** Deliberately excludes credentials, webhook secrets and provider response bodies */
export type AdminWhatsAppConnectionRow = {
  cafe_id: string;
  status: MarketingConnectionStatus;
  requested_phone: string;
  verified_phone: string | null;
  instance_id: string | null;
  transactional_requested_at: string | null;
  updated_at: string;
};

export type AdminWhatsAppSummary = {
  source: "branda" | "private" | "unavailable";
  sendingPaused: boolean;
  platformFallback: boolean;
  connection: {
    status: MarketingConnectionStatus;
    purpose: "customers" | "campaigns";
    requestedPhone: string;
    verifiedPhone: string | null;
    instanceId: string | null;
    updatedAt: string;
  } | null;
};

/** undefined means the read failed; null means a successful read found no connection */
export function mapAdminWhatsAppSummary(cafeId: string, row: AdminWhatsAppConnectionRow | null | undefined, sendingPaused = false): AdminWhatsAppSummary {
  if (row === undefined || (row && row.cafe_id !== cafeId)) {
    return { source: "unavailable", sendingPaused, platformFallback: false, connection: null };
  }
  const privateByDefault = cafeId === LOCO_CAFE_ID || cafeId === MERAM_CAFE_ID;
  const optional = !privateByDefault && supportsBrandWhatsAppConnection(cafeId);
  const optedIn = Boolean(row?.transactional_requested_at) && (privateByDefault || optional);
  const verified = Boolean(optedIn && row?.status === "connected" && row.instance_id
    && canonicalBrandMobile.test(row.requested_phone) && row.verified_phone === row.requested_phone);
  return {
    source: privateByDefault || (optional && verified) ? "private" : "branda",
    sendingPaused,
    platformFallback: optional && verified,
    connection: row ? {
      status: row.status,
      purpose: optedIn ? "customers" : "campaigns",
      requestedPhone: row.requested_phone,
      verifiedPhone: row.verified_phone,
      instanceId: row.instance_id,
      updatedAt: row.updated_at,
    } : null,
  };
}
