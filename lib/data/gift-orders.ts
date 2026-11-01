import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { giftOrderInputSchema, giftOrderCommandSchema, giftStoreSettingsSchema, type GiftOrder, type GiftStoreSettings, type GiftOrderReceipt, type GiftOrderTracking, type GiftOrderCommandResult } from "@/lib/commerce/gift-orders";
import { z } from "zod";

function failure(error: { message?: string } | null, fallback: string) {
  if (error?.message && /[\u0600-\u06ff]/.test(error.message) && error.message.length < 300) return new Error(error.message);
  return new Error(fallback);
}
async function ownerContext() {
  const cafe = await requireOwnerCafeContext();
  if (cafe.businessCategory !== "gifts_flowers" || !["owner", "manager", "platform_admin"].includes(cafe.role)) throw new Error("لا تملك صلاحية إدارة طلبات هذا المتجر");
  return { cafe, client: await createClient() };
}
export async function getGiftStoreSettings(slug: string): Promise<GiftStoreSettings | null> {
  const normalized = z.string().min(1).max(120).regex(/^[a-z0-9-]+$/).parse(slug);
  const { data, error } = await createAdminClient().rpc("gift_store_config", { p_slug: normalized });
  if (error) throw failure(error, "تعذر تحميل إعدادات الطلبات");
  return data as GiftStoreSettings | null;
}
export async function submitGiftOrder(input: unknown, rateKey: string): Promise<GiftOrderReceipt> {
  const { slug, requestId, ...payload } = giftOrderInputSchema.parse(input);
  const { data, error } = await createAdminClient().rpc("gift_order_submit", { p_slug: slug, p_request: requestId, p_payload: payload, p_rate_key: rateKey });
  if (error) throw failure(error, "تعذر إرسال الطلب حاول مجددًا بنفس الطلب");
  return data as GiftOrderReceipt;
}
export async function trackGiftOrder(input: unknown): Promise<GiftOrderTracking | null> {
  const parsed = z.object({ slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/), trackingToken: z.uuid() }).parse(input);
  const { data, error } = await createAdminClient().rpc("gift_order_track", { p_slug: parsed.slug, p_token: parsed.trackingToken });
  if (error) throw failure(error, "تعذر تحديث حالة الطلب");
  return data as GiftOrderTracking | null;
}
export async function getOwnerGiftOrders(page = 1) {
  const { cafe, client } = await ownerContext();
  const safePage = z.number().int().min(1).max(100000).parse(page);
  const [{ data, error }, settings] = await Promise.all([
    client.from("gift_orders").select("id,number,customer_name,phone,fulfillment,city,address,gift_message,notes,payment_method,status,payment_status,subtotal,delivery_fee,tax,total,vat_rate,tax_inclusive,finance_document_id,created_at,updated_at,gift_order_lines(id,product_id,name,catalog_kind,option_id,selections,quantity,unit_price,line_total)").eq("cafe_id", cafe.id).order("created_at", { ascending: false }).order("id").range((safePage - 1) * 50, safePage * 50),
    getGiftStoreSettings(cafe.slug),
  ]);
  if (error) throw failure(error, "تعذر تحميل طلبات المتجر");
  const orders: GiftOrder[] = (data ?? []).slice(0, 50).map(row => ({
    id: row.id, number: Number(row.number), customerName: row.customer_name, phone: row.phone, fulfillment: row.fulfillment,
    city: row.city, address: row.address, giftMessage: row.gift_message, notes: row.notes, paymentMethod: row.payment_method,
    status: row.status, paymentStatus: row.payment_status, subtotal: Number(row.subtotal), deliveryFee: Number(row.delivery_fee), tax: Number(row.tax), total: Number(row.total),
    vatRate: Number(row.vat_rate), taxInclusive: row.tax_inclusive, financeDocumentId: row.finance_document_id, createdAt: row.created_at, updatedAt: row.updated_at,
    items: (row.gift_order_lines ?? []).map(line => ({ id: line.id, productId: line.product_id, name: line.name, catalogKind: line.catalog_kind, optionId: line.option_id, selections: line.selections, quantity: Number(line.quantity), unitPrice: Number(line.unit_price), lineTotal: Number(line.line_total) })),
  }));
  return { orders, settings, cafe: { id: cafe.id, slug: cafe.slug, name: cafe.name }, page: safePage, hasMore: (data?.length ?? 0) > 50 };
}
export async function updateGiftOrder(input: unknown): Promise<GiftOrderCommandResult> {
  const { id, requestId, action, ...payload } = giftOrderCommandSchema.parse(input);
  const { cafe, client } = await ownerContext();
  const { data, error } = await client.rpc("gift_order_manage", { p_cafe: cafe.id, p_order: id, p_request: requestId, p_action: action, p_payload: payload });
  if (error) throw failure(error, "تعذر تحديث الطلب راجع البيانات وأعد المحاولة");
  return data as GiftOrderCommandResult;
}
export async function saveGiftStoreSettings(input: unknown) {
  const parsed = giftStoreSettingsSchema.parse(input);
  const { cafe, client } = await ownerContext();
  const { error } = await client.rpc("gift_store_settings_save", { p_cafe: cafe.id, p_payload: parsed });
  if (error) throw failure(error, "تعذر حفظ إعدادات التوصيل والدفع");
  return { slug: cafe.slug };
}
