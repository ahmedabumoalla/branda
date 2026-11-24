import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { walletLinksSchema, type WalletLinksState } from "@/lib/loyalty/wallet-links";

const missingSchema = (code: string) => ["42P01", "PGRST205", "PGRST202", "42883"].includes(code);
/** Internal: cafeId must come from an authorized owner context or validated card view. */
export async function getWalletLinks(cafeId: string): Promise<WalletLinksState> {
  const { data, error } = await createAdminClient().from("cafe_wallet_links").select("links").eq("cafe_id", cafeId).maybeSingle();
  if (error && missingSchema(error.code)) return { available: false, links: [] };
  if (error) throw new Error("تعذر تحميل روابط البطاقة");
  return { available: true, links: walletLinksSchema.parse(data?.links ?? []) };
}

export async function getOwnerWalletLinks(): Promise<WalletLinksState> {
  const cafe = await requireOwnerCafeContext();
  if (cafe.role !== "owner" && cafe.role !== "platform_admin") throw new Error("غير مسموح بتعديل روابط البطاقة");
  return getWalletLinks(cafe.id);
}

export async function saveOwnerWalletLinks(input: unknown) {
  const [cafe, features] = await Promise.all([requireOwnerCafeContext(), getOwnerFeatureCodes()]);
  if ((cafe.role !== "owner" && cafe.role !== "platform_admin") || !featureCodesAllow(features, "loyalty")) {
    return { ok: false as const, message: "غير مسموح بتعديل روابط البطاقة لهذا الحساب" };
  }
  const parsed = walletLinksSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0].message };
  const { data, error } = await (await createClient()).rpc("save_cafe_wallet_links", { p_cafe: cafe.id, p_links: parsed.data });
  if (error) return { ok: false as const, message: missingSchema(error.code)
    ? "حفظ روابط البطاقة غير متاح حتى اكتمال تفعيل الميزة"
    : "تعذر حفظ روابط البطاقة حاول مرة أخرى" };
  const saved = walletLinksSchema.safeParse(data);
  if (!saved.success) return { ok: false as const, message: "تعذر تأكيد حفظ روابط البطاقة حدّث الصفحة" };
  return { ok: true as const, links: saved.data };
}
