"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { BellRing, CheckCheck, ChevronLeft, ChevronRight, LoaderCircle, Maximize2, MessageCircle, PictureInPicture2, Plus, RefreshCw, Search, Users } from "lucide-react";
import { createPagerOrderAction, fetchPagerPageAction, updatePagerOrderAction } from "@/app/actions/pager";
import { logoutCashierAction } from "@/app/actions/cashier";
import type { PagerContext, PagerPage } from "@/lib/pager/types";
import { PagerOrderCard } from "./pager-order-card";
import { isPagerCompanion, pagerPictureInPicture, preparePagerDialog, preparePagerWindow, setPagerWindowLanguage } from "./pager-pip";
import styles from "./pager.module.css";
import { CashierLanguageSwitch, useCashierLanguage } from "@/components/cashier/cashier-language";
import type { CashierMessage } from "@/lib/cashier/language";

export function PagerConsole({ context, initialPage, mode = "staff" }: { context: PagerContext; initialPage: PagerPage; mode?: "owner" | "staff" }) {
  const { t, errorText, locale, dir } = useCashierLanguage();
  const [data, setData] = useState(initialPage);
  const [view, setView] = useState<"active" | "all">("active");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [invoice, setInvoice] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<CashierMessage>("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pipNode, setPipNode] = useState<HTMLElement | null>(null);
  const [pipSupported, setPipSupported] = useState(false);
  const [pipOpening, setPipOpening] = useState(false);
  const [inlineCompact, setInlineCompact] = useState(false);
  const [nativeCompact, setNativeCompact] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const compactButtonRef = useRef<HTMLButtonElement>(null);
  const opening = useRef(false);
  const invoiceRef = useRef<HTMLInputElement>(null);
  const pipWindow = useRef<Window | null>(null);
  const pipCleanup = useRef<(() => void) | null>(null);
  const requestSequence = useRef(0);
  const mutation = useRef(false);
  const createAttempt = useRef<{ id: string; invoiceNumber: string; phone: string } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    setPipSupported(Boolean(pagerPictureInPicture()));
    setNativeCompact(isPagerCompanion());
    return () => { mounted.current = false; requestSequence.current++; pipCleanup.current?.(); pipWindow.current?.close(); };
  }, []);

  useEffect(() => {
    if (pipNode && pipWindow.current) setPagerWindowLanguage(pipWindow.current, locale);
  }, [locale, pipNode]);

  useEffect(() => {
    if (!inlineCompact || !dialogRef.current) return;
    const cleanup = preparePagerDialog(dialogRef.current);
    return () => {
      cleanup();
      window.setTimeout(() => compactButtonRef.current?.focus({ preventScroll: true }), 0);
    };
  }, [inlineCompact]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(query); setPage(0); }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const refresh = useCallback(async (showLoading = false) => {
    const sequence = ++requestSequence.current;
    if (showLoading) setLoading(true);
    try {
      const result = await fetchPagerPageAction({ page, status: view, query: search }, mode);
      if (mounted.current && sequence === requestSequence.current) { setData(result); setError(""); }
    } catch {
      if (mounted.current && sequence === requestSequence.current) setError("تعذر تحديث الطلبات تحقق من الاتصال أو أعد تسجيل الدخول ثم حاول مجددًا");
    } finally {
      if (mounted.current && sequence === requestSequence.current) setLoading(false);
    }
  }, [mode, page, search, view]);

  useEffect(() => {
    void refresh(true);
    const poll = () => {
      const foreground = document.visibilityState === "visible" || (pipWindow.current && !pipWindow.current.closed);
      if (foreground && navigator.onLine && !mutation.current) void refresh();
    };
    const timer = window.setInterval(poll, 10000);
    window.addEventListener("online", poll);
    document.addEventListener("visibilitychange", poll);
    return () => { window.clearInterval(timer); window.removeEventListener("online", poll); document.removeEventListener("visibilitychange", poll); requestSequence.current++; };
  }, [refresh]);

  async function addOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError(""); setNotice(""); requestSequence.current++;
    // Retain the same id across uncertain network retries to prevent duplicate orders
    if (!createAttempt.current || createAttempt.current.invoiceNumber !== invoice || createAttempt.current.phone !== phone) {
      createAttempt.current = { id: crypto.randomUUID(), invoiceNumber: invoice, phone };
    }
    try {
      const result = await createPagerOrderAction(createAttempt.current, mode);
      if (!result.ok) { setError(result.error); return; }
      createAttempt.current = null; setInvoice(""); setPhone("");
      setNotice({ text: "أضيفت الفاتورة {invoice} إلى قائمة التجهيز", values: { invoice: result.order.invoiceNumber } });
      if (view !== "active" || page !== 0 || query) { setView("active"); setPage(0); setQuery(""); setSearch(""); }
      await refresh();
    } catch { setError("تعذر تأكيد الإضافة حاول مرة أخرى بنفس البيانات لتجنب تكرار الطلب"); }
    finally { mutation.current = false; setBusy(false); window.setTimeout(() => invoiceRef.current?.focus(), 0); }
  }

  async function changeOrder(id: string, status: "ready" | "received" | "cancelled") {
    if (mutation.current) return;
    const activeWindow = pipWindow.current && !pipWindow.current.closed ? pipWindow.current : window;
    if (status === "cancelled" && !activeWindow.confirm(t("إلغاء هذا الطلب وإيقاف تنبيهاته؟"))) return;
    mutation.current = true; requestSequence.current++; setBusy(true); setError(""); setNotice("");
    try {
      const result = await updatePagerOrderAction(id, status, mode);
      if (!result.ok) { setError(result.error); return; }
      setNotice(status === "ready" ? "تم الاستدعاء وبدأت تنبيهات الجاهزية" : status === "received" ? "تم تأكيد الاستلام وإيقاف التذكير" : "ألغي الطلب وتوقفت تنبيهاته");
      await refresh();
    } catch { setError("تعذر تأكيد تغيير الحالة حدث القائمة ثم حاول مرة أخرى"); }
    finally { mutation.current = false; setBusy(false); }
  }

  async function openCompact() {
    const api = pagerPictureInPicture();
    if (!api) { setError("النافذة فوق التطبيقات تحتاج تطبيق نداء برندة على هذا الجهاز افتح رابط التطبيق"); return; }
    if (pipWindow.current && !pipWindow.current.closed) { pipWindow.current.focus(); return; }
    if (opening.current) return;
    opening.current = true;
    setPipOpening(true);
    try {
      const child = await api.requestWindow({ width: 440, height: 690 });
      if (!mounted.current) { child.close(); return; }
      pipWindow.current = child;
      const close = () => { pipCleanup.current?.(); pipCleanup.current = null; pipWindow.current = null; if (mounted.current) { setPipNode(null); window.setTimeout(() => invoiceRef.current?.focus(), 0); } };
      const escape = (event: KeyboardEvent) => { if (event.key === "Escape") child.close(); };
      child.addEventListener("pagehide", close, { once: true });
      child.addEventListener("keydown", escape);
      pipCleanup.current = () => { child.removeEventListener("pagehide", close); child.removeEventListener("keydown", escape); };
      setPipNode(preparePagerWindow(child));
      child.setTimeout(() => invoiceRef.current?.focus(), 100);
    } catch {
      pipWindow.current?.close();
      if (mounted.current) setError("تعذر فتح النافذة الخارجية تحقق من صلاحيات المتصفح أو استخدم تطبيق نداء برندة");
    }
    finally { opening.current = false; if (mounted.current) setPipOpening(false); }
  }

  const compact = Boolean(pipNode) || inlineCompact || nativeCompact;
  const closeCompact = () => { if (pipNode) pipWindow.current?.close(); else setInlineCompact(false); };
  const content = <section data-pager-console dir={dir} lang={locale} className={`${styles.root} ${compact ? styles.compact : mode === "staff" ? styles.standalone : ""}`}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>{context.cafeName}</p><h1 className={styles.title}>{t("نداء برندة")} </h1><p className={styles.muted}>{context.actorName}{context.station ? ` — ${context.station}` : ""}</p></div>
      <div className={styles.tools}>
        <CashierLanguageSwitch />
        {!nativeCompact && (compact ? <button type="button" className={styles.secondary} onClick={closeCompact}><Maximize2 size={17} aria-hidden="true" />{t("إرجاع للصفحة")} </button>
          : <><button ref={compactButtonRef} type="button" className={styles.button} onClick={() => void openCompact()} disabled={pipOpening}><PictureInPicture2 size={18} aria-hidden="true" />{pipOpening ? t("جار الفتح") : t("نافذة فوق التطبيقات")}</button><button type="button" className={styles.secondary} onClick={() => setInlineCompact(true)}>{t("عرض مصغر داخل الصفحة")} </button></>)}
        {!nativeCompact && <Link className={styles.secondary} href="/pager/download">{t("تطبيق النافذة العائمة")} </Link>}
        {!compact && mode === "owner" && <Link className={styles.secondary} href="/dashboard/cashier"><Users size={17} aria-hidden="true" />{t("الفريق والصلاحيات")} </Link>}
        {!compact && mode === "staff" && context.canUseLoyalty && <Link className={styles.secondary} href="/cashier">{t("قارئ الولاء")} </Link>}
        {!compact && mode === "staff" && <form action={logoutCashierAction}><button className={styles.secondary} type="submit">{t("تسجيل الخروج")} </button></form>}
      </div>
    </header>
    {!pipNode && !nativeCompact && <div className={styles.notice}>{inlineCompact ? t("هذا عرض مصغر داخل الصفحة وللعمل فوق التطبيقات افتح تطبيق النافذة العائمة") : pipSupported ? t("افتح نافذة فوق التطبيقات واترك صفحة المتصفح مفتوحة أو استخدم تطبيق نداء برندة المستقل") : t("للظهور فوق الكاشير على أندرويد أو الماك نزّل تطبيق النافذة العائمة وسجّل الدخول بحسابك")}</div>}
    <div className={styles.metrics}>
      <div className={styles.metric}><span>{t("قيد التجهيز")} </span><strong>{data.metrics.waiting}</strong></div>
      <div className={styles.metric}><span>{t("بانتظار الاستلام")} </span><strong>{data.metrics.ready}</strong></div>
      <div className={styles.metric}><span>{t("تم الاستلام")} </span><strong>{data.metrics.received}</strong></div>
      <div className={styles.metric}><span>{t("إجمالي الفواتير")} </span><strong>{data.metrics.total}</strong></div>
    </div>
    {error && <div className={styles.error} role="alert">{errorText(error)}</div>}
    {notice && <div className={styles.success} role="status">{t(notice)}</div>}
    <div className={styles.layout}>
      <aside className={styles.entry}>
        <h2>{t("أضف طلبًا جديدًا")} </h2>
        <form data-pager-entry onSubmit={addOrder}>
          <label className={styles.label}>{t("رقم الفاتورة")} <input ref={invoiceRef} className={styles.input} name="invoiceNumber" value={invoice} onChange={(e) => setInvoice(e.target.value)} required maxLength={120} autoComplete="off" placeholder={t("كما يظهر في نظام الفواتير")} dir="auto" disabled={busy} /></label>
          <label className={styles.label}>{t("رقم جوال العميل")} <input className={styles.input} name="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={20} autoComplete="off" placeholder="05xxxxxxxx" dir="ltr" disabled={busy} /></label>
          <button className={styles.button} type="submit" disabled={busy}>{busy ? <LoaderCircle size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}{t("إضافة الفاتورة")} </button>
          <p className={styles.hint}>{t("أبلغ العميل أنه سيستقبل تنبيه الطلب على واتساب")} </p>
        </form>
        <div className={styles.entryNote}><MessageCircle size={18} aria-hidden="true" /><p className={styles.hint}>{t("تبدأ الرسائل عند الضغط على الطلب جاهز وتتكرر كل دقيقة حتى تم الاستلام ثم يرسل طلب التقييم")} </p></div>
      </aside>
      <div>
        <div className={styles.toolbar}>
          <div className={styles.tabs} aria-label={t("عرض الطلبات")}><button className={styles.tab} aria-pressed={view === "active"} onClick={() => { setView("active"); setPage(0); }}>{t("الحالية")} </button><button className={styles.tab} aria-pressed={view === "all"} onClick={() => { setView("all"); setPage(0); }}>{t("السجل")} </button></div>
          <label className={styles.search}><span className="sr-only">{t("البحث برقم الفاتورة أو الجوال")} </span><input className={styles.input} value={query} maxLength={120} onChange={(e) => setQuery(e.target.value)} placeholder={t("رقم الفاتورة أو الجوال")} /><Search size={18} aria-hidden="true" /></label>
          <button type="button" className={styles.secondary} disabled={loading || busy} onClick={() => void refresh(true)} aria-label={t("تحديث الطلبات")}><RefreshCw size={17} aria-hidden="true" /></button>
        </div>
        <div aria-busy={loading}>
          {data.orders.length ? <div className={styles.queue}>{data.orders.map((order) => <PagerOrderCard key={order.id} order={order} busy={busy} onChange={(id, status) => void changeOrder(id, status)} />)}</div>
            : <div className={styles.empty}><CheckCheck size={35} aria-hidden="true" /><h2>{loading ? t("جار تحميل الطلبات") : search ? t("لا توجد نتائج مطابقة") : view === "active" ? t("كل الطلبات تحت السيطرة") : t("يبدأ السجل بأول فاتورة")}</h2><p className={styles.muted}>{search ? t("جرب رقم الفاتورة كاملًا أو رقم الجوال") : t("أضف رقم الفاتورة والجوال وسيظهر الطلب هنا لكل أفراد الفريق")}</p></div>}
        </div>
        {data.total > data.pageSize && <nav className={styles.pagination} aria-label={t("صفحات الطلبات")}><button className={styles.secondary} disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)}><ChevronRight size={16} aria-hidden="true" />{t("السابق")} </button><span>{page + 1} {t("من")} {Math.ceil(data.total / data.pageSize)}</span><button className={styles.secondary} disabled={(page + 1) * data.pageSize >= data.total || loading} onClick={() => setPage((value) => value + 1)}>{t("التالي")} <ChevronLeft size={16} aria-hidden="true" /></button></nav>}
        <p className={styles.hint}>{t("المتابعة مشتركة بين أفراد الفريق وتتحدث تلقائيًا")} </p>
      </div>
    </div>
  </section>;

  if (inlineCompact) return <dialog ref={dialogRef} className={styles.compactDialog} dir={dir} lang={locale} aria-label={t("نداء برندة في نافذة مصغرة")} onCancel={(event) => { event.preventDefault(); setInlineCompact(false); }} onClose={() => setInlineCompact(false)}>{content}</dialog>;
  return pipNode ? <><section className={`${styles.root} ${styles.standalone}`} dir={dir} lang={locale}><div className={styles.empty}><BellRing size={36} aria-hidden="true" /><h1 className={styles.title}>{t("النداء يعمل في النافذة المصغرة")} </h1><p className={styles.muted}>{t("اترك هذه الصفحة مفتوحة أثناء العمل في تطبيق الكاشير")} </p><button type="button" className={styles.button} onClick={() => pipWindow.current?.close()}>{t("إرجاع لوحة النداء هنا")} </button></div></section>{createPortal(content, pipNode)}</> : content;
}
