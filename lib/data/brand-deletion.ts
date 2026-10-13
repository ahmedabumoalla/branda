import "server-only";

import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const idSchema = z.string().uuid();
const deletionSchema = z.object({ cafeId: idSchema, confirmation: z.string().min(1).max(100) });
const assetsSchema = z.array(z.object({ bucket: z.string().min(1), path: z.string().min(1) }));

export type PendingBrandDeletion = { cafeId: string; slug: string };
export type BrandDeletionResult = PendingBrandDeletion & { cleanupPending: boolean };

export async function getPendingBrandDeletions(): Promise<PendingBrandDeletion[]> {
  await requirePlatformAdmin();
  const db = await createClient();
  const { data, error } = await db.from("brand_deletion_jobs").select("cafe_id,slug").order("created_at");
  if (error) throw error;
  return (data ?? []).map(row => ({ cafeId: String(row.cafe_id), slug: String(row.slug) }));
}

export async function finishBrandDeletion(cafeId: string): Promise<boolean> {
  await requirePlatformAdmin();
  idSchema.parse(cafeId);
  const db = await createClient();
  const { data, error } = await db.rpc("admin_brand_deletion_assets", { p_cafe_id: cafeId });
  if (error) throw error;
  const assets = assetsSchema.parse(data);
  // Only the admin-authorized database manifest supplies object paths.
  const storage = createAdminClient().storage;
  const buckets = new Map<string, string[]>();
  for (const asset of assets) {
    const paths = buckets.get(asset.bucket) ?? [];
    paths.push(asset.path);
    buckets.set(asset.bucket, paths);
  }
  for (const [bucket, paths] of buckets) {
    for (let offset = 0; offset < paths.length; offset += 100) {
      const removed = await storage.from(bucket).remove(paths.slice(offset, offset + 100));
      if (removed.error) return false;
    }
  }
  // Recheck actual Storage metadata, including late uploads, before reporting completion.
  const finished = await db.rpc("admin_finish_brand_deletion", { p_cafe_id: cafeId });
  if (finished.error) throw finished.error;
  return finished.data === true;
}

export async function permanentlyDeleteBrand(input: { cafeId: string; confirmation: string }): Promise<BrandDeletionResult> {
  await requirePlatformAdmin();
  const parsed = deletionSchema.safeParse(input);
  if (!parsed.success) throw new Error("اكتب الرابط المختصر للعلامة كما يظهر لتأكيد الحذف");
  const db = await createClient();
  const { data, error } = await db.rpc("admin_delete_brand", {
    p_cafe_id: parsed.data.cafeId,
    p_confirmation: parsed.data.confirmation,
  });
  if (error) {
    if (error.message.includes("CONFIRMATION_MISMATCH")) throw new Error("الرابط المختصر غير مطابق لم يتم حذف العلامة");
    throw error;
  }
  const result = z.object({ cafeId: idSchema, slug: z.string().nullable() }).parse(data);
  let completed = false;
  try { completed = await finishBrandDeletion(result.cafeId); } catch { /* Durable job remains visible for retry. */ }
  return { cafeId: result.cafeId, slug: result.slug ?? parsed.data.confirmation, cleanupPending: !completed };
}
