import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";

export type DashboardSummary = {
  todayOrders: number;
  actionOrders: number;
  customers: number;
  activeProducts: number;
  unavailableProducts: number;
};

export type DashboardRecentOrder = {
  id: string;
  customerName: string;
  status: string;
  total: number;
  createdAt: string;
};

function startOfRiyadhDayIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${value.year}-${value.month}-${value.day}T00:00:00+03:00`).toISOString();
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const today = startOfRiyadhDayIso();

  const [todayOrders, actionOrders, customers, activeProducts, unavailableProducts] =
    await Promise.all([
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .is("deleted_at", null)
        .gte("created_at", today),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .is("deleted_at", null)
        .in("status", ["pending_cafe", "accepted"]),
      supabase
        .from("customer_profiles")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id),
      supabase
        .from("menu_products")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .is("deleted_at", null)
        .eq("available", true),
      supabase
        .from("menu_products")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .is("deleted_at", null)
        .eq("available", false),
    ]);

  const error =
    todayOrders.error ||
    actionOrders.error ||
    customers.error ||
    activeProducts.error ||
    unavailableProducts.error;
  if (error) throw error;

  return {
    todayOrders: todayOrders.count ?? 0,
    actionOrders: actionOrders.count ?? 0,
    customers: customers.count ?? 0,
    activeProducts: activeProducts.count ?? 0,
    unavailableProducts: unavailableProducts.count ?? 0,
  };
}

export async function getDashboardRecentOrders(limit = 5): Promise<DashboardRecentOrder[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const safeLimit = Math.min(Math.max(limit, 1), 5);
  const { data, error } = await supabase
    .from("orders")
    .select("id, customer_name, status, total, created_at")
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    customerName: String(row.customer_name ?? "عميل"),
    status: String(row.status ?? ""),
    total: Number(row.total ?? 0),
    createdAt: String(row.created_at ?? ""),
  }));
}

export async function getDashboardOrderTrend(): Promise<number[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  since.setUTCHours(21, 0, 0, 0);
  const { data, error } = await supabase
    .from("orders")
    .select("created_at")
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .gte("created_at", since.toISOString());

  if (error) throw error;
  const values = Array.from({ length: 7 }, () => 0);
  for (const row of data ?? []) {
    const age = Math.floor((Date.now() - new Date(String(row.created_at)).getTime()) / 86_400_000);
    const index = 6 - Math.min(Math.max(age, 0), 6);
    values[index] += 1;
  }
  return values;
}
