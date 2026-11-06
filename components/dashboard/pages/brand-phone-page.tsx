"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCheck, QrCode, RefreshCw, Smartphone } from "lucide-react";
import { DashboardPageShell } from "@/components/ui/design-system";
import { campaignQrSource, parseCampaignRecipients } from "@/components/marketing-campaigns/campaign-form";
import type { BrandWhatsAppAction, BrandWhatsAppDashboard, BrandWhatsAppResult } from "@/lib/whatsapp/brand-connection-types";
import styles from "./brand-phone-page.module.css";

type ApiResult = { ok: boolean; data?: BrandWhatsAppResult };
const labels: Record<string, string> = { disconnected: "غير متصل", provisioning: "جارٍ تجهيز الاتصال", pairing: "بانتظار مسح الرمز", connected: "متصل", mismatch: "الرقم المرتبط مختلف", uncertain: "جارٍ التحقق من الاتصال", error: "تعذر الاتصال", disconnecting: "جارٍ فصل الرقم" };
const transitional = ["provisioning", "pairing", "uncertain", "disconnecting"];

export function BrandPhonePage({ initialDashboard }: { initialDashboard: BrandWhatsAppDashboard | null }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [phone, setPhone] = useState(initialDashboard?.connection?.phone ?? "");
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrWaiting, setQrWaiting] = useState(false);
  const [error, setError] = useState(initialDashboard ? "" : "تعذر تحميل حالة الرقم أعد المحاولة");
  const [notice, setNotice] = useState("");
  const [disconnectReview, setDisconnectReview] = useState(false);
  const intent = useRef<{ started: number; lastQr: number; received: boolean } | null>(null);
  const mounted = useRef(true);
  const sequence = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const mutation = useRef(false);
  const authorizationLost = useRef(false);
  const reviewRef = useRef<HTMLDivElement>(null);

  const expireQrIntent = useCallback(() => {
    if (!intent.current || Date.now() - intent.current.started < 300000) return false;
    intent.current = null; setQr(null); setQrWaiting(false);
    setNotice("انتهت مهلة الربط اطلب رمزًا جديدًا عندما تكون جاهزًا");
    return true;
  }, []);

  const request = useCallback(async (action?: BrandWhatsAppAction, quiet = false): Promise<BrandWhatsAppResult | null> => {
    if (mutation.current || (quiet && pending.current) || (authorizationLost.current && action)) return null;
    if (!quiet) { mutation.current = true; setBusy(true); setError(""); setNotice(""); }
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const current = ++sequence.current;
    const qrAttempt = action?.action === "qr" ? intent.current : null;
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch("/api/brand-whatsapp", { method: action ? "POST" : "GET", headers: action ? { "Content-Type": "application/json" } : undefined, body: action ? JSON.stringify(action) : undefined, cache: "no-store", signal: controller.signal });
      if (!mounted.current || current !== sequence.current) return null;
      if (response.status === 401 || response.status === 403) {
        authorizationLost.current = true; intent.current = null;
        setQr(null); setQrWaiting(false); setDashboard(null); setDisconnectReview(false);
        setError("تعذر التحقق من صلاحية الحساب سجّل الدخول ثم أعد المحاولة");
        return null;
      }
      const result = await response.json() as ApiResult;
      if (!mounted.current || current !== sequence.current) return null;
      if (action?.action === "qr" && (expireQrIntent() || !qrAttempt || intent.current !== qrAttempt)) return null;
      if (!response.ok || !result.ok || !result.data?.dashboard) {
        if (action?.action === "qr" && response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) { intent.current = null; setQr(null); setQrWaiting(false); }
        throw new Error("request_failed");
      }
      authorizationLost.current = false;
      const data = result.data;
      setDashboard(data.dashboard);
      if (data.dashboard.connection) setPhone(data.dashboard.connection.phone);
      if (data.dashboard.connection?.status === "pairing" && intent.current) {
        if (data.qr !== undefined) {
          const source = campaignQrSource(data.qr);
          setQr(source);
          if (source) { intent.current.received = true; setQrWaiting(false); }
        }
        if (data.qrStatus === "error" || data.qrStatus === "passkeyRequired") {
          intent.current = null; setQr(null); setQrWaiting(false);
          setNotice(data.qrStatus === "passkeyRequired" ? "افتح واتساب على جوالك وأكمل التأكيد الإضافي ثم أعد طلب الرمز" : "تعذر تجهيز رمز الربط الآن أعد طلبه بعد قليل");
        } else if (data.qrStatus === "alreadyLogged") {
          intent.current = null; setQr(null); setQrWaiting(false);
          setNotice("تم مسح الرمز جارٍ التحقق من رقم العلامة");
        }
      } else {
        setQr(null);
        if (!transitional.includes(data.dashboard.connection?.status ?? "")) { intent.current = null; setQrWaiting(false); }
      }
      setError("");
      return data;
    } catch {
      if (mounted.current && current === sequence.current) {
        if (action?.action === "qr" && expireQrIntent()) return null;
        setError(controller.signal.aborted ? "استغرق الطلب وقتًا طويلًا تحقق من الاتصال وأعد المحاولة" : "تعذر إتمام الطلب تحقق من الاتصال وأعد المحاولة");
        if (action?.action === "qr" && intent.current) setQrWaiting(!intent.current.received);
      }
      return null;
    } finally {
      window.clearTimeout(timeout);
      if (current === sequence.current) {
        pending.current = null; mutation.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  }, [expireQrIntent]);

  const status = dashboard?.connection?.status ?? "disconnected";
  const configured = Boolean(dashboard?.configured);
  useEffect(() => {
    mounted.current = true;
    const lifecycleSequence = sequence;
    return () => { mounted.current = false; intent.current = null; lifecycleSequence.current++; pending.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!configured) return;
    let ticks = 0;
    const poll = () => {
      if (authorizationLost.current) return;
      expireQrIntent();
      if (document.visibilityState !== "visible" || !navigator.onLine || mutation.current) return;
      ticks++;
      if (intent.current && status === "pairing" && Date.now() - intent.current.lastQr >= (intent.current.received ? 20000 : 5000)) {
        intent.current.lastQr = Date.now(); void request({ action: "qr" }, true);
      } else if (transitional.includes(status) || (status === "connected" && ticks % 3 === 0)) void request({ action: "refresh" }, true);
    };
    const interval = window.setInterval(poll, 5000);
    const foreground = () => { if (document.visibilityState === "visible" && navigator.onLine) poll(); };
    window.addEventListener("online", foreground);
    document.addEventListener("visibilitychange", foreground);
    return () => { window.clearInterval(interval); window.removeEventListener("online", foreground); document.removeEventListener("visibilitychange", foreground); };
  }, [configured, status, request, expireQrIntent]);
  useEffect(() => { if (disconnectReview) reviewRef.current?.focus(); }, [disconnectReview]);

  function requestQr() {
    if (mutation.current || authorizationLost.current) return;
    intent.current = { started: Date.now(), lastQr: Date.now(), received: false };
    setQr(null); setQrWaiting(true);
    void request({ action: "qr" });
  }
  async function connect(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (mutation.current || authorizationLost.current) return;
    const parsed = parseCampaignRecipients(phone);
    if (parsed.phones.length !== 1 || parsed.invalid.length) { setError("أدخل رقم واتساب سعوديًا صحيحًا مثل ‎+9665XXXXXXXX"); return; }
    intent.current = { started: Date.now(), lastQr: 0, received: false };
    setQr(null); setQrWaiting(true);
    const result = await request({ action: "connect", phone: parsed.phones[0] });
    if (result?.dashboard.connection?.status === "pairing") requestQr();
    else if (!result) { intent.current = null; setQrWaiting(false); }
  }
  async function disconnect() {
    intent.current = null; setQr(null); setQrWaiting(false);
    const result = await request({ action: "disconnect" });
    if (result) { setDisconnectReview(false); setNotice("تم طلب فصل الرقم نتابع تأكيد الحالة تلقائيًا"); }
  }

  const connected = status === "connected" && Boolean(dashboard?.connection?.verifiedPhone);
  const ready = connected && dashboard?.transactionalEnabled;
  const canConnect = !dashboard?.connection || status === "disconnected";
  const disabled = busy || !configured;
  const statusLabel = status === "pairing" ? qr ? "بانتظار مسح الرمز" : qrWaiting ? "جارٍ تجهيز رمز الربط" : "جاهز لطلب رمز الربط"
    : status === "connected" && !connected ? "جارٍ التحقق من الرقم" : connected && !dashboard?.transactionalEnabled ? "متصل ويحتاج تفعيل الخدمة" : labels[status];
  return <DashboardPageShell title="ربط رقم العلامة التجارية" subtitle="اربط واتساب لوكو لتصل رموز التحقق ورسائل الترحيب لعملائك من رقم العلامة">
    <div dir="rtl" className={styles.page}>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {!dashboard ? <section className={styles.panel}><p>لم نتمكن من تحميل حالة الرقم</p><button type="button" className={styles.button} disabled={busy} onClick={() => void request()}>{busy ? "جارٍ التحميل" : "إعادة المحاولة"}</button></section> : <>
        <section className={styles.panel} aria-labelledby="brand-phone-heading">
          <div className={styles.heading}><div><p className={styles.eyebrow}>واتساب العلامة</p><h2 id="brand-phone-heading">رقم لوكو أقرب لعملائها</h2></div><span role="status" className={styles.badge} data-connected={ready}>{ready && <CheckCheck size={16} aria-hidden="true" />}{statusLabel}</span></div>
          {!configured && <p className={styles.error} role="status">خدمة ربط الرقم غير جاهزة حاليًا تواصل مع دعم برندة</p>}
          <div className={styles.layout}>
            <div className={styles.details}>
              {canConnect ? <form onSubmit={connect} className={styles.form}><label htmlFor="brand-whatsapp-phone" className={styles.field}>رقم واتساب لوكو<input id="brand-whatsapp-phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="+9665XXXXXXXX" required maxLength={24} value={phone} disabled={disabled} onChange={event => setPhone(event.target.value)} /></label><button className={styles.button} disabled={disabled}><Smartphone size={18} aria-hidden="true" />{busy ? "جارٍ تجهيز الاتصال" : "ربط الرقم"}</button></form> : <>
                <p className={styles.number}>الرقم المطلوب <bdi dir="ltr">+{dashboard.connection?.phone}</bdi>{connected && <>الرقم المتصل <strong><bdi dir="ltr">+{dashboard.connection?.verifiedPhone}</bdi></strong></>}</p>
                {status === "mismatch" && <p className={styles.error}>الرقم الذي مسح الرمز مختلف عن الرقم المطلوب افصل الاتصال ثم اربط رقم لوكو الصحيح</p>}
                {connected && !dashboard.transactionalEnabled && <button type="button" className={styles.button} disabled={disabled} onClick={() => void connect()}>تفعيل الرقم لرسائل العملاء</button>}
                {["uncertain", "provisioning", "error"].includes(status) && <button type="button" className={styles.button} disabled={disabled} onClick={() => void connect()}>استكمال ربط الرقم</button>}
                {status === "pairing" && <button type="button" className={styles.button} disabled={disabled} onClick={requestQr}><QrCode size={18} aria-hidden="true" />{qrWaiting ? "إعادة طلب الرمز" : qr ? "تجديد رمز الربط" : "إظهار رمز الربط"}</button>}
              </>}
              <ol className={styles.steps}><li>أدخل رقم العلامة واضغط ربط الرقم</li><li>افتح واتساب ثم الإعدادات أو القائمة ثم الأجهزة المرتبطة</li><li>اختر ربط جهاز وامسح الرمز وانتظر ظهور حالة متصل</li></ol>
              <div className={styles.actions}><button type="button" className={styles.secondary} disabled={disabled} onClick={() => void request(dashboard.connection ? { action: "refresh" } : undefined)}><RefreshCw size={16} aria-hidden="true" />تحديث الحالة</button>{!canConnect && !disconnectReview && <button type="button" className={styles.secondary} disabled={busy} onClick={() => setDisconnectReview(true)}>فصل الرقم أو تغييره</button>}</div>
            </div>
            <div className={styles.qrPanel} aria-busy={busy || qrWaiting}>{qr && status === "pairing" ? <>
              {/* The QR is a short-lived inline PNG; no remote image or provider credential is rendered. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.qr} src={qr} width={240} height={240} alt="رمز ربط واتساب لوكو امسحه من الأجهزة المرتبطة" />
              <p>امسح الرمز من جوالك</p><small>يتجدد الرمز أثناء فتح الصفحة</small>
            </> : <div className={styles.qrPlaceholder}>{ready ? <CheckCheck size={48} aria-hidden="true" /> : <QrCode size={48} aria-hidden="true" />}<p role="status">{ready ? "رقم لوكو متصل وجاهز" : busy || qrWaiting ? "ننتظر جاهزية رمز الربط" : "سيظهر رمز الربط هنا"}</p><small>{qrWaiting ? "قد يستغرق التجهيز حتى خمس دقائق أبق الصفحة مفتوحة" : ready ? "يمكنك متابعة الاتصال من هذه الصفحة" : "استخدم واتساب الرقم الذي أدخلته"}</small></div>}</div>
          </div>
          {disconnectReview && <div ref={reviewRef} tabIndex={-1} className={styles.review} role="region" aria-labelledby="disconnect-title"><h3 id="disconnect-title">فصل رقم لوكو؟</h3><p>سيُفصل الرقم عن العلامة وتتوقف الرسائل المجدولة من هذا الرقم وتستمر رموز التحقق ورسائل الترحيب عبر أرقام برندة</p><div className={styles.actions}><button type="button" className={styles.danger} disabled={busy} onClick={() => void disconnect()}>تأكيد فصل الرقم</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => setDisconnectReview(false)}>الاحتفاظ بالاتصال</button></div></div>}
        </section>
        <aside className={styles.fallback} aria-labelledby="fallback-heading"><h2 id="fallback-heading">رسائل العملاء تستمر تلقائيًا</h2><p>تصل رموز التحقق ورسائل الترحيب من رقم لوكو المرتبط أولًا وعند انقطاعه نستخدم رقم برندة الأساسي ثم الرقم الاحتياطي عند الحاجة</p></aside>
      </>}
    </div>
  </DashboardPageShell>;
}
