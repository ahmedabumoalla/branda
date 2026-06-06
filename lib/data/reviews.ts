import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { assertCustomerIdMatchesSession } from "@/lib/data/customers";
import type { CafeReview } from "@/lib/mock/reviews";

function mapDbReview(slug: string, row: Record<string, unknown>): CafeReview {
  return {
    id: row.id as string,
    cafeSlug: slug,
    productId: (row.product_id as string) ?? "",
    productName: (row.product_name as string) ?? "منتج",
    customerId: (row.customer_id as string) ?? "",
    customerName: row.customer_name as string,
    rating: row.rating as number,
    comment: (row.comment as string) ?? "",
    answer: (row.owner_reply as string) ?? undefined,
    status: row.owner_reply ? "ظاهر" : "بانتظار الرد",
    createdAt: (row.created_at as string).slice(0, 10),
  };
}

export async function getOwnerReviews(): Promise<CafeReview[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("*, menu_products(name)")
    .eq("cafe_id", cafe.id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const product = row.menu_products as { name: string } | null;
    return mapDbReview(cafe.slug, {
      ...row,
      product_name: product?.name,
    });
  });
}

export async function getPublicReviewsByProduct(
  slug: string,
  productId: string
): Promise<CafeReview[]> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => mapDbReview(slug, row));
}

const reviewSchema = z.object({
  cafeSlug: z.string(),
  productId: z.string().uuid(),
  customerId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string(),
});

export async function createReview(input: z.infer<typeof reviewSchema>) {
  const parsed = reviewSchema.parse(input);
  await assertCustomerIdMatchesSession(parsed.cafeSlug, parsed.customerId);
  const cafe = await getCafeBySlug(parsed.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const supabase = await createClient();
  const { data: reviewId, error } = await supabase.rpc("create_customer_review", {
    p_cafe_id: cafe.id,
    p_product_id: parsed.productId,
    p_rating: parsed.rating,
    p_comment: parsed.comment.trim() || null,
  });

  if (error) throw error;

  const { data } = await supabase
    .from("reviews")
    .select("*, menu_products(name)")
    .eq("id", reviewId)
    .single();

  if (!data) throw new Error("Review not found after create");
  const product = data.menu_products as { name: string } | null;
  return mapDbReview(parsed.cafeSlug, {
    ...data,
    product_name: product?.name,
  });
}

export async function replyToReview(reviewId: string, ownerReply: string) {
  await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_review_owner_reply", {
    p_review_id: reviewId,
    p_owner_reply: ownerReply,
  });
  if (error) throw error;
}
