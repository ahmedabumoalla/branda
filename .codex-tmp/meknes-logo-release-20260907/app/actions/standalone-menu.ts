"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";
import { STANDALONE_MENU_FEATURE } from "@/lib/menu/standalone-menu";

export async function getStandaloneMenuPublicationAction(cafeId: string) {
  await requirePlatformAdmin();
  const id = z.string().uuid().parse(cafeId);
  const client = await createClient();
  const { data, error } = await client.from("brand_feature_overrides").select("enabled")
    .eq("cafe_id", id).eq("feature_id", STANDALONE_MENU_FEATURE).maybeSingle();
  if (error) throw error;
  return data?.enabled === true;
}

export async function setStandaloneMenuPublicationAction(cafeId: string, enabled: boolean) {
  const user = await requirePlatformAdmin();
  const input = z.object({ cafeId: z.string().uuid(), enabled: z.boolean() }).parse({ cafeId, enabled });
  const client = await createClient();
  const { data: cafe, error: cafeError } = await client.from("cafes").select("slug")
    .eq("id", input.cafeId).is("deleted_at", null).single();
  if (cafeError) throw cafeError;
  const { error } = await client.from("brand_feature_overrides").upsert({
    cafe_id: input.cafeId, feature_id: STANDALONE_MENU_FEATURE, enabled: input.enabled, updated_by: user.id,
  }, { onConflict: "cafe_id,feature_id" });
  if (error) throw error;
  revalidatePath(`/menu/${cafe.slug}`);
  return input.enabled;
}
