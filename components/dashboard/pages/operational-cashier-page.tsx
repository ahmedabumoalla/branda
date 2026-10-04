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
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { startOwnerCashierAction } from "@/app/actions/cashier";
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
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const mutationPendingRef = useRef(false);
  const [ownerError, openOwnerPortal, ownerPending] = useActionState(async () => {
    const result = await startOwnerCashierAction();
    return result.message;
  }, "");

  useEffect(() => {
    if (!isAdding) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [isAdding]);

  function openAddDialog() {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFormError("");
    setIsAdding(true);
  }

  function closeAddDialog() {
    if (mutationPendingRef.current) return;
    setPassword("");
    setIsAdding(false);
  }

  const activeCount = useMemo(
    () => dashboard.cashiers.filter((cashier) => cashier.active).length,
    [dashboard.cashiers],
  );
  const ready = activeCount > 0 || dashboard.canOpenAsOwner;

  async function copyLoginLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${loginPath}`);
      setMessage("تم نسخ رابط الدخول");
    } catch {
      setMessage("تعذر نسخ الرابط. افتح بوابة الكاشير وانسخ الرابط من شريط العنوان.");
    }
  }

  async function createCashier() {
    if (mutationPendingRef.current) return;
    if (fullName.trim().length < 2) {
      setFormError("أدخل اسمًا واضحًا للموظف");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError("أدخل بريدًا إلكترونيًا صحيحًا");
      return;
    }
    if (!/^(?:(?:00)?966|0)?5\d{8}$/.test(phone.replace(/\D/g, ""))) {
      setFormError("أدخل رقم جوال سعوديًا صحيحًا مرتبطًا بواتساب");
      return;
    }
    if (password.trim().length < 8 || password.length > 40 || new TextEncoder().encode(password).length > 72) {
      setFormError("اختر كلمة مرور من ٨ إلى ٤٠ حرفًا. إذا استخدمت حروفًا عربية، اجعلها أقصر من ٣٧ حرفًا.");
      return;
    }

    mutationPendingRef.current = true;
    setPendingId("create");
    setMessage("");
    setFormError("");
    try {
      const result = await createLoyaltyCashierAction({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        employeeNumber: employeeNumber.trim() || undefined,
        phone: phone.trim(),
        password,
      });
      setDashboard((current) => ({
        ...current,
        cashiers: [result.cashier, ...current.cashiers],
      }));
      setFullName("");
      setEmail("");
      setEmployeeNumber("");
      setPhone("");
      setPassword("");
      setIsAdding(false);
      setMessage(result.whatsappStatus === "queued"
        ? "تم إنشاء حساب الموظف وجدولة رسالة واتساب ببيانات الدخول. وصول الرسالة يعتمد على مزود الخدمة."
        : result.whatsappStatus === "failed"
          ? "تم إنشاء حساب الموظف، لكن تعذر إرسال رسالة واتساب. شارك رابط الدخول والبيانات التي حددتها معه مباشرة."
          : "تم إنشاء حساب الموظف. إرسال واتساب غير متاح حاليًا؛ شارك رابط الدخول والبيانات التي حددتها معه مباشرة.");
    } catch {
      setFormError("تعذر إنشاء الحساب. تحقق من البيانات وأن البريد غير مستخدم، ثم حاول مجددًا");
    } finally {
      mutationPendingRef.current = false;
      setPendingId(null);
    }
  }

  async function toggleCashier(cashierId: string, active: boolean) {
    if (mutationPendingRef.current || dashboard.cashiers.find((cashier) => cashier.id === cashierId)?.ownerUserId) return;
    mutationPendingRef.current = true;
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
      mutationPendingRef.current = false;
      setPendingId(null);
    }
  }

  return (
    <DashboardPageShell
      title="نقطة التشغيل"
      subtitle="إدارة فريق الكاشير ومتابعة جاهزية التشغيل من مكان واحد."
      action={
        dashboard.canOpenAsOwner ? (
          <form action={openOwnerPortal}>
            <button type="submit" disabled={ownerPending} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#6B3A25] px-5 py-3 text-sm font-black text-white disabled:opacity-60">
              <DoorOpen aria-hidden="true" className="h-4 w-4" />
              {ownerPending ? "جارٍ فتح نقطة التشغيل..." : "فتح نقطة التشغيل باسمي"}
            </button>
          </form>
        ) : <Link
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
        <p role="status" className="mb-5 rounded-2xl bg-white p-4 text-sm font-black text-[#6B3A25] shadow-sm">
          {message}
        </p>
      ) : null}
      {ownerError ? <p role="alert" className="mb-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-800">{ownerError}</p> : null}

      <section className="mb-6 overflow-hidden rounded-[2rem] bg-[#311912] p-5 text-white sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${ready ? "bg-emerald-400/20 text-emerald-200" : "bg-amber-300/20 text-amber-100"}`}>
              {ready ? "جاهز للتشغيل" : "يحتاج إضافة موظف نشط"}
            </span>
            <h2 className="mt-4 text-2xl font-black sm:text-3xl">شغّل الطلبات والولاء والمكافآت بثقة</h2>
            <p className="mt-2 text-sm font-bold leading-7 text-white/70">
              لديك {activeCount} حساب تشغيل نشط. {dashboard.canOpenAsOwner ? "افتح البوابة مباشرة وسجّل العمليات باسمك بصفتك مالك العلامة." : "العمليات الفعلية تتم من بوابة الكاشير المنفصلة."}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            {dashboard.canOpenAsOwner ? (
              <form action={openOwnerPortal}>
                <button type="submit" disabled={ownerPending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 font-black text-[#311912] disabled:opacity-60">
                  <DoorOpen aria-hidden="true" className="h-5 w-5" /> {ownerPending ? "جارٍ الفتح..." : "الدخول باسمي"}
                </button>
              </form>
            ) : <Link href={loginPath} target="_blank" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 font-black text-[#311912]">
              <DoorOpen className="h-5 w-5" /> فتح البوابة
            </Link>}
            <button type="button" onClick={openAddDialog} disabled={pendingId !== null} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/20 px-5 font-black disabled:opacity-60">
              <UserRoundPlus className="h-5 w-5" /> إضافة موظف
            </button>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-3 md:grid-cols-3" aria-label="خطوات التشغيل">
        {[
          ["١", "أضف الموظف", "أنشئ حساب تشغيل محدود الصلاحية."],
          ["٢", "بيانات الدخول عبر واتساب", "حدّد الجوال وكلمة المرور لتُرسل بيانات الدخول للموظف."],
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
            <button type="button" onClick={openAddDialog} disabled={pendingId !== null} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#6B3A25] px-3 text-xs font-black text-white disabled:opacity-60">
              <Plus className="h-4 w-4" /> إضافة
            </button>
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-right text-sm">
            <thead className="text-xs font-black text-[#806A5E]">
              <tr className="border-b border-[#EFE6DD]">
                <th scope="col" className="p-3">الموظف</th><th scope="col" className="p-3">البريد</th><th scope="col" className="p-3">الجوال</th><th scope="col" className="p-3">الرقم الوظيفي</th><th scope="col" className="p-3">الحالة</th><th scope="col" className="p-3">آخر دخول</th><th scope="col" className="p-3">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.cashiers.map((cashier) => (
                <tr key={cashier.id} className="border-b border-[#F5EFE9] font-bold">
                  <td className="p-3 font-black">{cashier.fullName}{cashier.ownerUserId ? <span className="mt-1 block text-xs text-[#806A5E]">مالك العلامة</span> : null}</td>
                  <td className="p-3 break-all text-[#806A5E]">{cashier.email}</td>
                  <td className="p-3"><bdi dir="ltr">{cashier.phone || "—"}</bdi></td>
                  <td className="p-3">{cashier.employeeNumber || "—"}</td>
                  <td className="p-3"><span className={`rounded-full px-3 py-1 text-xs ${cashier.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}>{cashier.active ? "نشط" : "معطل"}</span></td>
                  <td className="p-3 text-xs text-[#806A5E]">{formatDate(cashier.lastLoginAt)}</td>
                  <td className="p-3">
                    {cashier.ownerUserId ? <span className="text-xs text-[#806A5E]">مرتبط بحساب المالك</span> : <button type="button" disabled={pendingId !== null} onClick={() => void toggleCashier(cashier.id, !cashier.active)} className="min-h-11 rounded-xl bg-[#F8F4EF] px-3 py-2 text-xs font-black text-[#6B3A25] disabled:opacity-50">
                      {pendingId === cashier.id ? "جارٍ الحفظ..." : cashier.active ? "تعطيل" : "تفعيل"}
                    </button>}
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
                <div className="min-w-0"><h3 className="font-black">{cashier.fullName}</h3>{cashier.ownerUserId ? <p className="mt-1 text-xs font-bold text-[#6B3A25]">مالك العلامة</p> : null}<p className="mt-1 break-all text-xs font-bold text-[#806A5E]">{cashier.email}</p></div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${cashier.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-200 text-stone-600"}`}>{cashier.active ? "نشط" : "معطل"}</span>
              </div>
              <p className="mt-3 text-xs font-bold text-[#806A5E]">الرقم الوظيفي: {cashier.employeeNumber || "—"}</p>
              <p className="mt-1 text-xs font-bold text-[#806A5E]">الجوال: <bdi dir="ltr">{cashier.phone || "—"}</bdi></p>
              <p className="mt-1 text-xs font-bold text-[#806A5E]">آخر دخول: {formatDate(cashier.lastLoginAt)}</p>
              {cashier.ownerUserId ? <p className="mt-3 text-xs font-bold text-[#806A5E]">مرتبط بحساب المالك</p> : <button type="button" disabled={pendingId !== null} onClick={() => void toggleCashier(cashier.id, !cashier.active)} className="mt-3 min-h-11 w-full rounded-xl bg-white text-xs font-black text-[#6B3A25] disabled:opacity-50">{pendingId === cashier.id ? "جارٍ الحفظ..." : cashier.active ? "تعطيل الحساب" : "تفعيل الحساب"}</button>}
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
        <dialog
          ref={dialogRef}
          dir="rtl"
          aria-labelledby="cashier-dialog-title"
          aria-describedby="cashier-dialog-description"
          onCancel={(event) => { event.preventDefault(); closeAddDialog(); }}
          className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-[2rem] border-0 bg-white p-5 text-[#311912] shadow-2xl backdrop:bg-black/40 sm:p-7"
        >
          <div className="flex items-center justify-between gap-3"><h2 id="cashier-dialog-title" className="text-xl font-black">إضافة موظف كاشير</h2><button type="button" onClick={closeAddDialog} disabled={pendingId === "create"} className="grid min-h-11 min-w-11 place-items-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6B3A25] disabled:opacity-50" aria-label="إغلاق"><X aria-hidden="true" className="h-5 w-5" /></button></div>
          <p id="cashier-dialog-description" className="mt-2 text-sm font-bold leading-6 text-[#806A5E]">حدّد بيانات الموظف وكلمة مروره. ستُرسل بيانات الدخول ورابط بوابة الكاشير إلى جواله عبر واتساب عند توفر الخدمة.</p>
          <form onSubmit={(event) => { event.preventDefault(); void createCashier(); }}>
            {formError ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{formError}</p> : null}
            <fieldset disabled={pendingId === "create"} className="mt-5 space-y-4 disabled:opacity-60">
              <label className="block text-sm font-black">الاسم<input required minLength={2} maxLength={80} value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] px-4 outline-none focus:border-[#6B3A25] focus:ring-2 focus:ring-[#6B3A25]/25" autoComplete="name" /></label>
              <label className="block text-sm font-black">البريد الإلكتروني<input required type="email" maxLength={254} dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] px-4 outline-none focus:border-[#6B3A25] focus:ring-2 focus:ring-[#6B3A25]/25" autoComplete="email" /></label>
              <label className="block text-sm font-black">جوال الموظف المرتبط بواتساب<input required type="tel" inputMode="tel" dir="ltr" maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="05xxxxxxxx" aria-describedby="cashier-phone-help" className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] px-4 outline-none focus:border-[#6B3A25] focus:ring-2 focus:ring-[#6B3A25]/25" autoComplete="tel" /><span id="cashier-phone-help" className="mt-1 block text-xs font-bold text-[#806A5E]">رقم سعودي يبدأ بـ ٠٥ أو بمفتاح الدولة ٩٦٦.</span></label>
              <label className="block text-sm font-black">كلمة المرور التي تختارها<input required type="password" minLength={8} maxLength={40} dir="ltr" value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="cashier-password-help" className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] px-4 outline-none focus:border-[#6B3A25] focus:ring-2 focus:ring-[#6B3A25]/25" autoComplete="new-password" /><span id="cashier-password-help" className="mt-1 block text-xs font-bold text-[#806A5E]">من ٨ إلى ٤٠ حرفًا. تُرسل للموظف مع بريده ورابط الدخول.</span></label>
              <label className="block text-sm font-black">الرقم الوظيفي <span className="text-[#806A5E]">(اختياري)</span><input maxLength={40} value={employeeNumber} onChange={(event) => setEmployeeNumber(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] px-4 outline-none focus:border-[#6B3A25] focus:ring-2 focus:ring-[#6B3A25]/25" /></label>
            </fieldset>
            <button type="submit" disabled={pendingId === "create"} className="mt-6 min-h-12 w-full rounded-2xl bg-[#6B3A25] px-4 font-black text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6B3A25] disabled:opacity-60">{pendingId === "create" ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب وإرسال بيانات الدخول"}</button>
          </form>
        </dialog>
      ) : null}
    </DashboardPageShell>
  );
}
