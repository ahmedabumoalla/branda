export function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

export function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

export function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

export function requireSupabaseUrl() {
  const value = getSupabaseUrl();
  if (!value) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  return value;
}

export function requireSupabaseAnonKey() {
  const value = getSupabaseAnonKey();
  if (!value) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return value;
}

export function requireSupabaseServiceRoleKey() {
  const value = getSupabaseServiceRoleKey();
  if (!value) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  return value;
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

export function getPublicAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000"
  );
}

export function getPublicDomain() {
  return process.env.NEXT_PUBLIC_BARNDAKSA_PUBLIC_DOMAIN ?? "barndaksa.com";
}
