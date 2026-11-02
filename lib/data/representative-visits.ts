import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/data/cafes";
export async function getRepresentativeVisits(page = 1) {
  await requirePlatformAdmin();
  const safePage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
  const admin = createAdminClient();
  const result = await admin.from("representative_visits").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id").range((safePage - 1) * 20, safePage * 20 - 1);
  if (result.error) throw new Error("تعذر تحميل سجل الزيارات");
  const visits = await Promise.all((result.data ?? []).map(async row => {
    const paths = [row.photo_path, row.menu_photo_path].filter((value): value is string => typeof value === "string" && Boolean(value));
    const signed = await admin.storage.from("representative-visits").createSignedUrls(paths, 900);
    const media = new Map((signed.data ?? []).map(item => [item.path, item.signedUrl]));
    return { id: String(row.id), brandName: String(row.brand_name), representativeName: String(row.representative_name), managerPhone: String(row.manager_phone), ownerPhone: String(row.owner_phone),
      interest: String(row.interest), services: row.services as string[], otherService: String(row.other_service), createdAt: String(row.created_at),
      mapsUrl: row.maps_url || `https://www.google.com/maps?q=${row.latitude},${row.longitude}`,
      photo: media.get(row.photo_path) ?? null, menuPhoto: media.get(row.menu_photo_path) ?? null };
  }));
  return { visits, count: result.count ?? 0, page: safePage };
}
