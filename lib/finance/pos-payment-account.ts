import type { FinanceAccount, FinanceShift } from "./brand-finance";

export type FinancePosPaymentAccountIssue = {
  code: "shift-paused" | "shift-account-unavailable" | "handover-pending" | "handover-incoming" | "shift-required" | "drawer-busy" | "drawer-unavailable" | "drawer-inactive" | "drawer-missing" | "card-inactive" | "card-missing" | "bank-inactive" | "bank-missing" | "refresh-required";
  ar: string;
  en: string;
};

type Input = {
  accounts: Pick<FinanceAccount, "id" | "kind" | "active" | "is_cashier_drawer" | "availableWithoutShift">[];
  shifts: Pick<FinanceShift, "user_id" | "account_id" | "status" | "supervisor_paused" | "handover_to">[];
  userId: string;
  paymentKind: "cash" | "pos" | "bank";
  butcher: boolean;
  selectedAccountId?: string | null;
};

const refresh: FinancePosPaymentAccountIssue = {
  code: "refresh-required",
  ar: "تعذر تحديد حساب التحصيل من البيانات الحالية حدّث الأرصدة ثم أعد المحاولة",
  en: "The payment account could not be resolved from the current data Refresh balances and try again",
};

/** Explains the existing selection result only; never selects or authorizes another account. */
export function financePosPaymentAccountIssue(input: Input): FinancePosPaymentAccountIssue | null {
  if (input.selectedAccountId) return null;
  const { accounts, shifts, userId, paymentKind, butcher } = input;
  const matching = accounts.filter(account => account.kind === paymentKind);
  const active = matching.filter(account => account.active);
  if (paymentKind !== "cash") {
    if (active.length) return refresh;
    if (paymentKind === "pos") return matching.length
      ? { code: "card-inactive", ar: "حساب الشبكة غير مفعّل اطلب من المسؤول تفعيله ثم حدّث الأرصدة", en: "The card payment account is inactive Ask your manager to activate it and refresh balances" }
      : { code: "card-missing", ar: "لا يوجد حساب شبكة متاح اطلب من المسؤول إعداد حساب الشبكة ثم حدّث الأرصدة", en: "No card payment account is available Ask your manager to set one up and refresh balances" };
    return matching.length
      ? { code: "bank-inactive", ar: "الحساب البنكي غير مفعّل اطلب من المسؤول تفعيله ثم حدّث الأرصدة", en: "The bank account is inactive Ask your manager to activate it and refresh balances" }
      : { code: "bank-missing", ar: "لا يوجد حساب بنكي متاح اطلب من المسؤول إعداد الحساب ثم حدّث الأرصدة", en: "No bank account is available Ask your manager to set one up and refresh balances" };
  }

  const ownShift = shifts.find(shift => shift.user_id === userId && shift.status === "open");
  if (ownShift) {
    if (ownShift.supervisor_paused) return { code: "shift-paused", ar: "ورديتك موقوفة إداريًا اطلب من المسؤول استئنافها قبل التحصيل", en: "Your shift is paused Ask your manager to resume it before taking payment" };
    if (!active.some(account => account.id === ownShift.account_id)) return { code: "shift-account-unavailable", ar: "صندوق ورديتك غير متاح حاليًا اطلب من المسؤول مراجعة الصندوق ثم حدّث الأرصدة", en: "Your shift drawer is unavailable Ask your manager to check it and refresh balances" };
    return refresh;
  }
  if (shifts.some(shift => shift.user_id === userId && shift.status === "handover")) return { code: "handover-pending", ar: "صندوق ورديتك بانتظار الاستلام أكمل تسليم الوردية قبل استخدامه للتحصيل", en: "Your drawer is awaiting handover Complete the handover before using it for payment" };
  const drawers = active.filter(account => account.is_cashier_drawer);
  if (!drawers.length) {
    if (matching.some(account => account.is_cashier_drawer && !account.active)) return { code: "drawer-inactive", ar: "صندوق الكاشير غير مفعّل اطلب من المسؤول تفعيله ثم حدّث الأرصدة", en: "The cashier drawer is inactive Ask your manager to activate it and refresh balances" };
    if (active.some(account => account.is_cashier_drawer === undefined)) return refresh;
    return { code: "drawer-missing", ar: "لا يوجد صندوق كاشير مفعّل متاح للتحصيل اطلب من المسؤول مراجعة صناديق الكاشير ثم حدّث الأرصدة", en: "No active cashier drawer is available Ask your manager to review the drawers and refresh balances" };
  }
  if (!butcher) {
    if (shifts.some(shift => shift.handover_to === userId && shift.status === "handover")) return { code: "handover-incoming", ar: "توجد وردية بانتظار استلامك استلمها من إدارة الوردية لإتاحة صندوق الكاشير", en: "A shift is waiting for you Accept it in shift management to use its drawer" };
    return { code: "shift-required", ar: "ابدأ ورديتك من إدارة الوردية لإتاحة صندوق الكاشير والتحصيل النقدي", en: "Start your shift in shift management to enable your drawer and cash payments" };
  }
  const free = drawers.some(account => account.availableWithoutShift !== false && !shifts.some(shift => shift.account_id === account.id && shift.status !== "closed"));
  if (free) return refresh;
  if (drawers.some(account => shifts.some(shift => shift.account_id === account.id && shift.status !== "closed"))) return { code: "drawer-busy", ar: "صندوق الكاشير مرتبط بوردية مفتوحة أو تسليم معلق استلم ورديتك أو اطلب من المسؤول صندوقًا متاحًا لك", en: "The cashier drawer belongs to an open shift or pending handover Accept your shift or ask your manager for an available drawer" };
  return { code: "drawer-unavailable", ar: "صندوق الكاشير غير متاح للبيع دون وردية حدّث الأرصدة أو راجع المسؤول بشأن الوردية المرتبطة به", en: "The drawer is unavailable for sales without a shift Refresh balances or ask your manager about its assigned shift" };
}
