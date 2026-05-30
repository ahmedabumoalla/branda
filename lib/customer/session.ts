import { CUSTOMER_KEY, type CustomerProfile } from "@/lib/mock/customer-activity";
import { sanitizeCustomerSession } from "@/lib/cafe/entity-storage-sanitize";

export type BrandaCustomerSession = {
  id: string;
  cafeSlug: string;
  fullName: string;
  phone: string;
  email?: string;
  avatarUrl?: string;
  /** IndexedDB reference — mock only */
  avatarAssetId?: string;
  createdAt: string;
};

export function getCustomerKey(slug: string) {
  return `branda_customer_session_${slug}`;
}

export function getCustomerSession(slug: string): BrandaCustomerSession | null {
  if (typeof window === "undefined") return null;

  const saved = localStorage.getItem(getCustomerKey(slug));
  if (!saved) return null;

  try {
    return JSON.parse(saved) as BrandaCustomerSession;
  } catch {
    return null;
  }
}

export function setCustomerSession(slug: string, session: BrandaCustomerSession) {
  localStorage.setItem(getCustomerKey(slug), JSON.stringify(session));
  upsertCustomerProfile(session);
}

export function updateCustomerSession(
  slug: string,
  updates: Partial<BrandaCustomerSession>
) {
  const current = getCustomerSession(slug);
  if (!current) return null;

  const next: BrandaCustomerSession = {
    ...current,
    ...updates,
  };

  setCustomerSession(slug, sanitizeCustomerSession(next));
  return next;
}

export function clearCustomerSession(slug: string) {
  localStorage.removeItem(getCustomerKey(slug));
}

export function upsertCustomerProfile(session: BrandaCustomerSession) {
  const saved = localStorage.getItem(CUSTOMER_KEY);
  const customers: CustomerProfile[] = saved ? JSON.parse(saved) : [];

  const exists = customers.some((customer) => customer.id === session.id);

  const profile: CustomerProfile = {
    id: session.id,
    cafeSlug: session.cafeSlug,
    fullName: session.fullName,
    phone: session.phone,
    email: session.email,
    createdAt: session.createdAt,
  };

  const next = exists
    ? customers.map((customer) => (customer.id === session.id ? profile : customer))
    : [profile, ...customers];

  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(next));
}