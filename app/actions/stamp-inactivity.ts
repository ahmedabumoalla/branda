"use server";

import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";

export async function getStampInactivitySettings(days: number | null = null, revision: number | null = null) {
  try {
    const cafe = await requireOwnerCafeContext();
    if (cafe.id !== "ec9b4415-b68e-4554-acbd-c918bd5cc2f2" || cafe.staff) {
      return { ok: false as const, message: "هذا الإعداد غير متاح لهذا الحساب" };
    }
    if ((days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) ||
        (revision !== null && (!Number.isSafeInteger(revision) || revision < 0))) {
      return { ok: false as const, message: "أدخل عدد أيام صحيحًا من ١ إلى ٣٦٥٠" };
    }
    const client = await createClient();
    const { data, error } = await client.rpc("loyalty_stamp_inactivity_settings", {
      p_cafe: cafe.id, p_days: days, p_revision: revision,
    });
    if (error || !data) return { ok: false as const, message: error?.code === "40001" ? "تغيّر الإعداد من جلسة أخرى حدّث الصفحة قبل الحفظ" : "تعذر الوصول إلى إعداد مدة الانقطاع" };
    return { ok: true as const, days: data.days as number | null, revision: data.revision as number };
  } catch {
    return { ok: false as const, message: "تعذر الوصول إلى إعداد مدة الانقطاع" };
  }
}
