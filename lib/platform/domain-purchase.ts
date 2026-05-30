import type { PlatformOperation } from "@/lib/platform/admin-data";

export type DomainPurchaseStatus =
  | "searching"
  | "available"
  | "unavailable"
  | "pending_payment"
  | "payment_required"
  | "mock_paid"
  | "purchase_pending"
  | "purchased"
  | "connected"
  | "failed";

export type CafePurchasedDomain = {
  id: string;
  cafeSlug: string;
  domain: string;
  tld: string;
  price?: number;
  currency?: string;
  years: number;
  autoRenew: boolean;
  status: DomainPurchaseStatus;
  vercelOrderId?: string;
  vercelDomainId?: string;
  createdAt: string;
  paidAt?: string;
  purchasedAt?: string;
  errorMessage?: string;
};

export type DomainAvailabilityResult = {
  domain: string;
  tld: string;
  available: boolean;
  supportedTld: boolean;
  status: DomainPurchaseStatus;
  message?: string;
};

export type DomainPriceResult = {
  domain: string;
  tld: string;
  supportedTld: boolean;
  years: number;
  price: number;
  currency: string;
  status: DomainPurchaseStatus;
  message?: string;
};

export const DOMAIN_SEARCHES_KEY = "branda_qatrah_domain_searches";
export const DOMAIN_PURCHASES_KEY = "branda_qatrah_domain_purchases";
export const DOMAIN_PURCHASE_ACTIVE_KEY = "branda_qatrah_purchased_domain_active";

const SUPPORTED_TLDS = [".com", ".net", ".org", ".io", ".co", ".app", ".store", ".sa"] as const;

export function normalizeDomain(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

export function extractTld(domain: string) {
  const idx = domain.lastIndexOf(".");
  return idx === -1 ? "" : domain.slice(idx);
}

export function isValidDomain(domain: string) {
  const normalized = normalizeDomain(domain);
  return /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i.test(normalized);
}

export function isSupportedDirectPurchaseTld(tld: string) {
  return SUPPORTED_TLDS.includes(tld as (typeof SUPPORTED_TLDS)[number]);
}

export function isLiveDomainPurchaseEnabled() {
  return process.env.VERCEL_DOMAIN_PURCHASE_LIVE === "true";
}

export function createMockOrderId(domain: string) {
  return `mock_order_${domain.replace(/\W+/g, "_")}_${Date.now()}`;
}

export function buildDomainOperation(input: {
  cafeId: string;
  cafeName: string;
  type: "شراء دومين" | "ربط دومين";
  title: string;
  amount?: number;
  status: string;
}): PlatformOperation {
  return {
    id: `op_domain_${Date.now()}`,
    cafeId: input.cafeId,
    cafeName: input.cafeName,
    type: input.type,
    title: input.title,
    amount: input.amount,
    status: input.status,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}
