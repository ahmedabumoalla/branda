"use client";

import Link from "next/link";
import {
  Activity,
  ArrowUpLeft,
  CheckCircle2,
  ClipboardCopy,
  DoorOpen,
  HelpCircle,
  MessageCircle,
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
  updateCashierPermissionsAction,
  setLoyaltyCashierStatusAction,
} from "@/app/actions/loyalty-cards";
import { DashboardPageShell, SoftCard } from "@/components/ui/design-system";
import type { CashierOperationsDashboard } from "@/lib/data/loyalty-cards";
import styles from "./operational-cashier-page.module.css";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [permission, setPermission] = useState("loyalty");
  const [station, setStation] = useState("");
  const [fullName, setFullName] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [phone, setPhone] = useState("");
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
    setEditingId(null);
    setFullName("");
    setPhone("");
    setEmployeeNumber("");
    setPermission("loyalty");
    setStation("");
    setIsAdding(true);
  }

  function openPermissions(cashier: CashierOperationsDashboard["cashiers"][number]) {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditingId(cashier.id);
    setFullName(cashier.fullName);
    setPermission(cashier.canUsePager ? cashier.canUseLoyalty ? "both" : "pager" : "loyalty");
    setStation(cashier.pagerStation ?? "");
    setFormError("");
    setIsAdding(true);
  }

  async function savePermissions() {
    if (!editingId || mutationPendingRef.current) return;
    mutationPendingRef.current = true;
    setPendingId("create");
    setFormError("");
    try {
      const result = await updateCashierPermissionsAction({
        cashierId: editingId, canUseLoyalty: permission !== "pager",
        canUsePager: permission !== "loyalty", pagerStation: station.trim(),
      });
      setDashboard((current) => ({ ...current, cashiers: current.cashiers.map((cashier) =>
        cashier.id === editingId ? { ...cashier, ...result } : cashier) }));
      setIsAdding(false);
      setMessage("تم حفظ الصلاحيات يسجل الموظف الدخول مجددًا لتطبيقها");
    } catch {
      setFormError("تعذر حفظ الصلاحيات تأكد أن الخدمات المختارة مفعلة في باقتك");
    } finally { mutationPendingRef.current = false; setPendingId(null); }
  }

  function closeAddDialog() {
    if (mutationPendingRef.current) return;
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
      setMessage("تعذر نسخ الرابط افتح بوابة الكاشير وانسخ الرابط من شريط العنوان");
    }
  }

  async function createCashier() {
    if (mutationPendingRef.current) return;
    if (fullName.trim().length < 2) {
      setFormError("أدخل اسمًا واضحًا للموظف");
      return;
    }
    if (!/^(?:(?:00)?966|0)?5\d{8}$/.test(phone.replace(/\D/g, ""))) {
      setFormError("أدخل رقم جوال سعوديًا صحيحًا مرتبطًا بواتساب");
      return;
    }

    mutationPendingRef.current = true;
    setPendingId("create");
    setMessage("");
    setFormError("");
    try {
      const result = await createLoyaltyCashierAction({
        fullName: fullName.trim(),
        employeeNumber: employeeNumber.trim() || undefined,
        phone: phone.trim(),
        canUseLoyalty: permission !== "pager",
        canUsePager: permission !== "loyalty",
        pagerStation: station.trim(),
      });
      setDashboard((current) => ({
        ...current,
        cashiers: [result.cashier, ...current.cashiers],
      }));
      setFullName("");
      setEmployeeNumber("");
      setPhone("");
      setIsAdding(false);
      setMessage(result.whatsappStatus === "queued"
        ? "تم إنشاء حساب الموظف وجدولة رسالة واتساب برابط الدخول يدخل الموظف برمز تحقق على جواله"
        : result.whatsappStatus === "failed"
          ? "تم إنشاء حساب الموظف لكن تعذر إرسال رسالة الترحيب شارك رابط الدخول معه ليطلب رمز واتساب"
          : "تم إنشاء حساب الموظف خدمة واتساب غير متاحة حاليًا ويحتاجها الموظف لاستقبال رمز الدخول");
    } catch {
      setFormError("تعذر إنشاء الحساب تحقق من البيانات وأن رقم واتساب غير مستخدم لحساب موظف جديد");
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
      subtitle="جهّز فريقك وحدد مهامه وتابع كل عملية باسم صاحبها"
    >
      <div className={styles.workspace} dir="rtl">
      {configError ? (
        <SoftCard className="mb-5 p-4 font-bold text-amber-700"><p role="alert">{configError}</p></SoftCard>
      ) : null}
      {message ? (
        <p role="status" className="mb-5 rounded-2xl bg-white p-4 text-sm font-black text-[#6B3A25] shadow-sm">
          {message}
        </p>
      ) : null}
      {ownerError ? <p role="alert" className="mb-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-800">{ownerError}</p> : null}

      <section className={styles.hero} aria-labelledby="operations-heading">
        <div className={styles.heroCopy}>
          <div className={styles.heroEyebrow}><span>{dashboard.cafeName}</span><span className={styles.readiness} data-ready={ready}>{ready ? "جاهز للتشغيل" : "بانتظار تجهيز الفريق"}</span></div>
          <h2 id="operations-heading">كل مهمة واضحة<br /><span>وكل عملية باسم صاحبها</span></h2>
          <p>من هنا تدير حسابات فريقك وصلاحياته ثم يفتح كل موظف نقطة التشغيل لينفذ مهامه حسب الخدمات المفعّلة لعلامتك</p>
          <div className={styles.metrics} aria-label="ملخص فريق التشغيل"><div><strong>{activeCount}</strong><span>حساب نشط</span></div><div><strong>{dashboard.cashiers.length - activeCount}</strong><span>حساب معطّل</span></div><div><ShieldCheck aria-hidden="true" /><span>صلاحيات مستقلة<br />لكل موظف</span></div></div>
        </div>
        <div className={styles.ownerCard}>
          <span className={styles.actionIcon}><DoorOpen aria-hidden="true" /></span>
          <span className={styles.cardEyebrow}>{dashboard.canOpenAsOwner ? "لصاحب العلامة" : "لفريق التشغيل"}</span>
          <h3>{dashboard.canOpenAsOwner ? "شغّل بنفسك" : "بوابة الموظفين"}</h3>
          <p id="owner-entry-help">{dashboard.canOpenAsOwner ? "افتح نقطة التشغيل بجلسة المالك الحالية وتُسجّل العمليات باسمك من دون إنشاء حساب موظف جديد" : "يفتح الموظف البوابة ثم يدخل بحسابه لتنفيذ المهام التي سمحت له بها"}</p>
          {dashboard.canOpenAsOwner ? <form action={openOwnerPortal}><button type="submit" disabled={ownerPending} aria-describedby="owner-entry-help" className={styles.primary}>{ownerPending ? "جارٍ فتح نقطة التشغيل" : "الدخول باسمي"}<ArrowUpLeft aria-hidden="true" /></button></form> : <Link href={loginPath} target="_blank" rel="noopener noreferrer" aria-describedby="owner-entry-help" className={styles.primary}>فتح نقطة التشغيل<ArrowUpLeft aria-hidden="true" /></Link>}
          <small>{dashboard.canOpenAsOwner ? "دخولك بصفتك المالك لا يغيّر حسابات الفريق" : "يفتح رابط الدخول في نافذة جديدة"}</small>
        </div>
      </section>

      <section className={styles.quickActions} aria-label="تجهيز الفريق والدخول">
        <article className={styles.quickAction}><span className={styles.actionIcon}><UserRoundPlus aria-hidden="true" /></span><div><h3>أضف عضوًا لفريقك</h3><p id="add-staff-help">حدد اسمه وجواله ومهامه ليكون له حساب مستقل وتظهر عملياته باسمه</p></div><button type="button" onClick={openAddDialog} disabled={pendingId !== null} aria-describedby="add-staff-help" className={styles.secondary}>إضافة موظف<Plus aria-hidden="true" /></button></article>
        <article className={styles.quickAction}><span className={styles.actionIcon}><ClipboardCopy aria-hidden="true" /></span><div><h3>شارك بوابة الدخول</h3><p id="copy-login-help">انسخ الرابط وأرسله للموظف المسجّل ليفتح بوابته الرابط وحده لا يمنح صلاحية الدخول</p></div><button type="button" onClick={() => void copyLoginLink()} aria-describedby="copy-login-help" className={styles.secondary}>نسخ رابط الدخول<ClipboardCopy aria-hidden="true" /></button></article>
        <article className={`${styles.quickAction} ${styles.whatsappCard}`}><span className={styles.actionIcon}><MessageCircle aria-hidden="true" /></span><div><h3>دخول برمز واتساب</h3><p>بعد إنشاء حساب الموظف تُجدول رسالة ترحيب له يطلب رمز التحقق من صفحة الدخول ويستقبله على جواله المسجّل</p></div><span className={styles.infoLabel}>لا تحتاج تعيين كلمة مرور للحساب الجديد</span></article>
      </section>

      <section className={`${styles.teamPanel} mb-6 rounded-[2rem] bg-white p-4 shadow-sm sm:p-6`} aria-labelledby="operations-team-title">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="operations-team-title" className="flex items-center gap-2 text-xl font-black text-[#311912]"><UsersRound aria-hidden="true" className="h-5 w-5" /> فريق التشغيل</h2>
            <p className="mt-1 text-sm font-bold text-[#806A5E]">{dashboard.cashiers.length} حساب تشغيل راجع المهام والحالة وآخر دخول لكل عضو</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={openAddDialog} disabled={pendingId !== null} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#6B3A25] px-3 text-xs font-black text-white disabled:opacity-60">
              <Plus aria-hidden="true" className="h-4 w-4" /> إضافة موظف
            </button>
          </div>
        </div>
        <div className={styles.teamGuide}><p><strong>تعديل الصلاحيات</strong> يحدد مهام الموظف ومحطته ويحتاج بعدها لتسجيل الدخول مجددًا</p><p><strong>التعطيل والتفعيل</strong> يوقف استخدام حساب الموظف أو يعيده مع الاحتفاظ ببياناته</p></div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-right text-sm">
            <thead className="text-xs font-black text-[#806A5E]">
              <tr className="border-b border-[#EFE6DD]">
                <th scope="col" className="p-3">الموظف</th><th scope="col" className="p-3">طريقة الدخول</th><th scope="col" className="p-3">الجوال</th><th scope="col" className="p-3">الرقم الوظيفي</th><th scope="col" className="p-3">الصلاحيات والمحطة</th><th scope="col" className="p-3">الحالة</th><th scope="col" className="p-3">آخر دخول</th><th scope="col" className="p-3">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.cashiers.map((cashier) => (
                <tr key={cashier.id} className="border-b border-[#F5EFE9] font-bold">
                  <td className="p-3 font-black">{cashier.fullName}{cashier.ownerUserId ? <span className="mt-1 block text-xs text-[#806A5E]">مالك العلامة</span> : null}</td>
                  <td className="p-3 break-all text-[#806A5E]">{cashier.authMethod === "whatsapp_otp" ? "رمز واتساب" : cashier.email}</td>
                  <td className="p-3"><bdi dir="ltr">{cashier.phone || "—"}</bdi></td>
                  <td className="p-3">{cashier.employeeNumber || "—"}</td>
                  <td className="p-3 text-xs">{cashier.canUsePager ? cashier.canUseLoyalty ? "ولاء وبيجر" : "بيجر فقط" : "ولاء فقط"}<span className="mt-1 block text-[#806A5E]">{cashier.pagerStation || "بدون محطة محددة"}</span>{!cashier.ownerUserId ? <button type="button" disabled={pendingId !== null} onClick={() => openPermissions(cashier)} className="mt-2 min-h-11 rounded-xl border border-[#E8DED5] px-3 font-black disabled:opacity-50">تعديل الصلاحيات</button> : null}</td>
                  <td className="p-3"><span className={`rounded-full px-3 py-1 text-xs ${cashier.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}>{cashier.active ? "نشط" : "معطل"}</span></td>
                  <td className="p-3 text-xs text-[#806A5E]">{formatDate(cashier.lastLoginAt)}</td>
                  <td className="p-3">
                    {cashier.ownerUserId ? <span className="text-xs text-[#806A5E]">مرتبط بحساب المالك</span> : <button type="button" disabled={pendingId !== null} onClick={() => void toggleCashier(cashier.id, !cashier.active)} className="min-h-11 rounded-xl bg-[#F8F4EF] px-3 py-2 text-xs font-black text-[#6B3A25] disabled:opacity-50">
                      {pendingId === cashier.id ? "جارٍ الحفظ" : cashier.active ? "تعطيل" : "تفعيل"}
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
                <div className="min-w-0"><h3 className="font-black">{cashier.fullName}</h3>{cashier.ownerUserId ? <p className="mt-1 text-xs font-bold text-[#6B3A25]">مالك العلامة</p> : null}<p className="mt-1 break-all text-xs font-bold text-[#806A5E]">{cashier.authMethod === "whatsapp_otp" ? "الدخول برمز واتساب" : cashier.email}</p></div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${cashier.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-200 text-stone-600"}`}>{cashier.active ? "نشط" : "معطل"}</span>
              </div>
              <p className="mt-3 text-sm font-bold">{cashier.canUsePager ? cashier.canUseLoyalty ? "ولاء وبيجر" : "بيجر فقط" : "ولاء فقط"} {cashier.pagerStation ? `— ${cashier.pagerStation}` : ""}</p>
              {!cashier.ownerUserId ? <button type="button" disabled={pendingId !== null} onClick={() => openPermissions(cashier)} className="mt-2 min-h-11 rounded-xl bg-white px-4 text-sm font-bold disabled:opacity-50">تعديل الصلاحيات والمحطة</button> : null}
              <p className="mt-3 text-xs font-bold text-[#806A5E]">الرقم الوظيفي: {cashier.employeeNumber || "—"}</p>
              <p className="mt-1 text-xs font-bold text-[#806A5E]">الجوال: <bdi dir="ltr">{cashier.phone || "—"}</bdi></p>
              <p className="mt-1 text-xs font-bold text-[#806A5E]">آخر دخول: {formatDate(cashier.lastLoginAt)}</p>
              {cashier.ownerUserId ? <p className="mt-3 text-xs font-bold text-[#806A5E]">مرتبط بحساب المالك</p> : <button type="button" disabled={pendingId !== null} onClick={() => void toggleCashier(cashier.id, !cashier.active)} className="mt-3 min-h-11 w-full rounded-xl bg-white text-xs font-black text-[#6B3A25] disabled:opacity-50">{pendingId === cashier.id ? "جارٍ الحفظ" : cashier.active ? "تعطيل الحساب" : "تفعيل الحساب"}</button>}
            </article>
          ))}
        </div>
        {!dashboard.cashiers.length ? <div className={styles.emptyTeam}><UsersRound aria-hidden="true" /><h3>فريقك يبدأ من أول موظف</h3><p>أضف حسابًا مستقلًا لكل شخص حتى تعرف من نفّذ كل عملية وتمنحه المهام المناسبة</p><button type="button" onClick={openAddDialog} disabled={pendingId !== null} className={styles.primary}>إضافة أول موظف<Plus aria-hidden="true" /></button></div> : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-[2rem] bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-black"><Activity aria-hidden="true" className="h-5 w-5" /> أحدث النشاطات</h2>
          <p className={styles.sectionHint}>آخر خمس عمليات مسجلة مع اسم منفذها ووقتها لمتابعة عمل الفريق</p>
          <div className="mt-4 space-y-3">
            {dashboard.activities.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-start gap-3 rounded-2xl bg-[#F8F4EF] p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div><p className="text-sm font-black">{item.cashierName} — {activityText(item.actionType)}</p><p className="mt-1 text-xs font-bold text-[#806A5E]">{formatDate(item.createdAt)}</p></div>
              </div>
            ))}
            {!dashboard.activities.length ? <p className={styles.emptyActivity}>عندما يبدأ الفريق التشغيل تظهر هنا نشاطات الدخول والولاء والعمليات المسجلة</p> : null}
          </div>
        </section>
        <SoftCard className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-black"><HelpCircle aria-hidden="true" className="h-5 w-5" /> ما الذي تتيحه الصلاحيات</h2>
          <dl className={styles.permissionsGuide}><div><dt>الولاء والمكافآت</dt><dd>قراءة بطاقة العميل وتسجيل الأختام وصرف المكافآت وفق برنامج العلامة</dd></div><div><dt>استدعاء الطلبات</dt><dd>تشغيل البيجر وإدارة الاستدعاءات من المحطة المحددة للموظف</dd></div><div><dt>حساب المالك</dt><dd>مرتبط بحسابك الإداري وتدخل به مباشرة ولا يُعطّل من قائمة الموظفين</dd></div></dl>
          <div className="mt-4 flex items-center gap-2 text-xs font-black text-emerald-700"><ShieldCheck aria-hidden="true" className="h-4 w-4" /> تتطلب الصلاحيات تفعيل الخدمة في باقة العلامة</div>
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
          <div className="flex items-center justify-between gap-3"><h2 id="cashier-dialog-title" className="text-xl font-black">{editingId ? `صلاحيات ${fullName}` : "إضافة موظف تشغيل"}</h2><button type="button" onClick={closeAddDialog} disabled={pendingId === "create"} className="grid min-h-11 min-w-11 place-items-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6B3A25] disabled:opacity-50" aria-label="إغلاق"><X aria-hidden="true" className="h-5 w-5" /></button></div>
          <p id="cashier-dialog-description" className="mt-2 text-sm font-bold leading-6 text-[#806A5E]">{editingId ? "اختر مهام الموظف ومحطة الاستدعاء ستنتهي جلساته الحالية عند حفظ التغييرات" : "أضف اسم الموظف ورقم واتساب وصلاحياته يدخل برمز تحقق يصله على جواله"}</p>
          <form onSubmit={(event) => { event.preventDefault(); void (editingId ? savePermissions() : createCashier()); }}>
            {formError ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{formError}</p> : null}
            <fieldset disabled={pendingId === "create"} className="mt-5 space-y-4 disabled:opacity-60">
              {!editingId ? <>
              <label className="block text-sm font-black">الاسم<input required minLength={2} maxLength={80} value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] px-4 outline-none focus:border-[#6B3A25] focus:ring-2 focus:ring-[#6B3A25]/25" autoComplete="name" /></label>
              <label className="block text-sm font-black">جوال الموظف المرتبط بواتساب<input required type="tel" inputMode="tel" dir="ltr" maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="05xxxxxxxx" aria-describedby="cashier-phone-help" className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] px-4 outline-none focus:border-[#6B3A25] focus:ring-2 focus:ring-[#6B3A25]/25" autoComplete="tel" /><span id="cashier-phone-help" className="mt-1 block text-xs font-bold text-[#806A5E]">رقم سعودي يبدأ بـ ٠٥ أو بمفتاح الدولة ٩٦٦</span></label>
              <label className="block text-sm font-black">الرقم الوظيفي <span className="text-[#806A5E]">(اختياري)</span><input maxLength={40} value={employeeNumber} onChange={(event) => setEmployeeNumber(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] px-4 outline-none focus:border-[#6B3A25] focus:ring-2 focus:ring-[#6B3A25]/25" /></label>
              </> : null}
              <label className="block text-sm font-black">صلاحيات الموظف<select value={permission} onChange={(event) => setPermission(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] bg-white px-4 focus-visible:outline-2 focus-visible:outline-[#6B3A25]">
                <option value="loyalty">الولاء والمكافآت فقط</option><option value="pager">استدعاء الطلبات فقط</option><option value="both">الولاء والمكافآت واستدعاء الطلبات</option>
              </select><span className={styles.fieldHint}>{permission === "loyalty" ? "يقرأ بطاقات العملاء ويسجل الأختام ويصرف المكافآت" : permission === "pager" ? "يشغّل استدعاء الطلبات من دون صلاحية الولاء" : "يجمع بين تشغيل الولاء والمكافآت واستدعاء الطلبات"}</span></label>
              <label className="block text-sm font-black">محطة الاستدعاء <span className="text-[#806A5E]">اختياري</span><input value={station} maxLength={80} onChange={(event) => setStation(event.target.value)} placeholder="الكاشير أو البار أو المطعم الداخلي" className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] px-4 focus-visible:outline-2 focus-visible:outline-[#6B3A25]" /></label>
            </fieldset>
            <button type="submit" disabled={pendingId === "create"} className="mt-6 min-h-12 w-full rounded-2xl bg-[#6B3A25] px-4 font-black text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6B3A25] disabled:opacity-60">{pendingId === "create" ? "جارٍ الحفظ" : editingId ? "حفظ الصلاحيات" : "إنشاء الحساب وإرسال رابط الدخول"}</button>
          </form>
        </dialog>
      ) : null}
      </div>
    </DashboardPageShell>
  );
}
