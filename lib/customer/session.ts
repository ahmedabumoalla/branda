export type BarndaksaCustomerSession = {
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

const SESSION_TTL_MS = 30_000;
const sessionCache = new Map<string, { at: number; value: BarndaksaCustomerSession | null }>();
const sessionRequests = new Map<string, Promise<BarndaksaCustomerSession | null>>();

/** Load customer session from Supabase Auth with short client-side de-duplication. */
export async function getCustomerSession(slug: string): Promise<BarndaksaCustomerSession | null> {
  const cached = sessionCache.get(slug);
  if (cached && Date.now() - cached.at < SESSION_TTL_MS) return cached.value;

  const pending = sessionRequests.get(slug);
  if (pending) return pending;

  const request = import("@/app/actions/auth")
    .then(({ getCustomerSessionAction }) => getCustomerSessionAction(slug))
    .then((value) => {
      sessionCache.set(slug, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      sessionRequests.delete(slug);
    });

  sessionRequests.set(slug, request);
  return request;
}

export function clearCachedCustomerSession(slug?: string) {
  if (slug) {
    sessionCache.delete(slug);
    sessionRequests.delete(slug);
  } else {
    sessionCache.clear();
    sessionRequests.clear();
  }
}

/** @deprecated Sessions are managed by Supabase Auth — use loginCustomerAction */
export function setCustomerSession(_slug: string, _session: BarndaksaCustomerSession) {
  console.warn("[session] setCustomerSession is deprecated — use loginCustomerAction");
}

export async function updateCustomerSession(
  slug: string,
  updates: Partial<BarndaksaCustomerSession>
): Promise<BarndaksaCustomerSession | null> {
  const current = await getCustomerSession(slug);
  if (!current) return null;
  const next = { ...current, ...updates };
  sessionCache.set(slug, { at: Date.now(), value: next });
  return next;
}

export async function clearCustomerSession(slug?: string) {
  const { logoutCustomerAction } = await import("@/app/actions/auth");
  await logoutCustomerAction();
  clearCachedCustomerSession(slug);
}

/** @deprecated CRM profiles live in customer_profiles table */
export function upsertCustomerProfile(_session: BarndaksaCustomerSession) {
  /* no-op — handled by loginCustomerAction */
}
