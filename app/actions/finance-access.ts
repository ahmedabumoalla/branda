"use server";
import { signInFinance, provisionFinanceStaff, signInSalesCashier, provisionSalesCashier, SalesCashierCreationError, requestSalesCashierOtp, verifySalesCashierOtp, resetSalesCashierPassword } from "@/lib/data/finance-access";
import { createClient } from "@/lib/supabase/server";
import { ZodError } from "zod";
import { SALES_CASHIER_PASSWORD_HINT } from "@/lib/finance/sales-cashier-password";

export async function loginSalesCashierAction(phone: string, password: string) {
  try { return await signInSalesCashier(phone, password); }
  catch { return { ok: false as const, message: "تعذر تسجيل الدخول تحقق من رقم الجوال وحاول مجددًا" }; }
}

export async function requestSalesCashierOtpAction(phone: string) {
  try { return await requestSalesCashierOtp(phone); }
  catch { return { ok: false as const, message: "تعذر طلب رمز الدخول تحقق من رقم الجوال وحاول مجددًا" }; }
}

export async function verifySalesCashierOtpAction(phone: string, code: string) {
  try { return await verifySalesCashierOtp(phone, code); }
  catch { return { ok: false as const, message: "تعذر تأكيد الرمز تحقق من البيانات وحاول مجددًا" }; }
}

export async function resetSalesCashierPasswordAction(phone: string, code: string, password: string, confirmation: string) {
  try { return await resetSalesCashierPassword(phone, code, password, confirmation); }
  catch (error) {
    if (error instanceof ZodError && error.issues.some(issue => issue.message === SALES_CASHIER_PASSWORD_HINT)) {
      return { ok: false as const, message: SALES_CASHIER_PASSWORD_HINT };
    }
    return { ok: false as const, message: "تعذر إكمال تعيين كلمة المرور تحقق من البيانات وحاول مجددًا" };
  }
}

export async function createSalesCashierAccountAction(input: { name: string; phone: string; password: string }) {
  try { return await provisionSalesCashier(input); }
  catch (error) {
    if (error instanceof ZodError) {
      const field = error.issues[0]?.path[0];
      return { ok: false as const, message: field === "password" ? SALES_CASHIER_PASSWORD_HINT : field === "phone" ? "أدخل رقم جوال سعودي صحيحًا" : "أدخل اسم الكاشير من حرفين إلى ١٠٠ حرف" };
    }
    if (error instanceof SalesCashierCreationError) {
      const messages = {
        owner_required: "إضافة كاشير المبيعات متاحة لمالك العلامة فقط",
        finance_required: "فعّل اشتراك برندة المالية قبل إضافة كاشير المبيعات",
        existing_account_unavailable: "تعذر ربط الحساب الحالي تحقق من أنه حساب عميل نشط ورقمه مؤكد وليس له دور إداري في فريق مالية العلامة",
        password_rejected: "رفضت خدمة الدخول كلمة المرور اختر كلمة أخرى تستوفي الشروط وتجنب كلمات المرور الشائعة",
        service_unavailable: "تعذر إنشاء الحساب لدى خدمة الدخول حاول مجددًا بعد قليل",
        grant_failed: "تعذر ربط الحساب بصلاحية كاشير المبيعات حدّث الصفحة وحاول مجددًا",
      };
      return { ok: false as const, message: messages[error.code] };
    }
    return { ok: false as const, message: "تعذر إكمال إضافة الكاشير حدّث الصفحة وتحقق من اتصالك ثم حاول مجددًا" };
  }
}

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
