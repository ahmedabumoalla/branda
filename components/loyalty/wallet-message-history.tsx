"use client";

import { useEffect, useId, useRef, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { messageHistoryPageSchema, messageHistoryPageSize, walletMessageStatus, type MessageHistoryPage, type WalletMessage } from "@/lib/loyalty/message-history";
import s from "./wallet-message-history.module.css";

const number = (value: number) => value.toLocaleString("ar-SA");
const date = (value: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value));
const providerLabels: Record<WalletMessage["apple"], string> = { accepted: "قُبل الطلب", pending: "بانتظار الإرسال", failed: "تعذرت المحاولة", skipped: "لم يُرسل", unknown: "لا توجد نتيجة مسجلة" };

export function WalletMessageList({ data }: { data: MessageHistoryPage }) {
  if (!data.messages.length) return <p className={s.empty}>{data.total ? "لا توجد رسائل في هذه الصفحة ارجع إلى الصفحة السابقة" : "لا توجد رسائل محفوظة حتى الآن ستظهر هنا بعد إرسال أول إعلان"}</p>;
  return <ol className={s.list}>{data.messages.map(message => <li key={message.id} className={s.message}>
    <div className={s.meta}><time dateTime={message.createdAt}>{date(message.createdAt)}</time><span className={s.status}>{walletMessageStatus(message)}</span></div>
    <h3 dir="auto">{message.title}</h3><p className={s.body} dir="auto">{message.body}</p>
    <dl className={s.providers}><div><dt>محفظة أبل</dt><dd>{providerLabels[message.apple]}</dd></div><div><dt>محفظة أندرويد</dt><dd>{providerLabels[message.google]}</dd></div></dl>
    <p className={s.updated}>آخر تحديث للحالة <time dateTime={message.updatedAt}>{date(message.updatedAt)}</time></p>
  </li>)}</ol>;
}

export function WalletMessageHistory({ brandId, brandName, dark = false }: { brandId?: string; brandName: string; dark?: boolean }) {
  const headingId = useId();
  const [data, setData] = useState<MessageHistoryPage | null>(null);
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const pendingPage = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (brandId) params.set("brandId", brandId);
        const response = await fetch(`/api/loyalty/messages?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("History unavailable");
        const result = messageHistoryPageSchema.parse(await response.json());
        if (!controller.signal.aborted) setData(result);
      } catch { if (!controller.signal.aborted) setError("تعذر تحميل السجل تحقق من اتصالك وصلاحية دخولك ثم أعد المحاولة"); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void load();
    return () => controller.abort();
  }, [brandId, page, reload]);
  function navigate(next: number) {
    pendingPage.current = next;
    setBusy(true); setError(""); setPage(next); setReload(value => value + 1);
  }
  return <section className={`${s.history} ${dark ? s.dark : ""}`} aria-labelledby={headingId} dir="rtl">
    <header className={s.heading}><div><h2 id={headingId}><History size={20} aria-hidden="true" />سجل الرسائل</h2><p>{brandName} <span aria-hidden="true">—</span> جميع الرسائل المحفوظة من الأحدث إلى الأقدم</p></div><button type="button" disabled={busy} onClick={() => navigate(0)}><RefreshCw size={16} aria-hidden="true" />تحديث السجل</button></header>
    <p className={s.note}>الرسالة الواحدة قد تُرسل لعدة عملاء عدد الرسائل هنا يختلف عن مرات الإرسال للعملاء في التقرير ويشمل كامل السجل</p>
    <div aria-live="polite" aria-busy={busy}>
      {busy && <p className={s.feedback} role="status">جارٍ تحميل سجل الرسائل</p>}
      {error && <div className={s.feedback} role="alert"><p>{error}</p><button type="button" onClick={() => navigate(pendingPage.current)}>إعادة المحاولة</button></div>}
      {!busy && !error && data && <><p className={s.total}>عدد الرسائل <strong>{number(data.total)}</strong></p><WalletMessageList data={data} /></>}
    </div>
    {data && <nav className={s.pagination} aria-label="صفحات سجل الرسائل"><button type="button" disabled={busy || data.page === 0} onClick={() => navigate(data.page - 1)}>السابق</button><span>صفحة {number(data.page + 1)} من {number(Math.max(1, Math.ceil(data.total / messageHistoryPageSize)))}</span><button type="button" disabled={busy || (data.page + 1) * messageHistoryPageSize >= data.total} onClick={() => navigate(data.page + 1)}>التالي</button></nav>}
    <p className={s.note}>الحالة توضّح قبول طلب الإرسال لدى خدمة المحفظة ولا تؤكد وصول الإشعار أو قراءته</p>
  </section>;
}
