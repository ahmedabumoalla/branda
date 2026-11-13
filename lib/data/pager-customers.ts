import "server-only";
import { z } from "zod";
import { requireOwnerCafeContext, requirePlatformAdmin } from "@/lib/data/cafes";
import { getOwnerPagerContext } from "@/lib/data/pager";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeGoogleReviewLink } from "@/lib/pager/google-review-link";
import type { PagerBrand, PagerCustomer, PagerDirectoryFilters, PagerReview, PagerReviewFilters, PagerSlice, PagerVisit } from "@/lib/pager/customer-types";

const page = z.number().int().min(0).max(100000).default(0);
const query = z.string().trim().max(120).default("");
const directorySchema = z.object({ cafeId: z.uuid().optional(), phone: z.string().regex(/^9665[0-9]{8}$/).optional(), query, page });

export async function getPagerCustomerDirectory(input: PagerDirectoryFilters) {
  await requirePlatformAdmin();
  const filters = directorySchema.parse(input);
  if (filters.phone && !filters.cafeId) throw new Error("العلامة مطلوبة لعرض سجل العميل");
  const db = createAdminClient();
  const { data, error } = await db.rpc("pager_customer_directory", { p_cafe: filters.cafeId ?? null, p_phone: filters.phone ?? null, p_query: filters.query, p_page: filters.page });
  if (error) throw new Error("تعذر تحميل عملاء البيجر حاول مجددًا");
  let brandName = "";
  if (filters.cafeId) {
    const brand = await db.from("cafes").select("name").eq("id", filters.cafeId).maybeSingle();
    if (brand.error || !brand.data) throw new Error("تعذر تحميل العلامة");
    brandName = brand.data.name;
  }
  return { ...data, brandName } as PagerSlice<PagerBrand | PagerCustomer | PagerVisit> & { brandName: string };
}

export async function getOwnerPagerReviews(input: PagerReviewFilters = {}) {
  const context = await getOwnerPagerContext();
  const filters = z.object({ query, page, rating: z.number().int().min(1).max(5).optional() }).parse(input);
  const db = createAdminClient();
  const [reviews, settings, cafe] = await Promise.all([
    db.rpc("pager_reviews_page", { p_cafe: context.cafeId, p_query: filters.query, p_rating: filters.rating ?? null, p_page: filters.page }),
    db.from("pager_brand_settings").select("google_review_url").eq("cafe_id", context.cafeId).maybeSingle(),
    requireOwnerCafeContext(),
  ]);
  if (reviews.error || settings.error) throw new Error("تعذر تحميل تقييمات البيجر حاول مجددًا");
  return { ...(reviews.data as PagerSlice<PagerReview> & { average: number | null }), brandName: context.cafeName,
    googleReviewUrl: normalizeGoogleReviewLink(settings.data?.google_review_url ?? "") ?? "",
    canManage: cafe.role === "owner" || cafe.role === "platform_admin" };
}

export async function savePagerGoogleReviewLink(value: string) {
  const cafe = await requireOwnerCafeContext();
  if (cafe.role !== "owner" && cafe.role !== "platform_admin") throw new Error("تعديل الرابط متاح لمالك العلامة");
  const context = await getOwnerPagerContext();
  if (context.cafeId !== cafe.id) throw new Error("تغير حساب العلامة أعد المحاولة");
  const url = normalizeGoogleReviewLink(z.string().max(2048).parse(value));
  if (url === null) throw new Error("أدخل رابط كتابة تقييم جوجل من خيار الحصول على مزيد من المراجعات في ملف نشاطك التجاري");
  const { error } = await createAdminClient().from("pager_brand_settings").upsert({ cafe_id: cafe.id, google_review_url: url }, { onConflict: "cafe_id" });
  if (error) throw new Error("تعذر حفظ رابط التقييم حاول مجددًا");
  return url;
}
