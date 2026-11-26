"use server";

import { z } from "zod";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";
import { FAROUJ_CAFE_ID } from "@/lib/loyalty/customer-phone";
import { getOwnerLoyaltyActivity } from "@/lib/data/loyalty-activity";
import type { LoyaltyActivityFilters, LoyaltyActivityResult } from "@/lib/loyalty/activity-types";

export async function loadLoyaltyActivityAction(filters: LoyaltyActivityFilters): Promise<LoyaltyActivityResult> {
  try {
    return { ok: true, data: await getOwnerLoyaltyActivity(filters) };
  } catch {
    return { ok: false, message: "تعذر تحميل سجل العمليات تحقق من الفترة المحددة وصلاحية دخولك ثم أعد المحاولة" };
  }
}

export async function voidCashierStampAction(eventId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const cafe = await requireOwnerCafeContext();
    if (cafe.id !== FAROUJ_CAFE_ID || cafe.role !== "owner") return { ok: false, message: "إلغاء الختم متاح لمالك الحساب" };
    const db = await createClient();
    const { data, error } = await db.rpc("farouj_void_cashier_stamp", { p_activity: z.string().uuid().parse(eventId) });
    if (error) throw error;
    if (data === "voided" || data === "already_void") return { ok: true, message: "أُلغي الختم" };
    if (data === "redeemed_reward") return { ok: false, message: "صُرفت مكافأة هذه الدورة وتعذّر إلغاء الختم" };
    return { ok: false, message: "تعذّر مطابقة الختم مع رصيد البطاقة" };
  } catch {
    return { ok: false, message: "تعذّر تأكيد إلغاء الختم حدّث السجل وأعد المحاولة" };
  }
}
