import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readMaintenanceSessionCookie } from "@/lib/platform/maintenance";

export type CafeContext = {
  id: string;
  slug: string;
  name: string;
  role: "owner" | "manager" | "staff" | "platform_admin";
};

export async function getCafeBySlug(slug: string) {
  const supabase = await createClient();
  const normalizedSlug = slug.trim().toLowerCase();

  const { data, error } = await supabase
    .from("cafes")
    .select("id, slug, name, status, is_public")
    .eq("slug", normalizedSlug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: publicCafeRows, error: publicCafeError } = await supabase.rpc(
    "get_public_cafe_by_slug",
    { p_slug: normalizedSlug }
  );

  if (publicCafeError) throw publicCafeError;

  if (Array.isArray(publicCafeRows)) {
    return publicCafeRows[0] ?? null;
  }

  return publicCafeRows ?? null;
}

export async function getPublicCafeBySlugAdmin(slug: string) {
  const supabase = createAdminClient();
  const normalizedSlug = slug.trim().toLowerCase();

  const { data, error } = await supabase
    .from("cafes")
    .select("id, slug, name, status, is_public")
    .eq("slug", normalizedSlug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.status && !["active", "published"].includes(String(data.status))) return null;
  return data;
}

export async function getOwnerCafeContext(): Promise<CafeContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "platform_admin") {
    const maintenanceSession = await readMaintenanceSessionCookie();
    if (
      maintenanceSession?.adminUserId === user.id &&
      maintenanceSession.expiresAt > Date.now()
    ) {
      const { data: maintenanceCafe } = await supabase
        .from("cafes")
        .select("id, slug, name")
        .eq("id", maintenanceSession.cafeId)
        .is("deleted_at", null)
        .maybeSingle();
      if (maintenanceCafe) {
        return {
          id: maintenanceCafe.id,
          slug: maintenanceCafe.slug,
          name: maintenanceCafe.name,
          role: "platform_admin",
        };
      }
    }

    const { data: cafe } = await supabase
      .from("cafes")
      .select("id, slug, name")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (cafe) {
      return { id: cafe.id, slug: cafe.slug, name: cafe.name, role: "platform_admin" };
    }
  }

  const { data: owned } = await supabase
    .from("cafes")
    .select("id, slug, name")
    .eq("owner_user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (owned) {
    return { id: owned.id, slug: owned.slug, name: owned.name, role: "owner" };
  }

  const { data: member } = await supabase
    .from("cafe_members")
    .select("role, cafes(id, slug, name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const cafe = member?.cafes as unknown as { id: string; slug: string; name: string } | null;
  if (cafe && member) {
    return {
      id: cafe.id,
      slug: cafe.slug,
      name: cafe.name,
      role: member.role as CafeContext["role"],
    };
  }

  return null;
}

export async function requireOwnerCafeContext(): Promise<CafeContext> {
  const ctx = await getOwnerCafeContext();
  if (!ctx) {
    throw new Error("Unauthorized: no cafe access");
  }
  return ctx;
}

/** Admin-only operations (audit, cross-cafe) */
export async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "platform_admin") {
    throw new Error("Forbidden: platform admin required");
  }
  return user;
}
