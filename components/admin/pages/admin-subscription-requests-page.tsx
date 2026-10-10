"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronLeft, ChevronRight, ExternalLink, Receipt, RefreshCw, ShieldCheck, X } from "lucide-react";
import { fetchSubscriptionRequestPageAction, reviewSubscriptionRequestAction } from "@/app/actions/subscription-requests";
import type { SubscriptionRequestFilter, SubscriptionRequestPage } from "@/lib/platform/subscription";
import { formatSubscriptionDuration } from "@/lib/platform/subscription-durations";
import s from "./admin-subscription-requests-page.module.css";

const number = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });
const filters: { value: SubscriptionRequestFilter; label: string }[] = [
  { value: "pending_review", label: "بانتظار الاعتماد" }, { value: "awaiting_receipt", label: "بانتظار الإيصال" },
  { value: "approved", label: "المعتمدة" }, { value: "closed", label: "الملغية" }, { value: "all", label: "جميع الطلبات" },
];
const statuses: Record<string, string> = { pending_review: "بانتظار الاعتماد", awaiting_receipt: "بانتظار الإيصال", approved: "تم تفعيل الباقة", rejected: "ملغي بعد الرفض", cancelled: "ملغي" };
const date = (value: string) => new Date(value).toLocaleString("ar-SA", { calendar: "gregory", timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
type Decision = { requestId: string; kind: "approve" | "reject" };

export function AdminSubscriptionRequestsPage({ initialData, configError }: { initialData: SubscriptionRequestPage; configError?: string }) {
  const [data, setData] = useState(initialData);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(Boolean(configError));
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(configError ? { error: true, text: configError } : null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const lock = useRef(false);

  const refresh = useCallback(async (page: number, filter: SubscriptionRequestFilter, quiet = false) => {
    if (lock.current) return;
    lock.current = true; setBusy("refresh");
    if (!quiet) { setNotice(null); setDecision(null); }
    try {
      const result = await fetchSubscriptionRequestPageAction({ page, filter });
      if (!result.ok) { setLoadError(true); setNotice({ error: true, text: result.message }); return; }
      setData(result.data); setLoadError(false);
      if (!quiet) setNotice({ error: false, text: "تم تحديث قائمة الطلبات" });
    } catch { setLoadError(true); setNotice({ error: true, text: "تعذر تحديث الطلبات حاول مجددًا" }); }
    finally { lock.current = false; setBusy(null); }
  }, []);

  useEffect(() => {
    const update = () => { if (document.visibilityState === "visible" && !decision) void refresh(data.page, data.filter, true); };
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, [data.page, data.filter, decision, refresh]);

  function choose(requestId: string, kind: Decision["kind"]) {
    if (lock.current || loadError) return;
    setDecision({ requestId, kind }); setReason(""); setNotice(null);
  }

  async function review() {
    if (!decision || lock.current || loadError) return;
    lock.current = true; setBusy(decision.requestId); setNotice(null);
    try {
      const result = await reviewSubscriptionRequestAction({ requestId: decision.requestId, decision: decision.kind, reason });
      if (!result.ok) { setLoadError(true); setNotice({ error: true, text: result.message }); return; }
      setData(current => ({ ...current, requests: current.requests.map(request => request.id === result.data.requestId ? { ...request, status: result.data.status, adminResponse: result.data.status === "rejected" ? reason || "تم إلغاء الطلب بعد رفض تفعيل الباقة" : request.adminResponse } : request) }));
      setDecision(null); setReason("");
      const success = result.data.status === "approved" ? "تم اعتماد الطلب وتفعيل الباقة للعميل مباشرة" : "تم رفض تفعيل الباقة وإلغاء الطلب";
      setNotice({ error: false, text: success });
      // A refresh failure must not report the completed decision as a failed mutation
      try {
        const updated = await fetchSubscriptionRequestPageAction({ page: data.page, filter: data.filter });
        if (updated.ok) { setData(updated.data); setLoadError(false); }
        else { setLoadError(true); setNotice({ error: true, text: `${success} لكن تعذر تحديث القائمة اضغط تحديث الطلبات` }); }
      } catch { setLoadError(true); setNotice({ error: true, text: `${success} لكن تعذر تحديث القائمة اضغط تحديث الطلبات` }); }
    } catch { setLoadError(true); setNotice({ error: true, text: "تعذر الاتصال حدّث القائمة للتحقق من حالة الطلب قبل المحاولة مجددًا" }); }
    finally { lock.current = false; setBusy(null); }
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return <div className={s.page} dir="rtl">
    <header className={s.header}><div><span className={s.eyebrow}>مراجعة الاشتراكات</span><h1>طلبات الاشتراك في الباقات</h1><p>كل تفاصيل الطلب أمامك من التحويل إلى تفعيل الباقة</p></div><button className={s.secondary} type="button" disabled={Boolean(busy)} onClick={() => refresh(data.page, data.filter)}><RefreshCw size={17} aria-hidden="true" />{busy === "refresh" ? "جارٍ التحديث" : "تحديث الطلبات"}</button></header>
    <div className={s.guide}><ShieldCheck size={23} aria-hidden="true" /><div><strong>قرارك يحدّث اشتراك العميل مباشرة</strong><p>الاعتماد يفعّل الباقة بالمدة والمبلغ المسجلين والرفض يلغي الطلب دون تفعيل الباقة</p></div><span>تحديث تلقائي كل ٣٠ ثانية</span></div>
    {notice ? <p className={notice.error ? s.error : s.success} role={notice.error ? "alert" : "status"}>{notice.text}</p> : null}
    <section className={s.registry} aria-label="طلبات الاشتراك">
      <div className={s.toolbar}><div className={s.filters} role="group" aria-label="تصفية الطلبات حسب الحالة">{filters.map(filter => <button key={filter.value} type="button" aria-pressed={data.filter === filter.value} disabled={Boolean(busy)} onClick={() => refresh(0, filter.value)}>{filter.label}</button>)}</div><span className={s.count}>{loadError ? "تعذر تحديث العدد" : `${number.format(data.total)} طلب`}</span></div>
      <div className={s.requests} aria-busy={Boolean(busy)}>
        {data.requests.map(request => {
          const pending = request.status === "pending_review";
          const open = pending || request.status === "awaiting_receipt";
          const confirming = decision?.requestId === request.id;
          return <article key={request.id} className={s.request} aria-label={`طلب ${request.cafeName} ${request.planName}`}>
            <div className={s.requestHeader}><div className={s.brand}><span className={s.brandIcon}><Building2 size={22} aria-hidden="true" /></span><div><h2>{request.cafeName || "علامة تجارية"}</h2>{request.cafeSlug ? <span dir="ltr">{request.cafeSlug}</span> : null}</div></div><span className={s.status} data-status={request.status}>{statuses[request.status] ?? "حالة غير معروفة"}</span></div>
            <div className={s.details}>
              <div className={s.brandDetails}><h3>تفاصيل العلامة والطلب</h3><dl><div><dt>المسؤول</dt><dd>{request.ownerName || "غير مسجل"}</dd></div><div><dt>رقم الجوال</dt><dd><bdi>{request.ownerPhone || "غير مسجل"}</bdi></dd></div><div><dt>البريد الإلكتروني</dt><dd><bdi>{request.ownerEmail || "غير مسجل"}</bdi></dd></div><div><dt>تاريخ الطلب</dt><dd><time dateTime={request.createdAt}>{date(request.createdAt)}</time></dd></div></dl><details className={s.identifiers}><summary>معرّفات الطلب والعلامة</summary><span>رقم الطلب <bdi>{request.id}</bdi></span><span>رقم العلامة <bdi>{request.cafeId}</bdi></span></details></div>
              <div className={s.pricing}><h3>{request.planName}</h3><span className={s.duration}>{request.durationUnit === "month" ? formatSubscriptionDuration(request.durationCount) : `${number.format(request.durationCount)} ${request.durationUnit === "year" ? "سنة" : "يوم"}`}</span><strong className={s.amount}>{number.format(request.amount)} <small>ر.س</small></strong><span>المبلغ المطلوب شامل الضريبة</span>{request.baseAmount > request.amount ? <p>إجمالي الخصم <b>{number.format(request.baseAmount - request.amount)} ر.س</b></p> : null}{request.couponCode ? <p>الكوبون <bdi>{request.couponCode}</bdi></p> : null}</div>
              <div className={s.receipt}><Receipt size={25} aria-hidden="true" /><h3>إيصال الدفع</h3><p>{request.paymentMethod === "bank_transfer" ? "تحويل بنكي" : "طريقة الدفع المسجلة"}</p>{request.receiptUrl ? <><a className={s.secondary} href={request.receiptUrl} target="_blank" rel="noopener noreferrer">عرض الإيصال<ExternalLink size={16} aria-hidden="true" /></a><small>إذا انتهت صلاحية الرابط حدّث الطلبات</small></> : <p className={s.receiptHint}>{request.receiptChannel === "whatsapp" ? "أرسل العميل الإيصال عبر واتساب تحقق من استلامه والتحويل قبل الاعتماد" : request.receiptStoragePath ? "تعذر فتح الإيصال حدّث الطلبات لإعادة المحاولة" : "لم يرفق العميل إيصالًا بعد"}</p>}</div>
            </div>
            {request.adminResponse ? <p className={s.response}><strong>ملاحظة الإدارة</strong> {request.adminResponse}</p> : null}
            {open ? <div className={s.actions}><span>{pending ? "راجع المبلغ والإيصال قبل اعتماد الاشتراك" : "يمكن اعتماد الطلب بعد إرسال العميل للإيصال"}</span><button className={s.approve} type="button" disabled={Boolean(busy) || loadError || !pending || (!request.receiptUrl && request.receiptChannel !== "whatsapp")} onClick={() => choose(request.id, "approve")}><Check size={17} aria-hidden="true" />اعتماد وتفعيل الباقة</button><button className={s.reject} type="button" disabled={Boolean(busy) || loadError} onClick={() => choose(request.id, "reject")}><X size={17} aria-hidden="true" />رفض وإلغاء الطلب</button></div> : null}
            {confirming ? <fieldset className={s.confirmation} disabled={Boolean(busy)}><legend>{decision.kind === "approve" ? "تأكيد اعتماد الاشتراك" : "تأكيد إلغاء الطلب"}</legend><p>{decision.kind === "approve" ? `سيتم تفعيل ${request.planName} لعلامة ${request.cafeName} بعد اعتماد مبلغ ${number.format(request.amount)} ر.س` : "سيلغى هذا الطلب ولن تتفعّل الباقة ويمكن للعميل تقديم طلب جديد"}</p>{decision.kind === "reject" ? <label>سبب الرفض <span>اختياري ويظهر للعميل</span><textarea maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)} /></label> : <p>تأكد من مطابقة الإيصال واستلام التحويل</p>}<div><button type="button" className={decision.kind === "approve" ? s.approve : s.reject} onClick={review}>{busy === request.id ? "جارٍ تنفيذ القرار" : decision.kind === "approve" ? "تأكيد الاعتماد والتفعيل" : "تأكيد الرفض والإلغاء"}</button><button type="button" className={s.secondary} onClick={() => setDecision(null)}>تراجع</button></div></fieldset> : null}
          </article>;
        })}
        {!data.requests.length ? <div className={s.empty}><Receipt size={34} aria-hidden="true" /><h2>{loadError ? "تعذر عرض الطلبات" : "لا توجد طلبات في هذا القسم"}</h2><p>{loadError ? "حدّث القائمة للمحاولة مجددًا" : "ستظهر الطلبات الجديدة هنا تلقائيًا ويمكنك استعراض بقية الحالات"}</p></div> : null}
      </div>
      <footer className={s.pagination}><span>صفحة {number.format(data.page + 1)} من {number.format(totalPages)}</span><div><button className={s.secondary} disabled={Boolean(busy) || data.page === 0} onClick={() => refresh(data.page - 1, data.filter)}><ChevronRight size={16} aria-hidden="true" />السابق</button><button className={s.secondary} disabled={Boolean(busy) || data.page + 1 >= totalPages} onClick={() => refresh(data.page + 1, data.filter)}>التالي<ChevronLeft size={16} aria-hidden="true" /></button></div></footer>
    </section>
  </div>;
}
