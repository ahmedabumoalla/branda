"use server";

import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";
import { getCafeFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export async function loadAdminMenuBranchesAction(cafeId: string) {
  try {
    await requirePlatformAdmin();
    const id = z.uuid().parse(cafeId);
    const client = await createClient();
    const { data: cafe, error: cafeError } = await client.from("cafes").select("id,status,deleted_at").eq("id", id).maybeSingle();
    if (cafeError) throw cafeError;
    if (!cafe || cafe.deleted_at || !["active", "published"].includes(cafe.status)) return { ok: true as const, menuEnabled: false, branches: [] };
    const menuEnabled = featureCodesAllow(await getCafeFeatureCodes(id), "menu");
    if (!menuEnabled) return { ok: true as const, menuEnabled: false, branches: [] };
    const { data, error } = await client.from("branches").select("id,name,menu_slug,is_primary")
      .eq("cafe_id", id).eq("active", true).not("menu_slug", "is", null).is("deleted_at", null).order("sort_order").order("id");
    if (error) throw error;
    return { ok: true as const, menuEnabled: true, branches: (data ?? []).map(branch => ({ id: String(branch.id), name: String(branch.name), slug: String(branch.menu_slug), primary: Boolean(branch.is_primary) })) };
  } catch { return { ok: false as const, error: "تعذر تحميل منيوهات الفروع تحقق من صلاحية الدخول وأعد المحاولة" }; }
}
