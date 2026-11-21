"use server";

import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getCafeFeatureCodes } from "@/lib/data/feature-entitlements";
import { getCashierConsole, requireCashierPermission, startOwnerCashierSession, type CashierConsole } from "@/lib/data/cashier";
import { getLoyaltyBrand } from "@/lib/data/loyalty-experience";
import { getActiveUser } from "@/lib/auth/active-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { actionResult } from "@/lib/platform/action-result";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import { canEmployeeAction, canFinance } from "@/lib/finance/permissions";
import { z } from "zod";
import { normalizeLoyaltyDigits } from "@/lib/loyalty/read-identifier";

type ReaderData = { status: "ready"; console: CashierConsole; identity?: LoyaltyIdentity; canIssue: boolean } | { status: "login_required" };

export async function openFinanceLoyaltyReaderAction(slug: string, confirmLoyaltySession = false) {
  return actionResult<ReaderData>(async () => {
    if (slug !== "mind-hospital") throw new Error("قارئ الولاء غير متاح لهذه العلامة");
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (cafe.slug !== slug) throw new Error("تعذر التحقق من العلامة المطلوبة");
    if (typeof confirmLoyaltySession !== "boolean" || !canFinance(cafe.role, "pos", cafe.employeePermissions) || !canEmployeeAction(cafe.role, cafe.employeePermissions, "loyalty.read", true)) throw new Error("لا تملك صلاحية فتح قارئ الولاء من نقطة البيع");
    const features = await getCafeFeatureCodes(cafe.id);
    if (!featureCodesAllow(features, "finance") || !featureCodesAllow(features, "loyalty")) throw new Error("يلزم تفعيل المالية والولاء لفتح قارئ البطاقات");
    const user = await getActiveUser(client);
    if (!user) throw new Error("انتهت الجلسة سجل الدخول مجددًا");
    const ownerEntry = cafe.role === "owner";
    // Independent credentials require explicit choice. requireCashierPermission
    // then binds a finance employee only when the verified phones match.
    if (!ownerEntry && !confirmLoyaltySession) return { status: "login_required" };
    if (ownerEntry) {
      const ownerCafe = await requireOwnerCafeContext();
      if (ownerCafe.id !== cafe.id || (ownerCafe.role !== "owner" && !(ownerCafe.role === "platform_admin" && cafe.maintenance === true))) throw new Error("لا تملك صلاحية فتح قارئ الولاء بهذه الجلسة");
      // Use the existing audited owner/maintenance session and original ledger.
      await startOwnerCashierSession();
    }
    const session = await requireCashierPermission("loyalty");
    if (session.cafeId !== cafe.id || session.cafeSlug !== slug) throw new Error("تغيرت جلسة الكاشير افتح قارئ الولاء مجددًا");
    if (ownerEntry) {
      const { data: cashier, error } = await createAdminClient().from("cafe_cashiers")
        .select("owner_user_id").eq("id", session.cashierId).eq("cafe_id", cafe.id).eq("active", true).maybeSingle();
      if (error || cashier?.owner_user_id !== user.id) throw new Error("جلسة الولاء لا تخص المستخدم الحالي");
    }
    const data = await getCashierConsole({ recordEntry: false, includeOrders: false });
    if (!data || data.cafe.id !== cafe.id || data.cashier.id !== session.cashierId || !data.cashier.canUseLoyalty) throw new Error("تعذر فتح جلسة قارئ الولاء أعد المحاولة");
    const brand = await getLoyaltyBrand(slug);
    if (brand && brand.cafeId !== cafe.id) throw new Error("تعذر التحقق من هوية العلامة");
    return { status: "ready", console: { ...data, pointsProgram: brand?.program.pointsProgram }, identity: brand?.identity, canIssue: canEmployeeAction(cafe.role, cafe.employeePermissions, "loyalty.issue", false) };
  }, "تعذر فتح قارئ الولاء تحقق من الاتصال والصلاحيات ثم أعد المحاولة");
}

export async function issueFinanceLoyaltyCardAction(input: { slug: string; requestId: string; name: string; phone: string }) {
  return actionResult(async () => {
    const parsed = z.object({ slug: z.string().min(1).max(80), requestId: z.string().uuid(), name: z.string().trim().min(2).max(120), phone: z.string().trim().min(9).max(30) }).strict().parse(input);
    const [{ client, cafe }, session] = await Promise.all([getBrandFinanceContext(parsed.slug), requireCashierPermission("loyalty")]);
    if (session.cafeId !== cafe.id || !canEmployeeAction(cafe.role, cafe.employeePermissions, "loyalty.issue", false)) throw new Error("لا تملك صلاحية إصدار بطاقة ولاء لهذه العلامة");
    const { data, error } = await client.rpc("brand_finance_loyalty_issue", { p_session_token: session.token, p_request_id: parsed.requestId, p_name: parsed.name, p_phone: normalizeLoyaltyDigits(parsed.phone) });
    if (error) throw new Error("تعذر إصدار البطاقة تحقق من بيانات العميل وصلاحية الموظف");
    if (data?.status === "approval_pending") return { status: "pending" as const };
    if (data?.status === "approval_rejected") throw new Error("رفض مسؤول الموافقة إصدار البطاقة راجع ملاحظة الرفض");
    if (data?.ok !== true || typeof data.cardCode !== "string") throw new Error("تعذر إصدار البطاقة تحقق من الاسم المسجل ورقم الجوال أو أعد المحاولة لاحقًا");
    return { status: "issued" as const, cardCode: data.cardCode as string, returningCustomer: data.returningCustomer === true };
  }, "تعذر إصدار بطاقة الولاء حاول مجددًا");
}
