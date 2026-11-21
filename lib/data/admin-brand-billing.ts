import "server-only";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { isCurrentSubscription } from "@/lib/platform/active-subscription";
import { createClient } from "@/lib/supabase/server";

export type AdminBrandBillingRow = {
  id: string;
  planName: string;
  state: string;
  /** Part of the packages the brand runs on now, including a prepared trial */
  current: boolean;
  /** Price recorded on the subscription itself */
  amount: number;
  baseAmount: number | null;
  discount: number;
  listPrice: number | null;
  duration: string;
  method: string | null;
  paidAt: string | null;
  startedAt: string | null;
  expiresAt: string | null;
};
export type AdminBrandBilling = { rows: AdminBrandBillingRow[]; currentTotal: number; currentCount: number };

const COLUMNS = "id,plan_id,status,activation_source,amount_sar,base_amount_sar,discount_amount_sar,payment_method_label,paid_at,started_at,expires_at,created_at,plan_name_snapshot,duration_unit,duration_count,platform_plans(active,name,price_sar)";
const units: Record<string, [string, string, string]> = { day: ["يوم", "يومان", "أيام"], month: ["شهر", "شهران", "أشهر"], year: ["سنة", "سنتان", "سنوات"] };

function durationLabel(unit: unknown, count: unknown) {
  const forms = units[String(unit)];
  const value = Number(count);
  if (!forms || !Number.isInteger(value) || value < 1) return "";
  return value === 1 ? forms[0] : value === 2 ? forms[1] : `${value} ${value <= 10 ? forms[2] : forms[0]}`;
}

function time(value: unknown) {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function rowState(row: Record<string, unknown>, plan: { active?: boolean | null } | null, now: number): [string, boolean] {
  const status = String(row.status ?? "");
  const trial = status === "trialing";
  if (trial && row.activation_source === "admin_prepared_trial") return ["جاهزة ولم تبدأ التجربة", plan?.active === true];
  if (status === "cancelled") return ["ملغاة", false];
  const end = time(row.expires_at);
  if (status === "expired" || (end !== null && end <= now)) return [trial ? "تجربة منتهية" : "منتهية", false];
  if (["pending", "past_due"].includes(status)) return ["بانتظار التفعيل", false];
  if (isCurrentSubscription({ status, started_at: row.started_at as string | null, expires_at: row.expires_at as string | null, platform_plans: plan }, now)) return [trial ? "في فترة تجربة" : "نشطة", true];
  const start = time(row.started_at);
  return [start !== null && start > now ? "لم تبدأ بعد" : "غير فعالة", false];
}

/** Packages of one brand with the price recorded on each subscription, newest first */
export async function getAdminBrandBilling(cafeId: string): Promise<AdminBrandBilling> {
  await requirePlatformAdmin();
  const id = z.string().uuid().parse(cafeId);
  const client = await createClient();
  const { data, error } = await client.from("subscriptions").select(COLUMNS).eq("cafe_id", id)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(40);
  if (error) throw new Error("تعذر تحميل أسعار اشتراك العلامة حاول مجددًا");
  const now = Date.now();
  const rows = ((data ?? []) as Record<string, unknown>[]).map((row): AdminBrandBillingRow => {
    const related = row.platform_plans as { active?: boolean | null; name?: string | null; price_sar?: number | string | null } | { active?: boolean | null; name?: string | null; price_sar?: number | string | null }[] | null;
    const plan = Array.isArray(related) ? related[0] ?? null : related;
    const [state, current] = rowState(row, plan, now);
    const base = row.base_amount_sar === null || row.base_amount_sar === undefined ? null : Number(row.base_amount_sar);
    const list = plan?.price_sar === null || plan?.price_sar === undefined ? null : Number(plan.price_sar);
    return {
      id: String(row.id), planName: String(row.plan_name_snapshot ?? plan?.name ?? row.plan_id ?? ""), state, current,
      amount: Number(row.amount_sar) || 0, baseAmount: Number.isFinite(base) ? base : null, discount: Number(row.discount_amount_sar) || 0,
      listPrice: Number.isFinite(list) ? list : null, duration: durationLabel(row.duration_unit, row.duration_count),
      method: row.payment_method_label ? String(row.payment_method_label) : null, paidAt: row.paid_at ? String(row.paid_at) : null,
      startedAt: row.started_at ? String(row.started_at) : null, expiresAt: row.expires_at ? String(row.expires_at) : null,
    };
  });
  const current = rows.filter(row => row.current);
  return { rows, currentTotal: Math.round(current.reduce((sum, row) => sum + row.amount, 0) * 100) / 100, currentCount: current.length };
}
