export type BarndaksaCustomerSession = {
  id: string;
  cafeSlug: string;
  fullName: string;
  phone: string;
  phoneNormalized?: string;
  phoneVerifiedAt?: string;
  phoneVerificationRequired?: boolean;
  email?: string;
  avatarUrl?: string;
  avatarAssetId?: string;
  createdAt: string;
};

export function getCustomerKey(_slug: string) {
  return `barndaksa_customer_session_${_slug}`;
}

const SESSION_TTL_MS = 30_000;
const sessionCache = new Map<string, { at: number; value: BarndaksaCustomerSession | null }>();
const sessionRequests = new Map<string, Promise<BarndaksaCustomerSession | null>>();

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

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

export async function waitForConfirmedCustomerSession(
  slug: string,
  timeoutMs = 5_000
): Promise<BarndaksaCustomerSession | null> {
  const deadline = Date.now() + timeoutMs;
  const { getCustomerSessionAction } = await import("@/app/actions/auth");

  while (Date.now() <= deadline) {
    clearCachedCustomerSession(slug);
    const session = await getCustomerSessionAction(slug);
    if (session) {
      sessionCache.set(slug, { at: Date.now(), value: session });
      return session;
    }
    await sleep(250);
  }

  return null;
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
  await logoutCustomerAction(slug);
  clearCachedCustomerSession(slug);
}

/** @deprecated CRM profiles live in customer_profiles table */
export function upsertCustomerProfile(_session: BarndaksaCustomerSession) {
  /* no-op — handled by loginCustomerAction */
}
