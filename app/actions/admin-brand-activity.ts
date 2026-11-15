"use server";

import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";

// Only requested by the selected brand's analytics panel, never by the directory.
export async function fetchAdminBrandActivityAction(cafeId: string) {
  await requirePlatformAdmin();
  const id = z.string().uuid().parse(cafeId);
  const client = await createClient();
  const [customers, orders] = await Promise.all([
    client.from("customer_profiles")
      .select("id, full_name, phone, email")
      .eq("cafe_id", id).order("created_at", { ascending: false }).limit(8),
    client.from("orders")
      .select("id, total, created_at")
      .eq("cafe_id", id).order("created_at", { ascending: false }).limit(8),
  ]);
  if (customers.error || orders.error) throw new Error("تعذر تحميل نشاط العلامة حاول مجددًا");
  return {
    customers: (customers.data ?? []).map(row => ({
      id: String(row.id), fullName: String(row.full_name),
      phone: String(row.phone), email: row.email ? String(row.email) : undefined,
    })),
    operations: (orders.data ?? []).map(row => ({
      id: String(row.id), title: `طلب ${row.id}`, type: "طلب",
      amount: Number(row.total), createdAt: String(row.created_at).slice(0, 10),
    })),
  };
}
