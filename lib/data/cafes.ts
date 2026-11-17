import { getActiveUser } from "@/lib/auth/active-user";
import { readActiveProfileRole } from "@/lib/auth/active-profile-role";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { readMaintenanceSessionCookie } from "@/lib/platform/maintenance";
import { LOCO_CAFE_ID } from "@/lib/whatsapp/brand-connection-types";
import { brandStaffAccessFromPermissions, type BrandStaffAccess, type BrandStaffPermission } from "@/lib/staff/brand-staff-access";

export type CafeContext = {
  id: string;
  slug: string;
  name: string;
  businessCategory: string;
  role: "owner" | "manager" | "staff" | "platform_admin";
  /** Set only for Loco dashboard employees; every other caller treats them as having no brand access */
  staff?: BrandStaffAccess;
};

export const getCafeBySlug = cache(async (slug: string) => {
  const supabase = await createClient();
  const normalizedSlug = slug.trim().toLowerCase();

  const { data, error } = await supabase
    .from("cafes")
    .select("id, slug, name, name_en, status, is_public, business_category")
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

  const publicCafe = Array.isArray(publicCafeRows) ? publicCafeRows[0] : publicCafeRows;
  if (publicCafe) return publicCafe;

  // Salon direct links share the standalone salon's active-brand visibility.
  // Directory listing privacy and all non-salon lookup rules stay unchanged.
  const salon = await getPublicCafeBySlugAdmin(normalizedSlug);
  return salon?.business_category === "hair_salons" ? salon : null;
});

export const getPublicCafeBySlugAdmin = cache(async (slug: string) => {
  const supabase = createAdminClient();
  const normalizedSlug = slug.trim().toLowerCase();

  const { data, error } = await supabase
    .from("cafes")
    .select("id, slug, name, name_en, status, is_public, business_category, created_at")
    .eq("slug", normalizedSlug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.status && !["active", "published"].includes(String(data.status))) return null;
  return data;
});

// React cache is request-scoped: parallel loaders share a check, never another user's session.
const readCafeContext = cache(async (): Promise<CafeContext | null> => {
  const supabase = await createClient();
  const user = await getActiveUser(supabase);
  if (!user) return null;

  const { data: profile } = await readActiveProfileRole(supabase, user.id);

  if (profile?.role === "platform_admin") {
    const maintenanceSession = await readMaintenanceSessionCookie();
    if (
      maintenanceSession?.adminUserId === user.id &&
      maintenanceSession.expiresAt > Date.now()
    ) {
      const { data: maintenanceCafe } = await supabase
        .from("cafes")
        .select("id, slug, name, business_category")
        .eq("id", maintenanceSession.cafeId)
        .is("deleted_at", null)
        .maybeSingle();
      if (maintenanceCafe) {
        return {
          id: maintenanceCafe.id,
          slug: maintenanceCafe.slug,
          name: maintenanceCafe.name,
          businessCategory: maintenanceCafe.business_category ?? "cafes_coffee",
          role: "platform_admin",
        };
      }
    }

    const { data: cafe } = await supabase
      .from("cafes")
      .select("id, slug, name, business_category")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (cafe) {
      return {
        id: cafe.id,
        slug: cafe.slug,
        name: cafe.name,
        businessCategory: cafe.business_category ?? "cafes_coffee",
        role: "platform_admin",
      };
    }
  }

  const { data: owned } = await supabase
    .from("cafes")
    .select("id, slug, name, business_category")
    .eq("owner_user_id", user.id)
    .is("deleted_at", null)
    .neq("status", "archived")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (owned) {
    return {
      id: owned.id,
      slug: owned.slug,
      name: owned.name,
      businessCategory: owned.business_category ?? "cafes_coffee",
      role: "owner",
    };
  }

  const { data: member } = await supabase
    .from("cafe_members")
    .select("role, permissions, cafes!inner(id, slug, name, business_category)")
    .eq("user_id", user.id)
    .neq("cafes.status", "archived")
    .is("cafes.deleted_at", null)
    .limit(1)
    .maybeSingle();

  const cafe = member?.cafes as unknown as {
    id: string;
    slug: string;
    name: string;
    business_category?: string;
  } | null;
  if (cafe && member) {
    return {
      id: cafe.id,
      slug: cafe.slug,
      name: cafe.name,
      businessCategory: cafe.business_category ?? "cafes_coffee",
      role: member.role as CafeContext["role"],
      // User request 2026-11-17: Loco employees enter only the sections the owner granted
      ...(member.role === "staff" && cafe.id === LOCO_CAFE_ID ? { staff: brandStaffAccessFromPermissions(member.permissions) } : {}),
    };
  }

  return null;
});

/** Owner, manager and admin context; Loco dashboard employees get null so existing pages stay closed to them */
export const getOwnerCafeContext = cache(async (): Promise<CafeContext | null> => {
  const ctx = await readCafeContext();
  return ctx?.staff ? null : ctx;
});

/** Dashboard shell context that also admits Loco employees */
export async function getDashboardCafeContext(): Promise<CafeContext | null> {
  return readCafeContext();
}

/**
 * Loco employees pass only when the caller names a permission they hold ("any" covers shared shell data)
 * Owners, managers and platform admins are unaffected
 */
export async function requireOwnerCafeContext(staffPermission?: BrandStaffPermission | "any"): Promise<CafeContext> {
  const ctx = await readCafeContext();
  if (!ctx) {
    throw new Error("Unauthorized: no cafe access");
  }
  if (ctx.staff && (!staffPermission || (staffPermission !== "any" && !ctx.staff[staffPermission]))) {
    throw new Error("Unauthorized: no cafe access");
  }
  return ctx;
}

/** Admin-only operations (audit, cross-cafe) */
export const requirePlatformAdmin = cache(async () => {
  const supabase = await createClient();
  const user = await getActiveUser(supabase);
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await readActiveProfileRole(supabase, user.id);

  if (profile?.role !== "platform_admin") {
    throw new Error("Forbidden: platform admin required");
  }
  return user;
});
