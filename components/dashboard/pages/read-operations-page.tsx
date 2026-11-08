"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList, RefreshCw, RotateCcw } from "lucide-react";
import { loadOwnerLoyaltyReadsAction, retryOwnerLoyaltyReadsAction } from "@/app/actions/loyalty-read-operations";
import type { getOwnerLoyaltyReads } from "@/lib/data/loyalty-read-operations";
import styles from "./read-operations-page.module.css";

type ReadData = Awaited<ReturnType<typeof getOwnerLoyaltyReads>>;
type ReadStatus = ReadData["items"][number]["status"];
const statusLabels: Record<ReadStatus, string> = {
  pending: "بانتظار المزامنة",
  processing: "جاري تسجيل الختم",
  succeeded: "تم تسجيل الختم",
  failed: "تعذرت المزامنة",
  needs_review: "تحتاج مراجعة",
  duplicate: "عملية مكررة لم يُضف ختم",
};
const statusOrder: ReadStatus[] = ["pending", "processing", "succeeded", "failed", "needs_review", "duplicate"];
const invitationLabels: Record<string, string> = {
  queued: "قُبل طلب الإرسال", pending: "بانتظار الإرسال", processing: "جاري الإرسال", dispatching: "جاري الإرسال", expired: "انتهت مهلة الإرسال",
  sent: "تم الإرسال", delivered: "تم التسليم", failed: "تعذر الإرسال", rejected: "تعذر الإرسال",
  unknown: "لم يتأكد الإرسال", skipped: "لم يُرسل",
};
const dateFormat = new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" });

function formatDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return dateFormat.format(new Date(value));
}

export function ReadOperationsPage({ initialData, initialError = "" }: { initialData: ReadData | null; initialError?: string }) {
  const [data, setData] = useState(initialData);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [polls, setPolls] = useState(0);
  const [visible, setVisible] = useState(true);
  const inFlight = useRef(false);
  const requestVersion = useRef(0);
  const hasPending = Boolean(data && (data.counts.pending + data.counts.processing > 0));
  const page = data?.page ?? 1;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize || 25)));

  const refresh = useCallback(async (targetPage: number, targetStatus: string, quiet = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const version = ++requestVersion.current;
    setBusy(true);
    if (!quiet) { setNotice(""); setPolls(0); }
    setError("");
    try {
      const result = await loadOwnerLoyaltyReadsAction({ page: targetPage, status: targetStatus || undefined });
      if (version !== requestVersion.current) return;
      if (!result.ok) { setError(result.message); return; }
      setData(result.data);
      setStatus(targetStatus);
    } catch {
      if (version === requestVersion.current) setError("تعذر تحديث السجل تحقق من الاتصال وحاول مجددًا");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      const active = document.visibilityState === "visible";
      setVisible(active);
      if (active) setPolls(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!hasPending || !visible || busy || error || polls >= 12) return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== "visible") { setVisible(false); return; }
      setPolls((count) => count + 1);
      void refresh(page, status, true);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [hasPending, visible, busy, error, polls, page, status, refresh]);

  async function retryFailed() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      // The server selects only eligible failed records in this owner's brand,
      // retaining their original request IDs and excluding permanent failures.
      const result = await retryOwnerLoyaltyReadsAction();
      if (!result.ok) { setError(result.message); return; }
      setNotice(result.retried > 0
        ? `أعيدت جدولة ${result.retried} عملية للمزامنة ستظهر نتيجة تسجيل الأختام بعد المعالجة`
        : "لا توجد عمليات فاشلة قابلة للمزامنة حاليًا");
      const refreshed = await loadOwnerLoyaltyReadsAction({ page, status: status || undefined });
      if (refreshed.ok) setData(refreshed.data);
      else setError(refreshed.message);
      setPolls(0);
    } catch {
      setError("تعذر تأكيد طلب المزامنة حدّث السجل للتحقق من حالة العمليات");
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <section dir="rtl" className={styles.workspace} aria-labelledby="read-operations-title">
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>الولاء والمكافآت</span><h1 id="read-operations-title">سجل عمليات القراءة</h1>
        <p>تابع تسجيل الأختام من الكاشير ونتيجة مزامنتها لكل عملية</p></div>
      <button type="button" className={styles.secondary} disabled={busy} onClick={() => void refresh(page, status)}><RefreshCw size={17} aria-hidden="true" />{busy ? "جاري التحديث" : "تحديث السجل"}</button>
    </header>

    <dl className={styles.summary} aria-label="ملخص جميع عمليات القراءة">
      {statusOrder.map((key) => <div key={key} data-status={key}><dt>{statusLabels[key]}</dt><dd>{data ? data.counts[key] : "—"}</dd></div>)}
    </dl>

    <div className={styles.retryPanel}>
      <div><h2>استكمال العمليات الفاشلة</h2><p>تعاد محاولة الأخطاء القابلة للمزامنة بنفس العملية لمنع تكرار الختم</p>
        <small>تُستثنى العمليات الناجحة والمكررة والبيانات غير الصحيحة أو المحظورة والعمليات التي تحتاج مراجعة</small></div>
      <button type="button" className={styles.primary} disabled={busy || !data || data.counts.retryable === 0} onClick={() => void retryFailed()}><RotateCcw size={17} aria-hidden="true" />مزامنة العمليات الفاشلة</button>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div role="status" aria-live="polite" aria-atomic="true">{notice && <p className={styles.notice}>{notice}</p>}</div>

    <div className={styles.logPanel} aria-busy={busy}>
      <div className={styles.toolbar}>
        <label htmlFor="read-status-filter">حالة العملية<select id="read-status-filter" value={status} disabled={busy} onChange={(event) => void refresh(1, event.target.value)}>
          <option value="">جميع الحالات</option>{statusOrder.map((key) => <option key={key} value={key}>{statusLabels[key]}</option>)}
        </select></label>
        <p>{error ? "التحديث التلقائي متوقف حدّث السجل للمحاولة مجددًا" : hasPending ? polls >= 12 ? "توقف التحديث التلقائي اضغط تحديث السجل للمتابعة" : "يتحدث السجل تلقائيًا أثناء المزامنة" : "تظهر هنا العمليات التي وصلت إلى النظام"}<small>الوقت بتوقيت السعودية</small></p>
      </div>
      {!data ? <div className={styles.empty}><ClipboardList aria-hidden="true" /><h2>السجل غير متاح الآن</h2><p>اضغط تحديث السجل لإعادة تحميل العمليات</p></div>
        : data.items.length === 0 ? <div className={styles.empty}><ClipboardList aria-hidden="true" /><h2>{status ? "لا توجد عمليات بهذه الحالة" : "لم تصل عمليات قراءة بعد"}</h2><p>تظهر العمليات بعد تسجيلها من الكاشير ووصولها إلى النظام</p></div>
          : <div className={styles.tableScroll} role="region" aria-label="تفاصيل عمليات القراءة" tabIndex={0}><table>
            <caption className={styles.srOnly}>عمليات تسجيل الختم وحالة المزامنة</caption>
            <thead><tr><th scope="col">الوقت والكاشير</th><th scope="col">العميل والقراءة</th><th scope="col">الحالة</th><th scope="col">التفاصيل</th><th scope="col">المحاولات</th></tr></thead>
            <tbody>{data.items.map((item) => <tr key={item.requestId}>
              <td><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time><small>{item.cashierName || "غير متاح"}</small></td>
              <td><strong>{item.customerName || "لم يُحدد العميل بعد"}</strong><small><bdi dir="ltr">{item.identifierHint}</bdi></small></td>
              <td><span className={styles.badge} data-status={item.status}>{statusLabels[item.status]}</span>{item.completedAt && <small>آخر معالجة {formatDate(item.completedAt)}</small>}</td>
              <td><p>{item.errorMessage || (item.status === "succeeded" ? "تم حفظ الختم في بطاقة العميل" : item.status === "duplicate" ? "لم يُسجل ختم إضافي لهذه القراءة" : item.status === "pending" || item.status === "processing" ? "لم يتأكد تسجيل الختم بعد" : "راجع بيانات العملية قبل المحاولة مجددًا")}</p>
                {item.status === "failed" && <small>{item.retryable ? "قابلة لإعادة المزامنة" : "لا تعاد تلقائيًا وتحتاج مراجعة"}</small>}
                {item.cardCreated && <small>أُنشئت بطاقة ولاء جديدة</small>}
                {item.invitationStatus && <small>رابط البطاقة: {invitationLabels[item.invitationStatus] ?? "قيد التحقق"}{["failed", "rejected", "unknown", "expired"].includes(item.invitationStatus) ? " ولا يؤثر ذلك على نتيجة الختم" : ""}</small>}
                {(item.rewardIssued || (item.availableRewards ?? 0) > 0) && <span className={styles.reward}>{item.rewardIssued ? "صدرت مكافأة مع هذه العملية" : `مكافآت متاحة عند المعالجة: ${item.availableRewards}`}</span>}</td>
              <td className={styles.attempts}>{item.attempts}</td>
            </tr>)}</tbody>
          </table></div>}
      <footer className={styles.pagination}>
        <span>{data ? `${data.total} عملية` : "—"} <span aria-hidden="true">/</span> الصفحة {page} من {pageCount}</span>
        <div><button type="button" className={styles.secondary} disabled={busy || page <= 1} onClick={() => void refresh(page - 1, status)}>السابق</button><button type="button" className={styles.secondary} disabled={busy || page >= pageCount} onClick={() => void refresh(page + 1, status)}>التالي</button></div>
      </footer>
    </div>
  </section>;
}
