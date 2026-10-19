"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCheck, MessageCircle, QrCode, RefreshCw, Send, Smartphone } from "lucide-react";
import { DashboardPageShell } from "@/components/ui/design-system";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import type { MarketingDashboard } from "@/lib/marketing/types";
import { campaignDraftError, campaignQrSource, parseCampaignRecipients } from "./campaign-form";
import styles from "./campaigns.module.css";

const connectionLabels: Record<string, string> = { disconnected: "غير متصل", provisioning: "جارٍ تجهيز الاتصال", pairing: "بانتظار ربط واتساب", connected: "متصل وجاهز", mismatch: "الرقم المرتبط مختلف", uncertain: "حالة الاتصال قيد التحقق", error: "تعذر الاتصال", disconnecting: "جارٍ فصل الرقم" };
const campaignLabels: Record<string, string> = { queued: "بانتظار الإرسال", scheduled: "مجدولة", sending: "قيد الإرسال", completed: "انتهت المعالجة", cancelled: "ملغاة", paused: "متوقفة مؤقتًا" };
const formatNumber = (value: number) => value.toLocaleString("ar-SA");
const formatDate = (value: string) => new Date(value).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
type ApiResult = { ok: boolean; message?: string; data?: { dashboard: MarketingDashboard; qr?: string; qrStatus?: string } };
type Draft = { title: string; body: string; recipients: string; consent: boolean; scheduledAt: string };
const emptyDraft: Draft = { title: "", body: "", recipients: "", consent: false, scheduledAt: "" };

export function CampaignConsole({ initialDashboard }: { initialDashboard: MarketingDashboard | null }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [phone, setPhone] = useState(initialDashboard?.connection?.phone ?? "");
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialDashboard ? "" : "تعذر تحميل الحملات أعد المحاولة");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [review, setReview] = useState(false);
  const [disconnectReview, setDisconnectReview] = useState(false);
  const [cancelReview, setCancelReview] = useState<string | null>(null);
  const [optOutPhone, setOptOutPhone] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const mutation = useRef(false);
  const mounted = useRef(true);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const request = useCallback(async (action?: Record<string, unknown>, quiet = false): Promise<ApiResult["data"] | null> => {
    if (mutation.current || (quiet && requestRef.current)) return null;
    if (!quiet) { mutation.current = true; setBusy(true); setError(""); setNotice(""); }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const current = ++sequence.current;
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch("/api/marketing", { method: action ? "POST" : "GET", headers: action ? { "Content-Type": "application/json" } : undefined, body: action ? JSON.stringify(action) : undefined, cache: "no-store", signal: controller.signal });
      const result = await response.json() as ApiResult;
      if (!response.ok || !result.ok || !result.data?.dashboard) throw new Error(result.message || "تعذر إتمام الطلب حاول مجددًا");
      if (!mounted.current || current !== sequence.current) return null;
      setDashboard(result.data.dashboard);
      if (result.data.qr !== undefined) setQr(campaignQrSource(result.data.qr));
      if (result.data.dashboard.connection?.status !== "pairing") setQr(null);
      setError("");
      return result.data;
    } catch (failure) {
      if (mounted.current && current === sequence.current) {
        setError(controller.signal.aborted ? "استغرق الطلب وقتًا طويلًا تحقق من الاتصال ثم أعد المحاولة بنفس البيانات" : failure instanceof Error ? failure.message : "تعذر الاتصال حاول مجددًا");
      }
      return null;
    } finally {
      window.clearTimeout(timeout);
      if (current === sequence.current) {
        requestRef.current = null;
        mutation.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  }, []);

  const connectionStatus = dashboard?.connection?.status;
  useEffect(() => {
    mounted.current = true;
    const lifecycleSequence = sequence;
    return () => { mounted.current = false; lifecycleSequence.current++; requestRef.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!dashboard?.eligible) return;
    let ticks = 0;
    const poll = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || mutation.current) return;
      ticks++;
      const pairing = ["pairing", "provisioning", "uncertain", "disconnecting"].includes(connectionStatus ?? "");
      if (pairing) void request({ action: qr && ticks % 4 === 0 ? "qr" : "refresh" }, true);
      else if (ticks % 3 === 0) void request(undefined, true);
    };
    const timer = window.setInterval(poll, 5000);
    const foreground = () => { if (document.visibilityState === "visible" && navigator.onLine) void request(undefined, true); };
    window.addEventListener("online", foreground);
    document.addEventListener("visibilitychange", foreground);
    return () => { window.clearInterval(timer); window.removeEventListener("online", foreground); document.removeEventListener("visibilitychange", foreground); };
  }, [connectionStatus, dashboard?.eligible, qr, request]);
  useEffect(() => { if (review) reviewRef.current?.focus(); }, [review]);

  function edit(field: keyof Draft, value: string | boolean) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setReview(false);
  }
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseCampaignRecipients(phone);
    if (parsed.phones.length !== 1 || parsed.invalid.length) { setError("أدخل رقم واتساب سعوديًا صحيحًا مثل ‎+9665XXXXXXXX"); return; }
    const result = await request({ action: "connect", phone: parsed.phones[0] });
    if (result) setNotice("بدأ تجهيز اتصال علامتك سيظهر خيار رمز الربط عند جاهزيته");
  }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = campaignDraftError(draft);
    if (invalid) { setError(invalid); errorRef.current?.focus(); return; }
    setError(""); setNotice(""); setReview(true);
  }
  async function launch() {
    const invalid = campaignDraftError(draft);
    if (invalid) { setError(invalid); setReview(false); return; }
    const payload = { title: draft.title.trim(), body: draft.body.trim(), recipients: parseCampaignRecipients(draft.recipients).phones, consent: true, ...(draft.scheduledAt ? { scheduledAt: new Date(draft.scheduledAt).toISOString() } : {}) };
    const fingerprint = JSON.stringify(payload);
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    const result = await request({ action: "createCampaign", ...payload, idempotencyKey: attempt.current.key });
    if (result) { attempt.current = null; setDraft(emptyDraft); setReview(false); setNotice("تمت إضافة الحملة تابع حالة كل مرحلة في سجل الحملات"); }
  }

  const connected = connectionStatus === "connected" && Boolean(dashboard?.connection?.verifiedPhone);
  const ready = Boolean(dashboard?.eligible && dashboard.configured && connected);
  const recipientInfo = parseCampaignRecipients(draft.recipients);
  const canConnect = !dashboard?.connection || connectionStatus === "disconnected";

  if (dashboard && !dashboard.eligible && !dashboard.connection && !dashboard.campaigns.length) return <DashboardFeatureBlockedState title="الحملات التسويقية" />;
  return <DashboardPageShell title="الحملات التسويقية" subtitle={dashboard?.brandName ? `رسائل ${dashboard.brandName} من رقمها إلى عملائها` : "اربط رقم علامتك وأنشئ رسائلها وتابع وصولها"} action={<button className={styles.secondary} type="button" disabled={busy} onClick={() => void request(dashboard?.connection ? { action: "refresh" } : undefined)}><RefreshCw size={16} aria-hidden="true" />تحديث الحالة</button>}>
    <div dir="rtl" className={styles.console}>
      {error && <div ref={errorRef} tabIndex={-1} role="alert" className={styles.error}>{error}</div>}
      {notice && <div role="status" className={styles.notice}>{notice}</div>}
      {!dashboard ? <div className={styles.panel}><p className={styles.loading}>لم نتمكن من تحميل بيانات الحملات</p><button className={styles.button} disabled={busy} onClick={() => void request()}>إعادة المحاولة</button></div> : <>
        {!dashboard.eligible && <div className={styles.error} role="status">اشتراكك الحالي لا يشمل إرسال الحملات يمكنك متابعة السجل وفصل الرقم وإلغاء الرسائل المتبقية أو استبعاد عميل</div>}
        {!dashboard.configured && <div className={styles.error} role="status">خدمة ربط واتساب غير جاهزة حاليًا تواصل مع دعم برندة لإكمال إعدادها</div>}
        <section className={`${styles.panel} ${styles.connection}`} aria-labelledby="sender-heading">
          <div className={styles.heading}><div><p className={styles.eyebrow}>رقم الإرسال</p><h2 id="sender-heading">واتساب علامتك</h2><p className={styles.hint}>اختر رقم واتساب الذي تريد أن تصل رسائلك منه ويمكن أن يختلف عن رقم التواصل في حسابك</p></div><span className={styles.badge} data-connected={connected} role="status">{connected && <CheckCheck size={15} aria-hidden="true" />}{connectionLabels[connectionStatus ?? "disconnected"] ?? "جارٍ التحقق"}</span></div>
          {canConnect ? <form onSubmit={connect} className={styles.inline}><label className={styles.field} htmlFor="sender-phone">رقم واتساب العلامة مع رمز الدولة<input id="sender-phone" className={styles.input} dir="ltr" type="tel" autoComplete="tel" inputMode="tel" placeholder="+9665XXXXXXXX" value={phone} onChange={(event) => setPhone(event.target.value)} required maxLength={24} disabled={busy || !dashboard.configured || !dashboard.eligible} /></label><button className={styles.button} disabled={busy || !dashboard.configured || !dashboard.eligible}><Smartphone size={17} aria-hidden="true" />{busy ? "جارٍ تجهيز الاتصال" : "ربط رقم العلامة"}</button></form> : <>
            <p className={styles.hint}>الرقم المطلوب <bdi dir="ltr">+{dashboard.connection?.phone}</bdi>{connected && <> — الرقم المتصل <strong><bdi dir="ltr">+{dashboard.connection?.verifiedPhone}</bdi></strong></>}</p>
            {dashboard.connection?.lastError && <p className={styles.error}>{dashboard.connection.lastError}</p>}
            {connectionStatus === "mismatch" && <p className={styles.error}>الرقم الذي مسح الرمز مختلف عن رقم الإرسال المطلوب افصل الاتصال ثم اربط الرقم الصحيح</p>}
            {["uncertain", "provisioning", "error"].includes(connectionStatus ?? "") && <div className={styles.actions}><button className={styles.secondary} disabled={busy || !dashboard.configured || !dashboard.eligible} onClick={() => void request({ action: "connect", phone: dashboard.connection?.phone })}>استكمال ربط الرقم</button></div>}
            {connectionStatus === "pairing" && <div className={styles.actions}><button className={styles.button} disabled={busy || !dashboard.eligible} onClick={() => void request({ action: "qr" })}><QrCode size={17} aria-hidden="true" />{qr ? "تجديد رمز الربط" : "إظهار رمز الربط"}</button></div>}
            {qr && connectionStatus === "pairing" && <div className={styles.pairing}>
              {/* The provider returns an ephemeral PNG payload, never a remote URL or credential */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.qr} src={qr} width={200} height={200} alt="رمز ربط واتساب العلامة امسحه من الأجهزة المرتبطة" />
              <div><h3>اربط واتساب من جوالك</h3><ol className={styles.steps}><li>افتح واتساب على الرقم الموضح أعلاه</li><li>اختر الأجهزة المرتبطة ثم ربط جهاز</li><li>امسح الرمز وانتظر تأكيد الرقم هنا</li></ol><p className={styles.hint}>يتجدد الرمز أثناء فتح هذه الصفحة</p></div>
            </div>}
            {!disconnectReview ? <div className={styles.actions}><button className={styles.secondary} disabled={busy} onClick={() => setDisconnectReview(true)}>فصل الرقم أو تغييره</button></div> : <div className={styles.review}><h3>فصل رقم العلامة؟</h3><p>سيُفصل واتساب وتُلغى الحملات النشطة ورسائلها التي لم تُرسل ولن تُستأنف عند ربط رقم مجددًا ولا يمكن استرجاع الرسائل التي أُرسلت بالفعل</p><div className={styles.actions}><button className={styles.danger} disabled={busy} onClick={async () => { const result = await request({ action: "disconnect" }); if (result) { setDisconnectReview(false); setQr(null); setNotice("تم طلب فصل الرقم وإلغاء الحملات النشطة تابع حالة الاتصال أعلاه"); } }}>تأكيد فصل الرقم</button><button className={styles.secondary} disabled={busy} onClick={() => setDisconnectReview(false)}>الاحتفاظ بالاتصال</button></div></div>}
          </>}
        </section>
        <section className={styles.compose} aria-labelledby="compose-heading">
          <form className={styles.panel} onSubmit={prepare}>
            <p className={styles.eyebrow}>من علامتك إلى عملائك</p><h2 id="compose-heading">أنشئ حملتك</h2>
            {!ready && <p className={styles.hint}>يمكنك تجهيز الرسالة الآن ويصبح الإرسال متاحًا بعد تأكيد اتصال رقم علامتك</p>}
            <div className={styles.fields}>
              <label className={styles.field} htmlFor="campaign-title">اسم الحملة<input id="campaign-title" className={styles.input} value={draft.title} maxLength={100} required disabled={busy} onChange={(event) => edit("title", event.target.value)} placeholder="مثل عرض نهاية الأسبوع" /></label>
              <label className={styles.field} htmlFor="campaign-body">نص رسالة واتساب<textarea id="campaign-body" className={styles.input} rows={6} maxLength={3000} required disabled={busy} value={draft.body} onChange={(event) => edit("body", event.target.value)} placeholder="اكتب رسالتك بطابع علامتك" /></label>
              <label className={styles.field} htmlFor="campaign-recipients">أرقام العملاء<textarea id="campaign-recipients" className={styles.input} rows={4} dir="ltr" required disabled={busy} value={draft.recipients} onChange={(event) => edit("recipients", event.target.value)} placeholder={"+9665XXXXXXXX\n+9665XXXXXXXX"} aria-describedby="recipient-help" /></label>
              <p id="recipient-help" className={styles.count}>رقم جوال سعودي في كل سطر — {formatNumber(recipientInfo.phones.length)} رقم فريد{recipientInfo.duplicates > 0 && <> — تم استبعاد {formatNumber(recipientInfo.duplicates)} تكرار</>}</p>
              <label className={styles.field} htmlFor="campaign-date">موعد الإرسال اختياري<input id="campaign-date" className={styles.input} type="datetime-local" value={draft.scheduledAt} disabled={busy} onChange={(event) => edit("scheduledAt", event.target.value)} aria-describedby="schedule-help" /></label>
              <p id="schedule-help" className={styles.count}>اتركه فارغًا لبدء الإرسال بعد التأكيد — اختيار الموعد حسب توقيت جهازك</p>
              <label className={styles.check}><input type="checkbox" checked={draft.consent} disabled={busy} onChange={(event) => edit("consent", event.target.checked)} /><span>أؤكد أن أصحاب هذه الأرقام وافقوا على استقبال رسائل علامتي التسويقية وأنني سأحترم طلبات إيقافها</span></label>
            </div>
            {!review && <div className={styles.actions}><button className={styles.button} disabled={busy || !ready}><Send size={16} aria-hidden="true" />مراجعة الحملة</button></div>}
            {review && <div ref={reviewRef} tabIndex={-1} className={styles.review} aria-label="مراجعة الحملة قبل الإرسال"><h3>راجع التفاصيل قبل الإرسال</h3><dl><dt>من الرقم</dt><dd><bdi dir="ltr">+{dashboard.connection?.verifiedPhone}</bdi></dd><dt>عدد الأرقام</dt><dd>{formatNumber(recipientInfo.phones.length)}</dd><dt>موعد البدء</dt><dd>{draft.scheduledAt ? formatDate(draft.scheduledAt) : "بعد التأكيد"}</dd></dl><p>سترسل الرسالة الظاهرة في المعاينة إلى الأرقام التي أدخلتها ولن تُرسل إلى الأرقام المستبعدة من الحملات</p><div className={styles.actions}><button type="button" className={styles.button} disabled={busy || !ready} onClick={() => void launch()}>{busy ? "جارٍ تأكيد الحملة" : draft.scheduledAt ? "تأكيد جدولة الحملة" : "تأكيد بدء الإرسال"}</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => setReview(false)}>العودة للتعديل</button></div></div>}
          </form>
          <aside className={styles.preview} aria-label="معاينة رسالة واتساب"><div className={styles.previewHeader}><MessageCircle aria-hidden="true" /><div>{dashboard.brandName}<p className={styles.hint}>معاينة رسالتك</p></div></div><p className={styles.bubble}>{draft.body.trim() ? `${draft.body.trim()}\n\nلإيقاف الرسائل أرسل إيقاف أو استخدم الرابط\n[رابط إيقاف الرسائل الخاص بالعميل]` : "ستظهر رسالتك هنا أثناء كتابتها"}</p><p className={styles.hint}>تظهر الرسالة من حساب واتساب المرتبط ونضيف تلقائيًا نص إيقاف الرسائل ورابطًا خاصًا بكل عميل عند الإرسال</p></aside>
        </section>
        <section className={styles.panel} aria-labelledby="history-heading"><div className={styles.heading}><div><p className={styles.eyebrow}>متابعة الرسائل</p><h2 id="history-heading">سجل الحملات</h2><p className={styles.hint}>قبول الإرسال لا يعني وصول الرسالة أو قراءتها تتحدث الحالات عند ورود تأكيدها</p></div><span className={styles.badge}>{formatNumber(dashboard.campaigns.length)} حملة</span></div>
          {!dashboard.campaigns.length ? <p className={styles.empty}>لم تنشئ حملات بعد<br />بعد تأكيد حملتك الأولى ستظهر رسالتها ونتائجها هنا</p> : <div className={styles.history}>{dashboard.campaigns.map((campaign) => <article key={campaign.id} className={styles.campaign}><div className={styles.heading}><div><h3>{campaign.title}</h3><p className={styles.count}>{formatDate(campaign.createdAt)} بتوقيت السعودية{campaign.scheduledAt && <> — مجدولة {formatDate(campaign.scheduledAt)}</>}</p></div><span className={styles.badge}>{campaignLabels[campaign.status] ?? "قيد التحقق"}</span></div><p className={styles.message}>{campaign.body}</p><div className={styles.metrics}>{([["الأرقام", campaign.total], ["بانتظار الإرسال", campaign.queued], ["مقبولة للإرسال", campaign.accepted], ["تم التسليم", campaign.delivered], ["تمت القراءة", campaign.read]] as const).map(([label, value]) => <div className={styles.metric} key={label}><strong>{formatNumber(value)}</strong>{label}</div>)}</div><details><summary>تفاصيل الحالات الأخرى</summary><dl><dt>تعذر الإرسال</dt><dd>{formatNumber(campaign.failed)}</dd><dt>لم يتأكد الإرسال</dt><dd>{formatNumber(campaign.uncertain)}</dd><dt>ملغاة</dt><dd>{formatNumber(campaign.cancelled)}</dd><dt>مستبعدة</dt><dd>{formatNumber(campaign.suppressed)}</dd></dl><p className={styles.hint}>الرسائل التي لم يتأكد إرسالها لا يعاد إرسالها تلقائيًا لتجنب التكرار</p></details>{["queued", "scheduled", "sending", "paused"].includes(campaign.status) && <div className={styles.cancel}>{cancelReview !== campaign.id ? <button className={styles.secondary} disabled={busy} onClick={() => setCancelReview(campaign.id)}>إلغاء الرسائل المتبقية</button> : <div className={styles.review}><p>سيُلغى انتظار الرسائل المتبقية ولا يمكن استرجاع ما أُرسل بالفعل</p><div className={styles.actions}><button className={styles.danger} disabled={busy} onClick={async () => { const result = await request({ action: "cancelCampaign", campaignId: campaign.id }); if (result) { setCancelReview(null); setNotice("تم إلغاء الرسائل التي لم يبدأ إرسالها"); } }}>تأكيد الإلغاء</button><button className={styles.secondary} disabled={busy} onClick={() => setCancelReview(null)}>متابعة الحملة</button></div></div>}</div>}</article>)}</div>}
        </section>
        <section className={styles.panel} aria-labelledby="optout-heading"><p className={styles.eyebrow}>احترم رغبة عملائك</p><h2 id="optout-heading">إيقاف الرسائل لعميل</h2><p className={styles.hint}>إذا طلب عميل إيقاف الرسائل أضف رقمه هنا لاستبعاده من حملات علامتك — {formatNumber(dashboard.optOutCount)} رقم مستبعد</p><form className={styles.inline} onSubmit={async (event) => { event.preventDefault(); const parsed = parseCampaignRecipients(optOutPhone); if (parsed.phones.length !== 1 || parsed.invalid.length) { setError("أدخل رقم العميل مع رمز الدولة"); return; } const result = await request({ action: "optOut", phone: parsed.phones[0] }); if (result) { setOptOutPhone(""); setNotice("تم استبعاد الرقم من الرسائل التسويقية لعلامتك"); } }}><label className={styles.field} htmlFor="optout-phone">رقم العميل<input id="optout-phone" className={styles.input} type="tel" inputMode="tel" dir="ltr" required value={optOutPhone} disabled={busy} maxLength={24} onChange={(event) => setOptOutPhone(event.target.value)} placeholder="+9665XXXXXXXX" /></label><button className={styles.secondary} disabled={busy}>استبعاد الرقم من الحملات</button></form></section>
      </>}
    </div>
  </DashboardPageShell>;
}
