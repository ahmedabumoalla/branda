import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { getStandaloneMenu } from "@/lib/data/standalone-menu";
import { hospitalOrderInputSchema, hospitalCounterInputSchema, hospitalCommandSchema, hospitalCollectionSchema, type HospitalOrder, type HospitalOrderReceipt, type HospitalOrderCommandResult, type HospitalDebtor } from "@/lib/commerce/hospital-orders";

function failure(error: { message?: string } | null): never {
  const known = error?.message?.match(/HOSPITAL_[A-Z_]+/)?.[0];
  throw new Error(known || "HOSPITAL_RETRY");
}
export async function submitHospitalOrder(input: unknown, rateKey: string): Promise<HospitalOrderReceipt> {
  const { slug, requestId, ...payload } = hospitalOrderInputSchema.parse(input);
  const { data, error } = await createAdminClient().rpc("hospital_order_submit", { p_slug: slug, p_request: requestId, p_payload: payload, p_rate_key: rateKey });
  if (error) failure(error); return data as HospitalOrderReceipt;
}
export async function readHospitalOrders(slug: string): Promise<HospitalOrder[]> {
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("hospital_orders_read", { p_cafe: cafe.id });
  if (error) failure(error); return data as HospitalOrder[];
}
export async function createHospitalCounterOrder(slug: string, input: unknown): Promise<HospitalOrder> {
  const { requestId, ...payload } = hospitalCounterInputSchema.parse(input);
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
  const { id, requestId, action, ...payload } = hospitalCommandSchema.parse(input);
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
  const { requestId, ...payload } = hospitalCollectionSchema.parse(input);
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("hospital_debt_collect", { p_cafe: cafe.id, p_request: requestId, p_payload: payload });
  if (error) failure(error);
  return data as { partyId: string; amount: number; balance: number; receipts: { id: string; number: number; amount: number }[]; duplicate?: boolean };
}
export function hospitalErrorCode(error: unknown) { return error instanceof z.ZodError ? "HOSPITAL_INVALID_INPUT" : error instanceof Error && /^HOSPITAL_[A-Z_]+$/.test(error.message) ? error.message : "HOSPITAL_RETRY"; }
