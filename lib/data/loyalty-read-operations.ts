import "server-only";
import { z } from "zod";
import { requireCashierPermission } from "@/lib/data/cashier";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { assertRastLoyaltyEntitlement } from "@/lib/data/rast-loyalty-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import { resolveReadMethod } from "@/lib/loyalty/read-identifier";
import type { LoyaltyReadFilters, LoyaltyReadInput, LoyaltyReadOperation, LoyaltyReadPage, LoyaltyReadScope } from "@/lib/loyalty/read-operation-types";

export class LoyaltyReadError extends Error {
  constructor(public code: string, public retryable = false) { super(code); }
}
const scopeSchema = z.object({ cafeId: z.string().uuid(), cashierId: z.string().uuid() });
const inputSchema = scopeSchema.extend({ requestId: z.string().uuid(), method: z.enum(["code", "phone"]), value: z.string().trim().min(1).max(500), clientCreatedAt: z.string().datetime() });
const operationSchema = z.object({
  requestId: z.string().uuid(), status: z.enum(["pending", "processing", "succeeded", "failed", "needs_review", "duplicate"]),
  identifierHint: z.string(), customerName: z.string().nullable().default(null), cashierName: z.string().default(""),
  availableRewards: z.number().nullable().default(null), rewardIssued: z.boolean().default(false),
  errorCode: z.string().nullable().default(null), retryable: z.boolean().default(false), attempts: z.number().int().nonnegative(),
  createdAt: z.string(), completedAt: z.string().nullable().default(null), cardCreated: z.boolean().optional(), invitationStatus: z.string().nullable().optional(),
});
export function loyaltyReadErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    invalid_identifier: "تحقق من رقم البطاقة أو الجوال", queue_capacity: "طابور المزامنة ممتلئ مؤقتًا ستبقى القراءة محفوظة حتى تتاح المزامنة",
    cashier_disabled: "حساب الكاشير غير مفعّل", brand_disabled: "العلامة التجارية غير مفعّلة", operation_expired: "انتهت مهلة مزامنة القراءة وتحتاج مراجعة الإدارة",
    invalid_input: "تحقق من رقم البطاقة أو الجوال", invalid_phone: "أدخل رقم جوال سعودي صحيح", invalid_code: "رمز البطاقة غير صالح",
    session_invalid: "انتهت جلسة الكاشير سجّل الدخول لإكمال المزامنة", session_scope_changed: "تغيّر حساب الكاشير افتح الحساب الأصلي لمزامنة عملياته",
    request_conflict: "رقم العملية مرتبط بطلب مختلف وتحتاج العملية إلى مراجعة", card_unavailable: "البطاقة غير متاحة لدى العلامة", customer_unavailable: "حساب العميل غير متاح",
    program_disabled: "برنامج الولاء غير متاح حاليًا", permission_denied: "لا تملك صلاحية تنفيذ العملية", cashier_unavailable: "حساب الكاشير غير متاح",
    recent_scan: "قراءة مكررة لم يُضف ختم جديد", duplicate: "قراءة مكررة لم يُضف ختم جديد", rate_limited: "محاولات كثيرة ستتم إعادة المحاولة لاحقًا",
    operation_failed: "تعذر تنفيذ الختم ويمكن إعادة المزامنة", unavailable: "تعذر الاتصال بخدمة المزامنة ستبقى العملية محفوظة",
  };
  return messages[code] ?? "تعذر تنفيذ العملية راجع سبب الفشل أو أعد المحاولة";
}
function operation(raw: unknown): LoyaltyReadOperation {
  const parsed = operationSchema.parse(raw);
  return { ...parsed, errorMessage: parsed.errorCode ? loyaltyReadErrorMessage(parsed.errorCode) : null };
}
function result(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new LoyaltyReadError("unavailable", true);
  return raw as Record<string, unknown>;
}
async function cashierScope(expected: LoyaltyReadScope) {
  const scope = scopeSchema.parse(expected);
  const session = await requireCashierPermission("loyalty");
  if (session.cafeId !== scope.cafeId || session.cashierId !== scope.cashierId) throw new LoyaltyReadError("session_scope_changed");
  return session;
}
export async function enqueueLoyaltyRead(input: LoyaltyReadInput) {
  const parsed = inputSchema.parse(input), session = await cashierScope(parsed);
  const method = resolveReadMethod(parsed.method, parsed.value);
  const digits = parsed.value.replace(/[٠-٩۰-۹]/g, x => String(x.charCodeAt(0) - (x >= "۰" ? 1776 : 1632)));
  let value: string;
  if (method === "phone") {
    const phone = /^[+\d\s()-]+$/.test(digits) ? normalizeSaudiPhone(digits) : null;
    if (!phone) throw new LoyaltyReadError("invalid_phone");
    value = phone;
  } else {
    value = parseBarndaksaQrPayload(digits, "loyalty-card") ?? digits.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{4,100}$/.test(value)) throw new LoyaltyReadError("invalid_code");
  }
  const { data, error } = await createAdminClient().rpc("enqueue_loyalty_read", {
    p_session_token: session.token, p_expected_cafe_id: session.cafeId, p_expected_cashier_id: session.cashierId,
    p_request_id: parsed.requestId, p_method: method, p_value: value, p_client_created_at: parsed.clientCreatedAt,
  });
  if (error) throw new LoyaltyReadError("unavailable", true);
  const response = result(data);
  if (response.ok !== true) throw new LoyaltyReadError(String(response.errorCode ?? "unavailable"), response.retryable === true);
  return operation(response.operation);
}
export async function getCashierLoyaltyReads(requestIds: string[], expected: LoyaltyReadScope) {
  const ids = z.array(z.string().uuid()).max(100).parse(requestIds), session = await cashierScope(expected);
  const { data, error } = await createAdminClient().rpc("get_cashier_loyalty_reads", {
    p_session_token: session.token, p_expected_cafe_id: session.cafeId, p_expected_cashier_id: session.cashierId, p_request_ids: ids,
  });
  if (error) throw new LoyaltyReadError("unavailable", true);
  const response = result(data);
  if (response.ok !== true) throw new LoyaltyReadError(String(response.errorCode ?? "unavailable"));
  return z.array(z.unknown()).parse(response.operations).map(operation);
}
async function ownerScope() {
  const cafe = await requireOwnerCafeContext();
  if (!["owner", "manager", "platform_admin"].includes(cafe.role)) throw new LoyaltyReadError("permission_denied");
  await assertRastLoyaltyEntitlement(cafe.id);
  return cafe;
}
export async function getOwnerLoyaltyReads(input: LoyaltyReadFilters = {}): Promise<LoyaltyReadPage> {
  const filters = z.object({ page: z.number().int().min(1).max(10000).default(1), status: z.enum(["all", "pending", "processing", "succeeded", "failed", "needs_review", "duplicate"]).default("all") }).parse(input);
  const cafe = await ownerScope();
  const { data, error } = await (await createClient()).rpc("get_owner_loyalty_reads", { p_cafe_id: cafe.id, p_page: filters.page, p_status: filters.status === "all" ? null : filters.status });
  if (error) throw new LoyaltyReadError("unavailable", true);
  const response = result(data), summary = result(response.summary ?? {});
  return { items: z.array(z.unknown()).parse(response.operations).map(operation), total: z.number().parse(response.total), page: filters.page, pageSize: 25,
    counts: { pending: Number(summary.pending ?? 0), processing: Number(summary.processing ?? 0), succeeded: Number(summary.succeeded ?? 0), failed: Number(summary.failed ?? 0), needs_review: Number(summary.needs_review ?? 0), duplicate: Number(summary.duplicate ?? 0), retryable: Number(summary.retryable ?? 0) } };
}
export async function retryOwnerLoyaltyReads(requestIds?: string[]) {
  const ids = requestIds ? z.array(z.string().uuid()).max(100).parse(requestIds) : null, cafe = await ownerScope();
  const { data, error } = await (await createClient()).rpc("retry_owner_loyalty_reads", { p_cafe_id: cafe.id, p_request_ids: ids });
  if (error) throw new LoyaltyReadError("unavailable", true);
  const response = result(data);
  return { retried: z.number().int().nonnegative().parse(response.retried), cafeId: cafe.id };
}
export async function processLoyaltyReads(options: { cafeId?: string; requestIds?: string[]; limit?: number } = {}) {
  const { data, error } = await createAdminClient().rpc("process_loyalty_reads", { p_limit: Math.min(50, Math.max(1, options.limit ?? 10)), p_cafe_id: options.cafeId ?? null, p_request_ids: options.requestIds ?? null });
  if (error) throw new LoyaltyReadError("unavailable", true);
  return result(data);
}
