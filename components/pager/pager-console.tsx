"use client";

import Link from "next/link";
import { StaffScreenLink } from "@/components/cashier/staff-screen-link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, BellRing, CheckCheck, ChevronLeft, ChevronRight, LoaderCircle, Maximize2, Menu, PictureInPicture2, Plus, RefreshCw, Search, Users } from "lucide-react";
import { createPagerOrderAction, fetchPagerPageAction, updatePagerOrderAction } from "@/app/actions/pager";
import { logoutCashierAction } from "@/app/actions/cashier";
import type { PagerContext, PagerPage } from "@/lib/pager/types";
import { PagerOrderCard } from "./pager-order-card";
import { pagerTheme } from "./pager-theme";
import { isPagerCompanion, pagerPictureInPicture, preparePagerDialog, preparePagerWindow, setPagerWindowLanguage } from "./pager-pip";
import styles from "./pager.module.css";
import { CashierLanguageSwitch, useCashierLanguage } from "@/components/cashier/cashier-language";
import type { CashierMessage } from "@/lib/cashier/language";

export const pagerActions = { fetchPage: fetchPagerPageAction, createOrder: createPagerOrderAction, updateOrder: updatePagerOrderAction };

export function PagerConsole({ context, initialPage, mode = "staff", actions = pagerActions }: { context: PagerContext; initialPage: PagerPage; mode?: "owner" | "staff"; actions?: typeof pagerActions }) {
  const { t, errorText, locale, dir } = useCashierLanguage();
  const [data, setData] = useState(() => ({ ...initialPage, orders: initialPage.orders.filter(order => order.status === "waiting"), total: initialPage.metrics.waiting }));
  const [calledData, setCalledData] = useState(() => ({ ...initialPage, orders: initialPage.orders.filter(order => order.status === "ready"), total: initialPage.metrics.ready }));
  const [view, setView] = useState<"active" | "all">("active");
  const [page, setPage] = useState(0);
  const [calledPage, setCalledPage] = useState(0);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [invoice, setInvoice] = useState("");
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
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
  const compactButtonRef = useRef<HTMLElement>(null);
  const opening = useRef(false);
  const invoiceRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const pipWindow = useRef<Window | null>(null);
  const pipCleanup = useRef<(() => void) | null>(null);
  const requestSequence = useRef(0);
  const mutation = useRef(false);
  const createAttempt = useRef<{ id: string; invoiceNumber: string; phone: string; customerName: string } | null>(null);
  const mounted = useRef(true);
  const readyOpen = view === "active";
  const restoreCompactFocus = useCallback(() => compactButtonRef.current?.focus({ preventScroll: true }), []);
  const invalidateRequests = useCallback(() => { requestSequence.current++; }, []);
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(() => {
      if (!mounted.current) return;
      setPipSupported(Boolean(pagerPictureInPicture()));
      setNativeCompact(isPagerCompanion());
    });
    return () => {
      mounted.current = false; invalidateRequests(); pipCleanup.current?.(); pipWindow.current?.close();
      pipCleanup.current = null; pipWindow.current = null; setPipNode(null);
    };
  }, [invalidateRequests]);

  useEffect(() => {
    if (pipNode && pipWindow.current) setPagerWindowLanguage(pipWindow.current, locale);
  }, [locale, pipNode]);

  useEffect(() => {
    if (!inlineCompact || !dialogRef.current) return;
    const cleanup = preparePagerDialog(dialogRef.current);
    return () => {
      cleanup();
      window.setTimeout(restoreCompactFocus, 0);
    };
  }, [inlineCompact, restoreCompactFocus]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(query); setPage(0); setCalledPage(0); }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const refresh = useCallback(async (showLoading = false) => {
    const sequence = ++requestSequence.current;
    if (showLoading) setLoading(true);
    try {
      const [result, called] = await Promise.all([
        actions.fetchPage({ page, status: view === "active" ? "waiting" : "all", query: search }, mode),
        view === "active" ? actions.fetchPage({ page: calledPage, status: "ready", query: search }, mode) : Promise.resolve(null),
      ]);
      if (mounted.current && sequence === requestSequence.current) {
        setData(current => JSON.stringify(current) === JSON.stringify(result) ? current : result); setError("");
        if (called) {
          setCalledData(current => JSON.stringify(current) === JSON.stringify(called) ? current : called);
          if (calledPage > 0 && !called.orders.length) setCalledPage(Math.max(0, Math.ceil(called.total / called.pageSize) - 1));
        }
        if (page > 0 && !result.orders.length) setPage(Math.max(0, Math.ceil(result.total / result.pageSize) - 1));
      }
    } catch {
      if (mounted.current && sequence === requestSequence.current) setError("تعذر تحديث الطلبات تحقق من الاتصال أو أعد تسجيل الدخول ثم حاول مجددًا");
    } finally {
      if (mounted.current && sequence === requestSequence.current) setLoading(false);
    }
  }, [actions, mode, page, calledPage, search, view]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) void refresh(); });
    const poll = () => {
      const foreground = document.visibilityState === "visible" || (pipWindow.current && !pipWindow.current.closed);
      if (foreground && navigator.onLine && !mutation.current) void refresh();
    };
    const timer = window.setInterval(poll, 10000);
    window.addEventListener("online", poll);
    document.addEventListener("visibilitychange", poll);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("online", poll); document.removeEventListener("visibilitychange", poll); invalidateRequests(); };
  }, [refresh, invalidateRequests]);

  async function addOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError(""); setNotice(""); requestSequence.current++;
    // Retain the same id across uncertain network retries to prevent duplicate orders
    if (!createAttempt.current || createAttempt.current.invoiceNumber !== invoice || createAttempt.current.phone !== phone) {
      createAttempt.current = { id: crypto.randomUUID(), invoiceNumber: invoice, phone, customerName };
    }
    try {
      createAttempt.current.customerName = customerName;
      const result = await actions.createOrder(createAttempt.current, mode);
      if (!result.ok) { setError(result.error); return; }
      createAttempt.current = null; setInvoice(""); setPhone(""); setCustomerName("");
      setNotice({ text: "أضيفت الفاتورة {invoice} إلى قائمة الاستلام", values: { invoice: result.order.invoiceNumber } });
      if (view !== "active" || page !== 0 || calledPage !== 0 || query) {
        requestSequence.current++; setView("active"); setPage(0); setCalledPage(0); setQuery(""); setSearch("");
        setData(current => ({ ...current, orders: [result.order], total: current.metrics.waiting + 1 }));
      } else await refresh();
    } catch { setError("تعذر تأكيد الإضافة حاول مرة أخرى بنفس البيانات لتجنب تكرار الطلب"); }
    finally { mutation.current = false; setBusy(false); window.setTimeout(() => invoiceRef.current?.focus(), 0); }
  }

  async function changeOrder(id: string, status: "ready" | "received" | "cancelled") {
    if (mutation.current) return;
    const activeWindow = pipWindow.current && !pipWindow.current.closed ? pipWindow.current : window;
    if (status === "cancelled" && !activeWindow.confirm(t("إلغاء هذا الطلب وإيقاف تنبيهاته؟"))) return;
    mutation.current = true; requestSequence.current++; setBusy(true); setError(""); setNotice("");
    try {
      const result = await actions.updateOrder(id, status, mode);
      if (!result.ok) { setError(result.error); return; }
      setNotice(status === "ready" ? "تم تسجيل الاستدعاء تابع حالة الرسالة على الطلب" : status === "received" ? "تم تأكيد الاستلام وإيقاف التذكير" : "ألغي الطلب وتوقفت تنبيهاته");
      await refresh();
      if (status === "ready" && view !== "active") selectView("active");
    } catch { setError("تعذر تأكيد تغيير الحالة حدث القائمة ثم حاول مرة أخرى"); }
    finally { mutation.current = false; setBusy(false); }
  }

  function selectView(next: "active" | "all") {
    if (next === view) { void refresh(true); return; }
    requestSequence.current++;
    setView(next); setPage(0); setCalledPage(0); setQuery(""); setSearch(""); setLoading(true);
    setData(current => ({ ...current, orders: [], total: 0 }));
    setCalledData(current => ({ ...current, orders: [], total: 0 }));
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
      const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented && !child.document?.querySelector("dialog[open]")) child.close(); };
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
  const alerts = <>{error && <div className={styles.error} role="alert">{errorText(error)}</div>}{notice && <div className={styles.success} role="status">{t(notice)}</div>}</>;
  const renderOrders = (result: PagerPage) => result.orders.map(order => <PagerOrderCard key={order.id} order={order} busy={busy || loading} compact onChange={(id, status) => void changeOrder(id, status)} />);
  const pagination = (result: PagerPage, current: number, change: (page: number) => void, label: string) => result.total > result.pageSize && <nav className={styles.pagination} aria-label={t(label)}><button type="button" className={styles.secondary} disabled={current === 0 || loading || busy} onClick={() => change(current - 1)}><ChevronRight size={16} aria-hidden="true" />{t("السابق")}</button><span>{current + 1} {t("من")} {Math.ceil(result.total / result.pageSize)}</span><button type="button" className={styles.secondary} disabled={(current + 1) * result.pageSize >= result.total || loading || busy} onClick={() => change(current + 1)}>{t("التالي")}<ChevronLeft size={16} aria-hidden="true" /></button></nav>;
  const empty = (title: string, description: string) => <div className={styles.empty}><CheckCheck size={25} aria-hidden="true" /><h3>{loading ? t("جار تحميل الطلبات") : search ? t("لا توجد نتائج مطابقة") : t(title)}</h3><p className={styles.muted}>{t(search ? "جرب رقم الفاتورة كاملًا أو رقم الجوال" : description)}</p></div>;
  const queue = <>
    <div className={styles.toolbar}>
      <div className={styles.tabs} aria-label={t("عرض الطلبات")}><button type="button" className={styles.tab} aria-pressed={readyOpen} disabled={busy} onClick={() => selectView("active")}>{t("الطلبات الحالية")}</button><button type="button" className={styles.tab} aria-pressed={!readyOpen} disabled={busy} onClick={() => selectView("all")}>{t("السجل")}</button></div>
      <label className={styles.search}><span className="sr-only">{t("البحث برقم الفاتورة أو الجوال")}</span><input className={styles.input} value={query} disabled={busy} maxLength={120} onChange={(e) => setQuery(e.target.value)} placeholder={t("رقم الفاتورة أو الجوال")} /><Search size={18} aria-hidden="true" /></label>
      <button type="button" className={styles.secondary} disabled={loading || busy} onClick={() => void refresh(true)} aria-label={t("تحديث الطلبات")}><RefreshCw size={17} aria-hidden="true" /></button>
    </div>
    <div className={styles.board} aria-busy={loading}>
      {readyOpen ? <>
        <section className={styles.lane} aria-label={t("بانتظار الاستدعاء")}>
          <header className={styles.laneHeading}><div><h2><BellRing size={18} aria-hidden="true" />{t("بانتظار الاستدعاء")}</h2><p>{t("عندما يجهز الطلب اضغط استدعاء")}</p></div><strong>{data.total}</strong></header>
          <div className={styles.laneOrders}>{data.orders.length ? renderOrders(data) : empty("لا توجد طلبات بانتظار الاستدعاء", "أضف الفاتورة والجوال من الأعلى")}</div>
          {pagination(data, page, setPage, "صفحات بانتظار الاستدعاء")}
        </section>
        <section className={`${styles.lane} ${styles.calledLane}`} aria-label={t("بانتظار الاستلام")}>
          <header className={styles.laneHeading}><div><h2><CheckCheck size={18} aria-hidden="true" />{t("بانتظار الاستلام")}</h2><p>{t("أكد الاستلام عند تسليم الطلب للعميل")}</p></div><strong>{calledData.total}</strong></header>
          <div className={styles.laneOrders}>{calledData.orders.length ? renderOrders(calledData) : empty("لا توجد طلبات بانتظار الاستلام", "تنتقل الطلبات هنا بعد الاستدعاء")}</div>
          {pagination(calledData, calledPage, setCalledPage, "صفحات بانتظار الاستلام")}
        </section>
      </> : <section className={styles.historyLane} aria-label={t("السجل")}><div className={styles.queue}>{data.orders.length ? renderOrders(data) : empty("يبدأ السجل بأول فاتورة", "أضف الفاتورة والجوال من الأعلى")}</div>{pagination(data, page, setPage, "صفحات الطلبات")}</section>}
    </div>
  </>;
  const content = <section data-pager-console dir={dir} lang={locale} style={pagerTheme(context.colors)} className={`${styles.root} ${compact ? styles.compact : mode === "staff" ? styles.standalone : ""} ${styles.console}`}>
    <header className={styles.header}>
      <div className={styles.brandHeading}><h1 className={styles.title}>{t("نداء برندة")}</h1><p className={styles.eyebrow}>{context.cafeName}</p></div>
      <details className={styles.options} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; compactButtonRef.current?.focus(); } }}>
        <summary ref={compactButtonRef} className={styles.secondary}><Menu size={18} aria-hidden="true" />{t("الخيارات")}</summary>
        <div className={styles.optionsPanel}>
          <p className={styles.muted}>{context.actorName}{context.station ? ` — ${context.station}` : ""}</p>
          <CashierLanguageSwitch />
          {!nativeCompact && (compact ? <button type="button" className={styles.secondary} onClick={closeCompact}><Maximize2 size={17} aria-hidden="true" />{t("إرجاع للصفحة")}</button>
            : <><button type="button" className={styles.secondary} onClick={() => void openCompact()} disabled={pipOpening}><PictureInPicture2 size={18} aria-hidden="true" />{pipOpening ? t("جار الفتح") : t("نافذة فوق التطبيقات")}</button><button type="button" className={styles.secondary} onClick={() => setInlineCompact(true)}>{t("عرض مصغر داخل الصفحة")}</button></>)}
          {!nativeCompact && <Link className={styles.secondary} href="/pager/download">{t("تطبيق النافذة العائمة")}</Link>}
          {mode === "owner" && <Link className={styles.secondary} href="/dashboard/cashier"><Users size={17} aria-hidden="true" />{t("الفريق والصلاحيات")}</Link>}
          {mode === "staff" && <form action={logoutCashierAction}><button className={styles.secondary} type="submit">{t("تسجيل الخروج")}</button></form>}
          {!pipNode && !nativeCompact && <p className={styles.hint}>{pipSupported ? t("افتح نافذة فوق التطبيقات واترك صفحة المتصفح مفتوحة أو استخدم تطبيق نداء برندة المستقل") : t("للظهور فوق الكاشير على أندرويد أو الماك نزّل تطبيق النافذة العائمة وسجّل الدخول بحسابك")}</p>}
          <p className={styles.hint}>{t("تم الاستلام")} {data.metrics.received} / {t("إجمالي الفواتير")} {data.metrics.total}</p>
        </div>
      </details>
      {context.canUseLoyalty && <StaffScreenLink className={`${styles.secondary} ${styles.loyaltyReturn}`} href={mode === "owner" ? "/dashboard/loyalty" : "/cashier"}><ArrowRight size={18} aria-hidden="true" />{t("الرجوع للولاء")}</StaffScreenLink>}
    </header>
    <section className={styles.entry} aria-label={t("أضف طلبًا جديدًا")}>
      <div className={styles.entryHeading}><h2>{t("أضف طلبًا جديدًا")}</h2><span>{t("الفاتورة والجوال ثم إضافة")}</span></div>
      <form data-pager-entry onSubmit={addOrder}>
        <label className={styles.label}>{t("رقم الفاتورة")}<input ref={invoiceRef} className={styles.input} name="invoiceNumber" value={invoice} onChange={e => setInvoice(e.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); phoneRef.current?.focus(); } }} required maxLength={120} autoComplete="off" placeholder={t("رقم الفاتورة")} dir="auto" disabled={busy} /></label>
        <label className={styles.label}>{t("رقم جوال العميل")}<input ref={phoneRef} className={styles.input} name="phone" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} required maxLength={20} autoComplete="off" placeholder="05xxxxxxxx" dir="ltr" disabled={busy} /></label>
        <label className={styles.label}>{t("اسم العميل اختياري")}<input className={styles.input} name="customerName" value={customerName} onChange={event=>setCustomerName(event.target.value)} maxLength={120} autoComplete="off" dir="auto" disabled={busy} /></label>
        <button className={styles.button} type="submit" disabled={busy}>{busy ? <LoaderCircle size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}{t("إضافة الفاتورة")}</button>
      </form>
      <p className={styles.hint}>{t("أبلغ العميل أنه سيستقبل تنبيه الطلب على واتساب")}</p>
    </section>
    {alerts}
    {queue}
    <p className={styles.footerHint}>{t("المتابعة مشتركة بين أفراد الفريق وتتحدث تلقائيًا")}</p>
  </section>;

  if (inlineCompact) return <dialog ref={dialogRef} className={styles.compactDialog} dir={dir} lang={locale} aria-label={t("نداء برندة في نافذة مصغرة")} onCancel={(event) => { event.preventDefault(); setInlineCompact(false); }} onClose={() => setInlineCompact(false)}>{content}</dialog>;
  return pipNode ? <><section className={`${styles.root} ${styles.standalone}`} dir={dir} lang={locale}><div className={styles.empty}><BellRing size={36} aria-hidden="true" /><h1 className={styles.title}>{t("النداء يعمل في النافذة المصغرة")} </h1><p className={styles.muted}>{t("اترك هذه الصفحة مفتوحة أثناء العمل في تطبيق الكاشير")} </p><button type="button" className={styles.button} onClick={() => pipWindow.current?.close()}>{t("إرجاع لوحة النداء هنا")} </button></div></section>{createPortal(content, pipNode)}</> : content;
}
