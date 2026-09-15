import { createClient } from "@/lib/supabase/server";

import { getCafeBySlug, getOwnerCafeContext } from "@/lib/data/cafes";

import type { CafePurchasedDomain } from "@/lib/platform/domain-purchase";

export async function requireCafeOwnerForSlug(cafeSlug: string) {
  const ctx = await getOwnerCafeContext();
  if (!ctx) throw new Error("Unauthorized");
  if (ctx.slug !== cafeSlug && ctx.role !== "platform_admin") {
    throw new Error("Forbidden: cafe mismatch");
  }
  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) throw new Error("Cafe not found");
  return { ctx, cafe };
}

export async function createDomainOrderRequest(input: {
  cafeSlug: string;
  domain: string;
  tld: string;
  years: number;
  autoRenew: boolean;
}): Promise<CafePurchasedDomain> {
  await requireCafeOwnerForSlug(input.cafeSlug);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const cafe = await getCafeBySlug(input.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const { data: orderId, error } = await supabase.rpc("create_domain_order", {
    p_cafe_id: cafe.id,
    p_domain: input.domain,
    p_tld: input.tld,
    p_years: input.years,
    p_auto_renew: input.autoRenew,
  });

  if (error) throw error;

  const { data: row, error: fetchError } = await supabase
    .from("domain_orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (fetchError) throw fetchError;
  return mapDomainOrderToPurchase(input.cafeSlug, row);
}

function mapDomainOrderToPurchase(
  cafeSlug: string,
  row: Record<string, unknown>
): CafePurchasedDomain {
  const status = row.status as string;
  const purchaseStatus =
    status === "completed"
      ? "purchased"
      : status === "processing"
        ? "purchase_pending"
        : status === "failed"
          ? "failed"
          : "purchase_pending";

  return {
    id: row.id as string,
    cafeSlug,
    domain: row.domain as string,
    tld: row.tld as string,
    years: row.years as number,
    autoRenew: row.auto_renew as boolean,
    price: row.price_estimate != null ? Number(row.price_estimate) : undefined,
    currency: row.currency as string,
    status: purchaseStatus,
    vercelOrderId: (row.provider_order_id as string) ?? undefined,
    createdAt: row.created_at as string,
    errorMessage: (row.error_message as string) ?? undefined,
  };
}
