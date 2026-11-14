"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { getSupabaseServiceRoleKey } from "@/lib/barndaksa/env";
import { submitHospitalOrder, readHospitalOrders, createHospitalCounterOrder, readHospitalCatalog, manageHospitalOrder, readHospitalDebts, collectHospitalDebt, hospitalErrorCode } from "@/lib/data/hospital-orders";

function errorResult(error: unknown, en = false) {
  const code = hospitalErrorCode(error);
  const text: Record<string, [string, string]> = {
    HOSPITAL_INVALID_INPUT: ["راجع الاسم والجوال والدور والعيادة وبيانات الطلب", "Check your name, phone, floor, clinic and order details"],
    HOSPITAL_RATE_LIMIT: ["انتظر قليلًا قبل إرسال طلب جديد", "Please wait before placing another order"],
    HOSPITAL_UNAVAILABLE: ["الطلبات غير متاحة حاليًا", "Ordering is currently unavailable"],
    HOSPITAL_PRODUCT_UNAVAILABLE: ["أحد المنتجات لم يعد متاحًا حدّث المنيو", "An item is no longer available, refresh the menu"],
    HOSPITAL_CHOOSE_OPTION: ["حدد خيار المنتج قبل إرسال الطلب", "Select the product option before ordering"],
    HOSPITAL_CONFIRM_PRICES: ["أكد أسعار المنتجات ضمن النطاق المعروض", "Confirm each item price within its displayed range"],
    HOSPITAL_DEBTOR_REQUIRED: ["حدد العيادة أو الطبيب المسؤول عن المديونية", "Select the clinic or doctor responsible for the balance"],
    HOSPITAL_SHIFT_REQUIRED: ["افتح ورديتك واختر صندوقها للتحصيل", "Open your shift and select its cash drawer"],
    HOSPITAL_OVERPAYMENT: ["مبلغ التحصيل يتجاوز المديونية الحالية", "Collection exceeds the current outstanding balance"],
    HOSPITAL_REQUEST_CHANGED: ["تغيّرت بيانات المحاولة حدّث الطلب قبل إعادة الإرسال", "The request changed, refresh it before retrying"],
    HOSPITAL_ALREADY_INVOICED: ["الطلب مفوتر أو مغلق حدّث قائمة الطلبات", "The order is already invoiced or closed, refresh orders"],
    HOSPITAL_INVALID_STATE: ["الإجراء غير متاح للحالة الحالية حدّث الطلب", "This action is unavailable for the current status, refresh the order"],
    HOSPITAL_PERIOD_CLOSED: ["الفترة المحاسبية مقفلة", "The accounting period is closed"],
    HOSPITAL_TAX_CHANGED: ["تغيّرت إعدادات الضريبة أعد إنشاء الطلب بالأسعار الحالية", "Tax settings changed, recreate the order using current prices"],
    HOSPITAL_INVALID_PAYMENT: ["اختر حساب النقد أو الشبكة الصحيح", "Select the correct cash or card account"],
    HOSPITAL_FORBIDDEN: ["لا تملك صلاحية طلبات المستشفى", "Hospital ordering access is not available for this account"],
  };
  return { ok: false as const, code, error: text[code]?.[en ? 1 : 0] ?? (en ? "Unable to confirm this operation, retry the same request" : "تعذر تأكيد العملية أعد المحاولة بنفس الطلب") };
}
async function rateKey() {
  const h = await headers(); const origin = h.get("origin"), host = h.get("x-forwarded-host")?.split(",")[0].trim() || h.get("host");
  if (!origin || !host || !/^https?:\/\//.test(origin) || new URL(origin).host !== host) throw new Error("HOSPITAL_INVALID_INPUT");
  const ip = process.env.VERCEL ? h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "local";
  return createHmac("sha256", getSupabaseServiceRoleKey()).update(`hospital-order:${ip}`).digest("hex");
}
export async function submitHospitalOrderAction(input: unknown) {
  try { return { ok: true as const, order: await submitHospitalOrder(input, await rateKey()) }; }
  catch (error) { return errorResult(error, typeof input === "object" && input !== null && "language" in input && input.language === "en"); }
}
export async function readHospitalOrdersAction(slug: string) { try { return { ok: true as const, orders: await readHospitalOrders(slug) }; } catch (e) { return errorResult(e); } }
export async function readHospitalCatalogAction(slug: string) { try { return { ok: true as const, menu: await readHospitalCatalog(slug) }; } catch (e) { return errorResult(e); } }
export async function createHospitalCounterOrderAction(slug: string, input: unknown) { try { return { ok: true as const, order: await createHospitalCounterOrder(slug, input) }; } catch (e) { return errorResult(e); } }
export async function manageHospitalOrderAction(slug: string, input: unknown) { try { return { ok: true as const, order: await manageHospitalOrder(slug, input) }; } catch (e) { return errorResult(e); } }
export async function readHospitalDebtsAction(slug: string) { try { return { ok: true as const, customers: await readHospitalDebts(slug) }; } catch (e) { return errorResult(e); } }
export async function collectHospitalDebtAction(slug: string, input: unknown) { try { return { ok: true as const, collection: await collectHospitalDebt(slug, input) }; } catch (e) { return errorResult(e); } }
