"use server";
import { signInFinance, provisionFinanceStaff } from "@/lib/data/finance-access";
import { createClient } from "@/lib/supabase/server";

export async function loginFinanceAction(slug: string, identity: string, password: string) {
  try { return await signInFinance(slug, identity, password); }
  catch { return { ok: false as const, message: "تعذر تسجيل الدخول حاول مرة أخرى" }; }
}

export async function createFinanceStaffAccountAction(input: { email: string; name: string; password: string; role: "manager" | "cashier" }) {
  try { return await provisionFinanceStaff(input); }
  catch { return { ok: false as const, message: "تعذر إنشاء الحساب تحقق من البيانات أو أضف البريد كحساب موجود" }; }
}

export async function logoutFinanceAction() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
}
