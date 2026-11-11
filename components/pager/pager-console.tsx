"use client";

import Link from "next/link";
import { StaffScreenLink } from "@/components/cashier/staff-screen-link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, BellRing, CheckCheck, ChevronLeft, ChevronRight, LoaderCircle, Maximize2, Menu, PictureInPicture2, Plus, RefreshCw, Search, Users, X } from "lucide-react";
import { createPagerOrderAction, fetchPagerPageAction, updatePagerOrderAction } from "@/app/actions/pager";
import { logoutCashierAction } from "@/app/actions/cashier";
import type { PagerContext, PagerPage } from "@/lib/pager/types";
import { PagerOrderCard } from "./pager-order-card";
import { pagerTheme } from "./pager-theme";
import { isPagerCompanion, pagerPictureInPicture, preparePagerDialog, preparePagerWindow, setPagerWindowLanguage } from "./pager-pip";
import styles from "./pager.module.css";
import { CashierLanguageSwitch, useCashierLanguage } from "@/components/cashier/cashier-language";
import type { CashierMessage } from "@/lib/cashier/language";

export function PagerConsole({ context, initialPage, mode = "staff" }: { context: PagerContext; initialPage: PagerPage; mode?: "owner" | "staff" }) {
  const { t, errorText, locale, dir } = useCashierLanguage();
  const [data, setData] = useState(initialPage);
  const [view, setView] = useState<"waiting" | "ready" | "all">("waiting");
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
  const compactButtonRef = useRef<HTMLElement>(null);
  const opening = useRef(false);
  const invoiceRef = useRef<HTMLInputElement>(null);
  const pipWindow = useRef<Window | null>(null);
  const pipCleanup = useRef<(() => void) | null>(null);
  const requestSequence = useRef(0);
  const mutation = useRef(false);
  const createAttempt = useRef<{ id: string; invoiceNumber: string; phone: string } | null>(null);
  const mounted = useRef(true);
  const readyDialogRef = useRef<HTMLDialogElement>(null);
  const readyButtonRef = useRef<HTMLButtonElement>(null);
  const readyOpen = view === "ready";
  const restoreCompactFocus = useCallback(() => compactButtonRef.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(() => {
      if (!mounted.current) return;
      setPipSupported(Boolean(pagerPictureInPicture()));
      setNativeCompact(isPagerCompanion());
    });
    return () => {
      mounted.current = false; requestSequence.current++; pipCleanup.current?.(); pipWindow.current?.close();
      pipCleanup.current = null; pipWindow.current = null; setPipNode(null);
    };
  }, []);

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
    if (!readyOpen || !readyDialogRef.current) return;
    const trigger = readyButtonRef.current;
    const cleanup = preparePagerDialog(readyDialogRef.current);
    return () => {
      cleanup();
      window.setTimeout(() => trigger?.focus({ preventScroll: true }), 0);
    };
  }, [readyOpen, pipNode, inlineCompact]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(query); setPage(0); }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const refresh = useCallback(async (showLoading = false) => {
    const sequence = ++requestSequence.current;
    if (showLoading) setLoading(true);
    try {
      const result = await fetchPagerPageAction({ page, status: view, query: search }, mode);
      if (mounted.current && sequence === requestSequence.current) {
        setData(current => JSON.stringify(current) === JSON.stringify(result) ? current : result); setError("");
        if (page > 0 && !result.orders.length) setPage(Math.max(0, Math.ceil(result.total / result.pageSize) - 1));
      }
    } catch {
      if (mounted.current && sequence === requestSequence.current) setError("تعذر تحديث الطلبات تحقق من الاتصال أو أعد تسجيل الدخول ثم حاول مجددًا");
    } finally {
      if (mounted.current && sequence === requestSequence.current) setLoading(false);
    }
  }, [mode, page, search, view]);

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
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("online", poll); document.removeEventListener("visibilitychange", poll); requestSequence.current++; };
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
      if (view !== "waiting" || page !== 0 || query) { setView("waiting"); setPage(0); setQuery(""); setSearch(""); }
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
      setNotice(status === "ready" ? view === "ready" ? "الاستدعاء مفعّل والتذكير مستمر كل دقيقة حتى الاستلام" : "تم الاستدعاء وبدأت تنبيهات الجاهزية" : status === "received" ? "تم تأكيد الاستلام وإيقاف التذكير" : "ألغي الطلب وتوقفت تنبيهاته");
      await refresh();
      if (status === "ready" && view !== "ready") selectView("ready");
    } catch { setError("تعذر تأكيد تغيير الحالة حدث القائمة ثم حاول مرة أخرى"); }
    finally { mutation.current = false; setBusy(false); }
  }

  function selectView(next: "waiting" | "ready" | "all") {
    if (next === view) { void refresh(true); return; }
    requestSequence.current++;
    setView(next); setPage(0); setQuery(""); setSearch(""); setLoading(true);
    setData(current => ({ ...current, orders: [], total: 0 }));
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
  const orders = data.orders.filter(order => view === "all" || order.status === view);
  const queue = <>
    <div className={styles.toolbar}>
      {!readyOpen && <button type="button" className={styles.historyButton} aria-pressed={view === "all"} disabled={busy} onClick={() => selectView(view === "all" ? "waiting" : "all")}>{t(view === "all" ? "الحالية" : "السجل")}</button>}
      <label className={styles.search}><span className="sr-only">{t("البحث برقم الفاتورة أو الجوال")}</span><input className={styles.input} value={query} disabled={busy} maxLength={120} onChange={(e) => setQuery(e.target.value)} placeholder={t("رقم الفاتورة أو الجوال")} /><Search size={18} aria-hidden="true" /></label>
      <button type="button" className={styles.secondary} disabled={loading || busy} onClick={() => void refresh(true)} aria-label={t("تحديث الطلبات")}><RefreshCw size={17} aria-hidden="true" /></button>
    </div>
    <div className={styles.queueScroll} aria-busy={loading}>
      {orders.length ? <div className={styles.queue}>{orders.map(order => <PagerOrderCard key={order.id} order={order} busy={busy || loading} compact onChange={(id, status) => void changeOrder(id, status)} />)}</div>
        : <div className={styles.empty}><CheckCheck size={25} aria-hidden="true" /><h2>{loading ? t("جار تحميل الطلبات") : search ? t("لا توجد نتائج مطابقة") : readyOpen ? t("لا توجد طلبات جاهزة الآن") : view === "waiting" ? t("لا توجد طلبات قيد التجهيز") : t("يبدأ السجل بأول فاتورة")}</h2><p className={styles.muted}>{search ? t("جرب رقم الفاتورة كاملًا أو رقم الجوال") : readyOpen ? t("عند تجهيز الطلب اضغط استدعاء ليظهر هنا") : t("أضف رقم الفاتورة والجوال لبدء الطلب")}</p></div>}
    </div>
    {data.total > data.pageSize && <nav className={styles.pagination} aria-label={t("صفحات الطلبات")}><button type="button" className={styles.secondary} disabled={page === 0 || loading || busy} onClick={() => setPage(value => value - 1)}><ChevronRight size={16} aria-hidden="true" />{t("السابق")}</button><span>{page + 1} {t("من")} {Math.ceil(data.total / data.pageSize)}</span><button type="button" className={styles.secondary} disabled={(page + 1) * data.pageSize >= data.total || loading || busy} onClick={() => setPage(value => value + 1)}>{t("التالي")}<ChevronLeft size={16} aria-hidden="true" /></button></nav>}
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
      <h2>{t("أضف طلبًا جديدًا")}</h2>
      <form data-pager-entry onSubmit={addOrder}>
        <label className={styles.label}>{t("رقم الفاتورة")}<input ref={invoiceRef} className={styles.input} name="invoiceNumber" value={invoice} onChange={e => setInvoice(e.target.value)} required maxLength={120} autoComplete="off" placeholder={t("رقم الفاتورة")} dir="auto" disabled={busy} /></label>
        <label className={styles.label}>{t("رقم جوال العميل")}<input className={styles.input} name="phone" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} required maxLength={20} autoComplete="off" placeholder="05xxxxxxxx" dir="ltr" disabled={busy} /></label>
        <button className={styles.button} type="submit" disabled={busy}>{busy ? <LoaderCircle size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}{t("إضافة الفاتورة")}</button>
      </form>
      <p className={styles.hint}>{t("أبلغ العميل أنه سيستقبل تنبيه الطلب على واتساب")}</p>
    </section>
    <div className={styles.queueNav}>
      <button type="button" className={styles.secondary} aria-pressed={view === "waiting"} disabled={busy} onClick={() => selectView("waiting")}>{t("قيد التجهيز")}<strong>{data.metrics.waiting}</strong></button>
      <button ref={readyButtonRef} type="button" className={styles.readyButton} aria-haspopup="dialog" disabled={busy} onClick={() => selectView("ready")}><BellRing size={20} aria-hidden="true" />{t("جاهز للاستلام")}<strong>{data.metrics.ready}</strong></button>
    </div>
    {!readyOpen && <>{alerts}{queue}</>}
    <p className={styles.footerHint}>{t("المتابعة مشتركة بين أفراد الفريق وتتحدث تلقائيًا")}</p>
    {readyOpen && <dialog ref={readyDialogRef} className={styles.readyDialog} dir={dir} lang={locale} aria-labelledby="pager-ready-title" onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!busy) selectView("waiting"); }} onClose={event => { event.stopPropagation(); if (readyOpen) selectView("waiting"); }}>
      <header className={styles.dialogHeader}><div><h2 id="pager-ready-title">{t("جاهز للاستلام")} <span>{data.metrics.ready}</span></h2><p className={styles.hint}>{t("اضغط تم الاستلام عندما يأخذ العميل طلبه")}</p></div><button data-pager-initial-focus type="button" className={styles.secondary} disabled={busy} onClick={() => selectView("waiting")} aria-label={t("إغلاق")}><X size={20} aria-hidden="true" /></button></header>
      {alerts}{queue}
      <p className={styles.footerHint}>{t("التذكير كل دقيقة حتى تأكيد الاستلام")}</p>
    </dialog>}
  </section>;

  if (inlineCompact) return <dialog ref={dialogRef} className={styles.compactDialog} dir={dir} lang={locale} aria-label={t("نداء برندة في نافذة مصغرة")} onCancel={(event) => { event.preventDefault(); setInlineCompact(false); }} onClose={() => setInlineCompact(false)}>{content}</dialog>;
  return pipNode ? <><section className={`${styles.root} ${styles.standalone}`} dir={dir} lang={locale}><div className={styles.empty}><BellRing size={36} aria-hidden="true" /><h1 className={styles.title}>{t("النداء يعمل في النافذة المصغرة")} </h1><p className={styles.muted}>{t("اترك هذه الصفحة مفتوحة أثناء العمل في تطبيق الكاشير")} </p><button type="button" className={styles.button} onClick={() => pipWindow.current?.close()}>{t("إرجاع لوحة النداء هنا")} </button></div></section>{createPortal(content, pipNode)}</> : content;
}
