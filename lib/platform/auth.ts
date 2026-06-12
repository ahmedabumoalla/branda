export type BarndaksaUserRole = "admin" | "cafe_owner";

/** @deprecated Use Supabase Auth via loginOwnerAction */
export type BarndaksaAuthUser = {
  id: string;
  fullName: string;
  email: string;
  role: BarndaksaUserRole;
  cafeSlug?: string;
  cafeId?: string;
  status: "نشط" | "موقوف";
};

export const BARNDAKSA_AUTH_SESSION_KEY = "barndaksa_auth_session";

/** Mock users removed — use Supabase Auth + development seed */
export const mockAuthUsers: BarndaksaAuthUser[] = [];

export async function loginWithRole(email: string, password: string) {
  const { loginOwnerAction } = await import("@/app/actions/auth");
  return loginOwnerAction(email, password);
}

export async function getBarndaksaAuthSession() {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    id: user.id,
    fullName: profile.full_name,
    email: profile.email ?? user.email,
    role: profile.role === "platform_admin" ? "admin" : "cafe_owner",
    loginAt: user.last_sign_in_at ?? new Date().toISOString(),
  };
}

export async function logoutBarndaksaAuth() {
  const { logoutAction } = await import("@/app/actions/auth");
  await logoutAction();
}
