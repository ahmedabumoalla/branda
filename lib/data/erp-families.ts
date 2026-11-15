import "server-only";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import type { FamilySnapshot } from "@/lib/erp/families";

export function familiesError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "40001") throw new Error("تغيرت بيانات الأسرة أعد تحميل الصفحة قبل الحفظ");
  if (error.message && error.message.length < 300 && /[؀-ۿ]/.test(error.message)) throw new Error(error.message);
  if (error.code === "42501") throw new Error("لا تملك صلاحية الأسر المنتجة");
  throw new Error("تعذر إكمال عملية الأسر المنتجة");
}

export async function readFamilies(slug?: string): Promise<FamilySnapshot> {
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("erp_family_read", { p_cafe: cafe.id });
  familiesError(error);
  if (!data || !Array.isArray(data.families) || !Array.isArray(data.items)) throw new Error("تعذر تحميل الأسر المنتجة");
  return { ...data, slug: cafe.slug, brand: cafe.name } as FamilySnapshot;
}
