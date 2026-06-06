export type BrandaCustomerSession = {
  id: string;
  cafeSlug: string;
  fullName: string;
  phone: string;
  email?: string;
  avatarUrl?: string;
  avatarAssetId?: string;
  createdAt: string;
};

export function getCustomerKey(_slug: string) {
  return "supabase_auth_session";
}

/** Load customer session from Supabase Auth (server action) */
export async function getCustomerSession(slug: string): Promise<BrandaCustomerSession | null> {
  const { getCustomerSessionAction } = await import("@/app/actions/auth");
  return getCustomerSessionAction(slug);
}

/** @deprecated Sessions are managed by Supabase Auth — use loginCustomerAction */
export function setCustomerSession(_slug: string, _session: BrandaCustomerSession) {
  console.warn("[session] setCustomerSession is deprecated — use loginCustomerAction");
}

export async function updateCustomerSession(
  slug: string,
  updates: Partial<BrandaCustomerSession>
): Promise<BrandaCustomerSession | null> {
  const current = await getCustomerSession(slug);
  if (!current) return null;
  return { ...current, ...updates };
}

export async function clearCustomerSession(_slug: string) {
  const { logoutCustomerAction } = await import("@/app/actions/auth");
  await logoutCustomerAction();
}

/** @deprecated CRM profiles live in customer_profiles table */
export function upsertCustomerProfile(_session: BrandaCustomerSession) {
  /* no-op — handled by loginCustomerAction */
}
