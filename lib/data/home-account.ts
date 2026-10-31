import "server-only";
import { createClient } from "@/lib/supabase/server";

export type HomeAccount = { href: "/admin" | "/dashboard"; name: string; avatarUrl: string | null };

function safeAvatar(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000 || /[\\\u0000-\u0020]/.test(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

/** Navigation only; each destination keeps its existing server authorization. */
export async function getHomeAccount(): Promise<HomeAccount | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return null;
    const { data: profile, error } = await supabase.from("profiles").select("role,status,full_name").eq("id", user.id).maybeSingle();
    if (error || profile?.status !== "active") return null;
    const href = profile.role === "platform_admin" ? "/admin" : ["cafe_owner", "cafe_manager", "cafe_staff"].includes(profile.role) ? "/dashboard" : null;
    if (!href) return null;
    return { href, name: String(profile.full_name || user.user_metadata?.full_name || "حسابي"), avatarUrl: safeAvatar(user.user_metadata?.avatar_url) ?? safeAvatar(user.user_metadata?.picture) };
  } catch {
    // An unavailable session must not prevent the public homepage from loading.
    return null;
  }
}

export async function getHomeAccountHref() { return (await getHomeAccount())?.href ?? null; }
