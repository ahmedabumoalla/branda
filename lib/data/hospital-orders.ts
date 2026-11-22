import { getBrandPhoneCountryBySlug } from "@/lib/data/brand-phone-country";
import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { getStandaloneMenu } from "@/lib/data/standalone-menu";
import type { FinanceDocument } from "@/lib/finance/brand-finance";
import { hospitalOrderInputFor, hospitalCounterInputFor, hospitalCommandFor, hospitalCollectionSchema, type HospitalOrder, type HospitalOrderReceipt, type HospitalOrderCommandResult, type HospitalDebtor } from "@/lib/commerce/hospital-orders";

function failure(error: { message?: string } | null): never {
  const known = error?.message?.match(/HOSPITAL_[A-Z_]+/)?.[0];
  throw new Error(known || "HOSPITAL_RETRY");
}
/** Development may use the platform database only after explicit server-side opt-in. */
export function assertHospitalWriteEnvironment() {
  let local = false;
  try { local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname); } catch { /* Invalid configuration stays closed. */ }
  const production = process.env.NODE_ENV === "production" && process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";
  const connectedDevelopment = process.env.NODE_ENV === "development" && process.env.VERCEL !== "1" && process.env.HOSPITAL_PLATFORM_DATABASE_WRITES === "true";
  if (!local && !production && !connectedDevelopment) throw new Error("HOSPITAL_LOCAL_DATABASE_REQUIRED");
}
export async function submitHospitalOrder(input: unknown, rateKey: string): Promise<HospitalOrderReceipt> {
  assertHospitalWriteEnvironment();
  const { slug, requestId, ...payload } = hospitalOrderInputFor(await getBrandPhoneCountryBySlug(z.object({slug:z.string().min(1).max(120)}).parse(input).slug)).parse(input);
  const { data, error } = await createAdminClient().rpc("hospital_order_submit", { p_slug: slug, p_request: requestId, p_payload: payload, p_rate_key: rateKey });
  if (error) failure(error); return data as HospitalOrderReceipt;
}
export async function readHospitalOrders(slug: string): Promise<HospitalOrder[]> {
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("hospital_orders_read", { p_cafe: cafe.id });
  if (error) failure(error);
  const menu = await getStandaloneMenu(cafe.slug).catch(() => null);
  const photos = new Map(menu?.products.map(product => [product.id, product.images[0]?.url ?? null]));
  return (data as HospitalOrder[]).map(order => ({ ...order, items: order.items.map(item => ({ ...item, imageUrl: photos.get(item.productId) ?? null })) }));
}
export async function createHospitalCounterOrder(slug: string, input: unknown): Promise<HospitalOrder> {
  assertHospitalWriteEnvironment();
  const { requestId, ...payload } = hospitalCounterInputFor(await getBrandPhoneCountryBySlug(slug)).parse(input);
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("hospital_counter_order", { p_cafe: cafe.id, p_request: requestId, p_payload: payload });
  if (error) failure(error); return data as HospitalOrder;
}
export async function readHospitalCatalog(slug: string) {
  const { client, cafe } = await getBrandFinanceContext(slug);
  const allowed = await client.rpc("hospital_access_enabled", { p_cafe: cafe.id });
  if (allowed.error || allowed.data !== true) failure(allowed.error);
  const menu = await getStandaloneMenu(cafe.slug);
  if (!menu) throw new Error("HOSPITAL_UNAVAILABLE");
  return menu;
}
export async function manageHospitalOrder(slug: string, input: unknown): Promise<HospitalOrderCommandResult> {
  assertHospitalWriteEnvironment();
  const { id, requestId, action, ...payload } = hospitalCommandFor(await getBrandPhoneCountryBySlug(slug)).parse(input);
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("hospital_order_manage", { p_cafe: cafe.id, p_order: id, p_request: requestId, p_action: action, p_payload: payload });
  if (error) failure(error); return data as HospitalOrderCommandResult;
}
export async function readHospitalDebts(slug: string): Promise<HospitalDebtor[]> {
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("hospital_debts_read", { p_cafe: cafe.id });
  if (error) failure(error); return data as HospitalDebtor[];
}
export async function collectHospitalDebt(slug: string, input: unknown) {
  assertHospitalWriteEnvironment();
  const { requestId, ...payload } = hospitalCollectionSchema.parse(input);
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("hospital_debt_collect", { p_cafe: cafe.id, p_request: requestId, p_payload: payload });
  if (error) failure(error);
  return data as { partyId: string; amount: number; balance: number; receipts: { id: string; number: number; amount: number }[]; duplicate?: boolean };
}
export async function readHospitalReceipt(slug: string, orderId: string): Promise<FinanceDocument> {
  z.uuid().parse(orderId);
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("hospital_order_receipt", { p_cafe: cafe.id, p_order: orderId });
  if (error) failure(error);
  if (!data) throw new Error("HOSPITAL_NOT_FOUND");
  return data as FinanceDocument;
}
export function hospitalErrorCode(error: unknown) { return error instanceof z.ZodError ? "HOSPITAL_INVALID_INPUT" : error instanceof Error && /^HOSPITAL_[A-Z_]+$/.test(error.message) ? error.message : "HOSPITAL_RETRY"; }
