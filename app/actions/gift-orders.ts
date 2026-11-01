"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSupabaseServiceRoleKey } from "@/lib/barndaksa/env";
import { getOwnerGiftOrders, saveGiftStoreSettings, submitGiftOrder, trackGiftOrder, updateGiftOrder } from "@/lib/data/gift-orders";

function safeError(error: unknown) {
  return error instanceof Error && /[\u0600-\u06ff]/.test(error.message) && error.message.length < 300 ? error.message : "راجع البيانات وحاول مرة أخرى";
}
async function requestRateKey() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("x-forwarded-host")?.split(",")[0].trim() || requestHeaders.get("host");
  if (!origin || !host || new URL(origin).host !== host || !/^https?:\/\//.test(origin)) throw new Error("أعد فتح صفحة المتجر لإرسال الطلب");
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0].trim() || requestHeaders.get("x-real-ip") || "unknown";
  return createHmac("sha256", getSupabaseServiceRoleKey()).update(`gift-order:${ip}`).digest("hex");
}
export async function submitGiftOrderAction(input: unknown) {
  try { const order = await submitGiftOrder(input, await requestRateKey()); return { ok: true as const, order }; }
  catch (error) { return { ok: false as const, error: safeError(error) }; }
}
export async function trackGiftOrderAction(input: unknown) {
  try { const order = await trackGiftOrder(input); return order ? { ok: true as const, order } : { ok: false as const, error: "لم نجد طلبًا بهذا الرابط تأكد من رابط المتابعة" }; }
  catch (error) { return { ok: false as const, error: safeError(error) }; }
}
export async function fetchOwnerGiftOrdersAction(page = 1) {
  try { return { ok: true as const, ...(await getOwnerGiftOrders(page)) }; }
  catch (error) { return { ok: false as const, error: safeError(error) }; }
}
export async function updateGiftOrderAction(input: unknown) {
  try { const order = await updateGiftOrder(input); revalidatePath("/dashboard/orders"); revalidatePath("/dashboard/finance"); return { ok: true as const, order }; }
  catch (error) { return { ok: false as const, error: safeError(error) }; }
}
export async function saveGiftStoreSettingsAction(input: unknown) {
  try { const { slug } = await saveGiftStoreSettings(input); revalidatePath("/dashboard/orders"); revalidatePath(`/menu/${slug}`); return { ok: true as const }; }
  catch (error) { return { ok: false as const, error: safeError(error) }; }
}
