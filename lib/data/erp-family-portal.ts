import "server-only";
import { getSessionUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import type { FamilyPortalSnapshot } from "@/lib/erp/families";

export type FamilyPortalState = { state: "ready"; data: FamilyPortalSnapshot } | { state: "missing" | "login" | "unlinked" | "unavailable" };

/** The browser never names a family: the database resolves it from the verified phone of the signed-in session */
export async function readFamilyPortal(slug: string): Promise<FamilyPortalState> {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return { state: "missing" };
  try {
    const user = await getSessionUser();
    if (!user || !user.phone_confirmed_at || !normalizeSaudiPhone(user.phone ?? "")) return { state: "login" };
    const { data, error } = await createAdminClient().rpc("erp_family_portal", { p_slug: slug, p_user: user.id });
    if (error) {
      if (/FAMILY_UNAVAILABLE/.test(error.message ?? "")) return { state: "missing" };
      if (/FAMILY_NOT_FOUND|FAMILY_FORBIDDEN/.test(error.message ?? "")) return { state: "unlinked" };
      return { state: "unavailable" };
    }
    const snapshot = data as FamilyPortalSnapshot | null;
    if (!snapshot || snapshot.brand?.slug !== slug || !Array.isArray(snapshot.families) || snapshot.families.length !== 1) return { state: "unavailable" };
    return { state: "ready", data: snapshot };
  } catch {
    return { state: "unavailable" };
  }
}
