import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Navigation only; each destination keeps its existing server authorization. */
export async function getHomeAccountHref(): Promise<"/admin" | "/dashboard" | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return null;
    const { data: profile, error } = await supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
    if (error || profile?.status !== "active") return null;
    if (profile.role === "platform_admin") return "/admin";
    return ["cafe_owner", "cafe_manager", "cafe_staff"].includes(profile.role) ? "/dashboard" : null;
  } catch {
    // An unavailable session must not prevent the public homepage from loading.
    return null;
  }
}
