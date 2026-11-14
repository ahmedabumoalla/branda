import { inventoryImageUrl, isInventoryImagePath } from "@/lib/finance/inventory-catalog";
import "server-only";
import { cache } from "react";
import { getActiveUser } from "@/lib/auth/active-user";
import { getFinanceCashierMaintenance } from "@/lib/data/finance-cashier-maintenance";
import { canFinanceOperation, type FinanceRole } from "@/lib/finance/permissions";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { erpRequestSlug } from "@/lib/erp/request-context";
import { financeProductMedia } from "@/lib/finance/product-media-server";
import type { FinanceCommandResult, FinanceHistory, FinanceProduct, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { getFinanceMaintenanceActor, resetFinanceBalances } from "./finance-shifts";
import { after } from "next/server";
import { dispatchShiftAlerts } from "./finance-shift-alerts";
import { prepareFinancePosCustomerPayload } from "@/lib/finance/pos-customer-server";
import { dispatchFinancePosCustomerMessages } from "./finance-pos-customer-messages";

const commandSchema = z.object({
  operation: z.enum(["opening_balances", "supplier_payout", "shift_purchase", "shift_variance_settle", "finance_reset", "sale", "purchase", "refund", "refund_approve", "refund_reject", "party", "account", "item", "warehouse", "stock_adjust", "stock_transfer", "treasury", "settlement", "shift_open", "shift_close", "shift_handover", "shift_accept", "settings", "staff", "journal"]),
  requestId: z.uuid(), payload: z.record(z.string(), z.unknown()),
});

function throwIfFinanceUnavailable(error: { code?: string } | null) {
  if (error && (!error.code || /^(08|53|57P|PGRST00)/.test(error.code))) {
    const unavailable = new Error("الخدمة غير متاحة مؤقتًا ستستأنف المزامنة تلقائيًا");
    unavailable.name = "FinanceUnavailable";
    throw unavailable;
  }
}

export const getBrandFinanceContext = cache(async (slug?: string) => {
  const client = await createClient();
  const user = await getActiveUser(client);
  if (!user) throw new Error("سجل الدخول للوصول إلى برندة المالية");
  const scopedSlug = slug ?? erpRequestSlug();
  const target = scopedSlug ? z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/).parse(scopedSlug) : (await requireOwnerCafeContext()).slug;
  const { data, error } = await client.rpc("brand_finance_context", { p_slug: target });
  throwIfFinanceUnavailable(error);
  if (error) throw new Error("لا تملك صلاحية المالية لهذه العلامة أو أن الباقة غير مفعلة");
  // The database checks the audited session; the web additionally checks its signed cookie.
  if (data?.maintenance && !await getFinanceCashierMaintenance(data.id)) {
    throw new Error("انتهت جلسة الصيانة افتح صيانة العلامة مجددًا");
  }
  return { client, cafe: data as { id: string; name: string; slug: string; role: FinanceRole; businessCategory?: string } };
});

export async function getBrandFinanceSnapshot(slug?: string): Promise<FinanceSnapshot> {
  return readBrandFinanceSnapshot(await getBrandFinanceContext(slug));
}

/** Reuse authority only within the same server request, never from a client payload. */
export async function readBrandFinanceSnapshot({ client, cafe }: Awaited<ReturnType<typeof getBrandFinanceContext>>): Promise<FinanceSnapshot> {
  const { data, error } = await client.rpc("brand_finance_snapshot", { p_cafe_id: cafe.id });
  if (error) throw new Error("تعذر تحميل المالية حاول مجددا");
  const snapshot = data as FinanceSnapshot;
  const [cashierMaintenance, resetActor, products] = await Promise.all([
    snapshot.canAdminister ? Promise.resolve(null) : getFinanceCashierMaintenance(cafe.id),
    getFinanceMaintenanceActor(cafe.id),
    financeProductMedia(cafe, snapshot.products as (FinanceProduct & { imageStoragePath?: string | null })[]),
  ]);
  snapshot.canManageCashiers = snapshot.canAdminister || !!cashierMaintenance;
  snapshot.items = snapshot.items.map(item => ({ ...item, imageUrl: isInventoryImagePath(item.image_path, cafe.id) ? inventoryImageUrl(item.image_path, cafe.slug) : null }));
  snapshot.canResetBalances = !!resetActor;
  snapshot.products = products;
  return snapshot;
}

export async function executeBrandFinanceCommand(input: unknown, slug?: string): Promise<FinanceCommandResult> {
  const command = commandSchema.parse(input);
  if (JSON.stringify(command.payload).length > 100_000) throw new Error("بيانات العملية أكبر من الحد المسموح");
  if (command.operation === "party" && command.payload.kind === "customer") {
    const phone = typeof command.payload.phone === "string" ? command.payload.phone.trim() : "";
    if (!phone) throw new Error("أدخل رقم جوال العميل");
    if (phone.length > 30) throw new Error("رقم الجوال يجب ألا يتجاوز ٣٠ حرفًا");
    command.payload.phone = phone;
  }
  const { client, cafe } = await getBrandFinanceContext(slug);
  if (command.operation === "staff" && cafe.role !== "owner") {
    const maintenance = await getFinanceCashierMaintenance(cafe.id);
    if (!maintenance) throw new Error("إدارة الكاشير تتطلب صلاحية المالك أو جلسة صيانة سارية");
    const payload = z.object({ userId: z.uuid(), name: z.string().trim().min(2).max(100), role: z.literal("cashier"), active: z.boolean() }).parse(command.payload);
    const result = await maintenance.execute("update", payload);
    if (result.error || !result.data?.id) throw new Error("تعذر تعديل الكاشير تحقق من جلسة الصيانة وحاول مجددًا");
    return result.data as FinanceCommandResult;
  }
  if (!canFinanceOperation(cafe.role, command.operation)) throw new Error("لا تملك صلاحية تنفيذ هذه العملية");
  if (command.operation === "finance_reset") return resetFinanceBalances(cafe.id, command.payload, command.requestId);
  const butcherSale = command.operation === "sale" && cafe.businessCategory === "butcher_shops";
  if (butcherSale) {
    // This category never enrolls, stamps, pages or messages a customer at checkout
    delete command.payload.customerPhone;
    delete command.payload.redeemRewardId;
    delete command.payload.pagerFeedbackHash;
  } else if (command.operation === "sale") prepareFinancePosCustomerPayload(command.payload, command.requestId);
  const customerDetails = command.operation === "party" && command.payload.kind === "customer" && Object.hasOwn(command.payload, "details");
  const { data, error } = customerDetails
    ? await client.rpc("brand_finance_save_customer", { p_cafe_id: cafe.id, p_payload: command.payload, p_request_id: command.requestId })
    : await client.rpc("brand_finance_execute", { p_cafe_id: cafe.id, p_operation: command.operation, p_payload: command.payload, p_request_id: command.requestId });
  if (error) {
    throwIfFinanceUnavailable(error);
    if (command.operation === "shift_open" && error.code === "23505") {
      if (error.message.includes('"bf_one_live_drawer"')) {
        throw new Error("الصندوق مرتبط بوردية مفتوحة أو بانتظار التسليم يجب على صاحب الوردية تسليمها لك أو إقفالها قبل بدء وردية جديدة أو اختر صندوقًا آخر");
      }
      if (error.message.includes('"bf_one_live_shift"')) {
        throw new Error("لديك وردية مفتوحة أو بانتظار التسليم حدث الصفحة وأكمل ورديتك الحالية قبل بدء وردية جديدة");
      }
    }
    if (/[\u0600-\u06ff]/.test(error.message) && error.message.length < 300) throw new Error(error.message);
    if (error.code === "42501") throw new Error("لا تملك صلاحية تنفيذ هذه العملية");
    throw new Error("لم تحفظ العملية راجع البيانات والأرصدة ثم أعد المحاولة بنفس الطلب");
  }
  if (["shift_open", "shift_close", "shift_handover", "shift_accept"].includes(command.operation)) {
    after(async () => { try { await dispatchShiftAlerts(cafe.id); } catch { /* Persisted outbox remains available to the scheduled worker */ } });
  }
  if (command.operation === "sale" && !butcherSale && command.payload.customerPhone) {
    after(async () => { try { await dispatchFinancePosCustomerMessages(cafe.id); } catch { /* Committed customer outbox is retried by the scheduled worker */ } });
  }
  return data as FinanceCommandResult;
}

export async function getBrandFinanceHistory(kind: unknown, offset: unknown, slug?: string): Promise<FinanceHistory> {
  const parsedKind = z.enum(["documents", "journal", "movements"]).parse(kind);
  const parsedOffset = z.number().int().min(0).max(10_000_000).parse(offset);
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("brand_finance_history", { p_cafe_id: cafe.id, p_kind: parsedKind, p_offset: parsedOffset });
  if (error) throw new Error("تعذر تحميل السجل المالي حاول مجددا");
  return data as FinanceHistory;
}
