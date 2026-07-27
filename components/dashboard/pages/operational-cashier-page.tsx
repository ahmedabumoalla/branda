"use client";

import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  ClipboardCopy,
  DoorOpen,
  HelpCircle,
  Plus,
  ShieldCheck,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  createLoyaltyCashierAction,
  setLoyaltyCashierStatusAction,
} from "@/app/actions/loyalty-cards";
import { DashboardPageShell, SoftCard } from "@/components/ui/design-system";
import type { CashierOperationsDashboard } from "@/lib/data/loyalty-cards";

type Props = {
  initialDashboard: CashierOperationsDashboard;
  configError?: string;
};

const loginPath = "/cashier/login";

function formatDate(value: string | null) {
  if (!value) return "لم يسجل الدخول بعد";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function activityText(action: string) {
  const labels: Record<string, string> = {
    login: "سجّل الدخول إلى نقطة التشغيل",
    logout: "سجّل الخروج من نقطة التشغيل",
    order_received: "حدّث حالة طلب",
    order_accept: "قبل طلبًا",
    cashier_accept_order: "قبل طلبًا",
    loyalty_stamp: "أضاف زيارة ولاء",
    loyalty_card_scan: "مسح بطاقة ولاء",
    loyalty_redeem: "صرف مكافأة ولاء",
    loyalty_reward_redeem: "صرف مكافأة ولاء",
    experience_reward_redeem: "صرف مكافأة",
  };
  return labels[action] ?? "نفّذ عملية تشغيلية";
}

export function OperationalCashierPageClient({
  initialDashboard,
  configError,
}: Props) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [isAdding, setIsAdding] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [message, setMessage] = useState("");

  const activeCount = useMemo(
    () => dashboard.cashiers.filter((cashier) => cashier.active).length,
    [dashboard.cashiers],
  );
  const ready = activeCount > 0;

  async function copyLoginLink() {
    await navigator.clipboard.writeText(`${window.location.origin}${loginPath}`);
    setMessage("تم نسخ رابط الدخول");
  }

  async function createCashier() {
    if (fullName.trim().length < 2) {
      setMessage("أدخل اسمًا واضحًا للموظف");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMessage("أدخل بريدًا إلكترونيًا صحيحًا");
      return;
    }

    setPendingId("create");
    setMessage("");
    try {
      const password = await createLoyaltyCashierAction({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        employeeNumber: employeeNumber.trim() || undefined,
      });
      setDashboard((current) => ({
        ...current,
        cashiers: [
          {
            id: `new-${Date.now()}`,
            fullName: fullName.trim(),
            email: email.trim().toLowerCase(),
            employeeNumber: employeeNumber.trim(),
            active: true,
            lastLoginAt: null,
            lastLogoutAt: null,
            createdAt: new Date().toISOString(),
          },
          ...current.cashiers,
        ],
      }));
      setTemporaryPassword(password);
      setFullName("");
      setEmail("");
      setEmployeeNumber("");
      setIsAdding(false);
      setMessage("تم إنشاء حساب الموظف");
    } catch {
      setMessage("تعذر إنشاء الحساب. تحقق من البيانات وحاول مجددًا");
    } finally {
      setPendingId(null);
    }
  }

  async function toggleCashier(cashierId: string, active: boolean) {
    setPendingId(cashierId);
    setMessage("");
    try {
      await setLoyaltyCashierStatusAction(cashierId, active);
      setDashboard((current) => ({
        ...current,
        cashiers: current.cashiers.map((cashier) =>
          cashier.id === cashierId ? { ...cashier, active } : cashier,
        ),
      }));
    } catch {
      setMessage("تعذر تحديث حالة الموظف");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <DashboardPageShell
      title="نقطة التشغيل"
      subtitle="إدارة فريق الكاشير ومتابعة جاهزية التشغيل من مكان واحد."
      action={
        <Link
          href={loginPath}
          target="_blank"
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#6B3A25] px-5 py-3 text-sm font-black text-white"
        >
          <DoorOpen className="h-4 w-4" />
          فتح نقطة التشغيل
        </Link>
      }
    >
      {configError ? (
        <SoftCard className="mb-5 p-4 font-bold text-amber-700">{configError}</SoftCard>
      ) : null}
      {message ? (
        <p className="mb-5 rounded-2xl bg-white p-4 text-sm font-black text-[#6B3A25] shadow-sm">
          {message}
        </p>
      ) : null}
      {temporaryPassword ? (
        <div className="mb-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-black">كلمة المرور المؤقتة — تظهر مرة واحدة</p>
              <p className="mt-2 font-mono text-xl font-black">{temporaryPassword}</p>
              <p className="mt-2 text-xs font-bold text-emerald-800">
                انسخها الآن وشاركها مع الموظف عبر قناة آمنة.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTemporaryPassword("")}
              className="rounded-xl p-2 hover:bg-emerald-100"
              aria-label="إخفاء كلمة المرور"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : null}

      <section className="mb-6 overflow-hidden rounded-[2rem] bg-[#311912] p-5 text-white sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${ready ? "bg-emerald-400/20 text-emerald-200" : "bg-amber-300/20 text-amber-100"}`}>
              {ready ? "جاهز للتشغيل" : "يحتاج إضافة موظف نشط"}
            </span>
            <h2 className="mt-4 text-2xl font-black sm:text-3xl">شغّل الطلبات والولاء والمكافآت بثقة</h2>
            <p className="mt-2 text-sm font-bold leading-7 text-white/70">
              لديك {activeCount} موظف نشط. العمليات الفعلية تتم من بوابة الكاشير المنفصلة.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href={loginPath} target="_blank" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 font-black text-[#311912]">
              <DoorOpen className="h-5 w-5" /> فتح البوابة
            </Link>
            <button type="button" onClick={() => setIsAdding(true)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/20 px-5 font-black">
              <UserRoundPlus className="h-5 w-5" /> إضافة موظف
            </button>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-3 md:grid-cols-3" aria-label="خطوات التشغيل">
        {[
          ["١", "أضف الموظف", "أنشئ حساب تشغيل محدود الصلاحية."],
          ["٢", "شارك بيانات الدخول", "أرسل الرابط وكلمة المرور المؤقتة بأمان."],
          ["٣", "ابدأ التشغيل", "يفتح الموظف البوابة وينفذ العمليات باسمه."],
        ].map(([number, title, body]) => (
          <SoftCard key={number} className="p-5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#F2E7D9] font-black text-[#6B3A25]">{number}</span>
            <h3 className="mt-4 font-black text-[#311912]">{title}</h3>
            <p className="mt-1 text-sm font-bold leading-6 text-[#806A5E]">{body}</p>
          </SoftCard>
        ))}
      </section>

      <section className="mb-6 rounded-[2rem] bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black text-[#311912]"><UsersRound className="h-5 w-5" /> فريق الكاشير</h2>
            <p className="mt-1 text-sm font-bold text-[#806A5E]">{dashboard.cashiers.length} حساب تشغيل</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void copyLoginLink()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#F8F4EF] px-3 text-xs font-black text-[#6B3A25]">
              <ClipboardCopy className="h-4 w-4" /> نسخ رابط الدخول
            </button>
            <button type="button" onClick={() => setIsAdding(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#6B3A25] px-3 text-xs font-black text-white">
              <Plus className="h-4 w-4" /> إضافة
            </button>
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-right text-sm">
            <thead className="text-xs font-black text-[#806A5E]">
              <tr className="border-b border-[#EFE6DD]">
                <th className="p-3">الموظف</th><th className="p-3">البريد</th><th className="p-3">الرقم الوظيفي</th><th className="p-3">الحالة</th><th className="p-3">آخر دخول</th><th className="p-3">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.cashiers.map((cashier) => (
                <tr key={cashier.id} className="border-b border-[#F5EFE9] font-bold">
                  <td className="p-3 font-black">{cashier.fullName}</td>
                  <td className="p-3 break-all text-[#806A5E]">{cashier.email}</td>
                  <td className="p-3">{cashier.employeeNumber || "—"}</td>
                  <td className="p-3"><span className={`rounded-full px-3 py-1 text-xs ${cashier.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}>{cashier.active ? "نشط" : "معطل"}</span></td>
                  <td className="p-3 text-xs text-[#806A5E]">{formatDate(cashier.lastLoginAt)}</td>
                  <td className="p-3">
                    <button type="button" disabled={pendingId === cashier.id} onClick={() => void toggleCashier(cashier.id, !cashier.active)} className="rounded-xl bg-[#F8F4EF] px-3 py-2 text-xs font-black text-[#6B3A25] disabled:opacity-50">
                      {pendingId === cashier.id ? "جارٍ الحفظ..." : cashier.active ? "تعطيل" : "تفعيل"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 md:hidden">
          {dashboard.cashiers.map((cashier) => (
            <article key={cashier.id} className="rounded-2xl bg-[#F8F4EF] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h3 className="font-black">{cashier.fullName}</h3><p className="mt-1 break-all text-xs font-bold text-[#806A5E]">{cashier.email}</p></div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${cashier.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-200 text-stone-600"}`}>{cashier.active ? "نشط" : "معطل"}</span>
              </div>
              <p className="mt-3 text-xs font-bold text-[#806A5E]">الرقم الوظيفي: {cashier.employeeNumber || "—"}</p>
              <p className="mt-1 text-xs font-bold text-[#806A5E]">آخر دخول: {formatDate(cashier.lastLoginAt)}</p>
              <button type="button" disabled={pendingId === cashier.id} onClick={() => void toggleCashier(cashier.id, !cashier.active)} className="mt-3 min-h-10 w-full rounded-xl bg-white text-xs font-black text-[#6B3A25] disabled:opacity-50">{cashier.active ? "تعطيل الحساب" : "تفعيل الحساب"}</button>
            </article>
          ))}
        </div>
        {!dashboard.cashiers.length ? <p className="rounded-2xl bg-[#F8F4EF] p-6 text-center font-bold text-[#806A5E]">لم تتم إضافة موظفين بعد.</p> : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-[2rem] bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-black"><Activity className="h-5 w-5" /> أحدث النشاطات</h2>
          <div className="mt-4 space-y-3">
            {dashboard.activities.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-start gap-3 rounded-2xl bg-[#F8F4EF] p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div><p className="text-sm font-black">{item.cashierName} — {activityText(item.actionType)}</p><p className="mt-1 text-xs font-bold text-[#806A5E]">{formatDate(item.createdAt)}</p></div>
              </div>
            ))}
            {!dashboard.activities.length ? <p className="text-sm font-bold text-[#806A5E]">لا توجد عمليات حديثة.</p> : null}
          </div>
        </section>
        <SoftCard className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-black"><HelpCircle className="h-5 w-5" /> مساعدة سريعة</h2>
          <p className="mt-3 text-sm font-bold leading-7 text-[#806A5E]">استخدم هذه الصفحة لإدارة الفريق فقط. الطلبات ومسح بطاقات الولاء وصرف المكافآت متاحة داخل بوابة الكاشير، وتُسجّل باسم الموظف الذي دخل إليها.</p>
          <div className="mt-4 flex items-center gap-2 text-xs font-black text-emerald-700"><ShieldCheck className="h-4 w-4" /> صلاحيات تشغيل معزولة لكل علامة</div>
        </SoftCard>
      </div>

      {isAdding ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-0 sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-label="إضافة موظف كاشير">
          <div className="w-full rounded-t-[2rem] bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-[2rem] sm:p-7">
            <div className="flex items-center justify-between"><h2 className="text-xl font-black">إضافة موظف كاشير</h2><button type="button" onClick={() => setIsAdding(false)} className="rounded-xl p-2" aria-label="إغلاق"><X className="h-5 w-5" /></button></div>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-black">الاسم<input value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] px-4 outline-none focus:border-[#6B3A25]" autoComplete="name" /></label>
              <label className="block text-sm font-black">البريد الإلكتروني<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] px-4 outline-none focus:border-[#6B3A25]" autoComplete="email" /></label>
              <label className="block text-sm font-black">الرقم الوظيفي <span className="text-[#806A5E]">(اختياري)</span><input value={employeeNumber} onChange={(event) => setEmployeeNumber(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] px-4 outline-none focus:border-[#6B3A25]" /></label>
            </div>
            <button type="button" disabled={pendingId === "create"} onClick={() => void createCashier()} className="mt-6 min-h-12 w-full rounded-2xl bg-[#6B3A25] font-black text-white disabled:opacity-60">{pendingId === "create" ? "جارٍ الإنشاء..." : "إنشاء الحساب"}</button>
          </div>
        </div>
      ) : null}
    </DashboardPageShell>
  );
}
