import "server-only";
import { z } from "zod";
import { getBrandFinanceContext } from "./brand-finance";
import { normalizePosCustomerPhone, type FinancePosCustomer } from "@/lib/finance/pos-customer";
import type { PagerFilter, PagerOrder, PagerPage } from "@/lib/pager/types";

const filterSchema = z.object({
  page: z.number().int().min(0).max(100000).default(0),
  status: z.enum(["all", "active", "waiting", "ready", "received", "cancelled"]).default("active"),
  query: z.string().trim().max(120).default(""),
}).strict();
const lookupSchema = z.object({
  phone: z.string().regex(/^9665\d{8}$/), loyaltyEnabled: z.boolean(), pagerEnabled: z.boolean(), member: z.boolean(),
  customerName: z.string().nullish(), stampsInCycle: z.number().int().nonnegative().default(0), purchasesRequired: z.number().int().nonnegative().nullish(),
  rewards: z.array(z.object({ id: z.uuid(), title: z.string(), expiresAt: z.string().nullable().optional() })),
});

function mapOrder(row: Record<string, unknown>): PagerOrder {
  return { id: String(row.id), cafeId: String(row.cafe_id), invoiceNumber: String(row.invoice_number), phone: String(row.phone),
    status: row.status as PagerOrder["status"], createdAt: String(row.created_at), readyAt: row.ready_at as string | null,
    receivedAt: row.received_at as string | null, createdBy: String(row.created_by), createdStation: String(row.created_station),
    calledBy: row.called_by as string | null, calledStation: row.called_station as string | null,
    rating: row.rating == null ? null : Number(row.rating), notes: String(row.notes ?? ""), ratedAt: row.rated_at as string | null,
    messageStatus: row.message_status as PagerOrder["messageStatus"], lastMessageAt: row.last_message_at as string | null,
    messageCount: Number(row.message_count ?? 0) };
}

export async function getFinancePosCustomer(input: unknown, slug?: string): Promise<FinancePosCustomer> {
  const phone = typeof input === "string" ? normalizePosCustomerPhone(input) : null;
  if (!phone) throw new Error("أدخل رقم جوال سعودي صحيح");
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("brand_finance_pos_customer", { p_cafe_id: cafe.id, p_phone: phone });
  const parsed = lookupSchema.safeParse(data);
  if (error || !parsed.success || parsed.data.phone !== phone) throw new Error("تعذر التحقق من ولاء العميل حاول مجددًا");
  const result = parsed.data;
  return { phone, pagerEnabled: result.pagerEnabled, loyaltyEnabled: result.loyaltyEnabled, rewards: result.rewards,
    member: result.member ? { name: result.customerName ?? "عميل الولاء", stampsInCycle: result.stampsInCycle,
      targetStamps: result.purchasesRequired ?? 0, rewardsReady: result.rewards.length } : null };
}

export async function getFinancePosPager(input: PagerFilter = {}, slug?: string): Promise<PagerPage> {
  const filter = filterSchema.safeParse(input);
  if (!filter.success) throw new Error("راجع خيارات البحث عن طلبات البيجر");
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("brand_finance_pos_pager_page", {
    p_cafe_id: cafe.id, p_page: filter.data.page, p_status: filter.data.status, p_query: filter.data.query,
  });
  if (error || !data || !Array.isArray(data.orders) || !Number.isSafeInteger(data.total)) throw new Error("تعذر تحميل طلبات البيجر حاول مجددًا");
  return { ...data, orders: data.orders.map(mapOrder) } as PagerPage;
}

export async function transitionFinancePosPager(orderId: string, status: "ready" | "received" | "cancelled", slug?: string): Promise<PagerOrder> {
  const parsed = z.object({ orderId: z.uuid(), status: z.enum(["ready", "received", "cancelled"]) }).safeParse({ orderId, status });
  if (!parsed.success) throw new Error("اختر طلب البيجر والإجراء الصحيح");
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("brand_finance_pos_pager_transition", {
    p_cafe_id: cafe.id, p_order_id: parsed.data.orderId, p_status: parsed.data.status,
  });
  if (error || !data || data.id !== orderId || data.cafe_id !== cafe.id) throw new Error("تعذر تحديث طلب البيجر حدث القائمة ثم حاول مجددًا");
  return mapOrder(data);
}
