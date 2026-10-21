"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCheck, ImagePlus, MessageCircle, QrCode, RefreshCw, Send, Smartphone, Trash2 } from "lucide-react";
import { DashboardPageShell } from "@/components/ui/design-system";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import type { MarketingCampaignMedia, MarketingDashboard } from "@/lib/marketing/types";
import { MARKETING_MEDIA_BODY_LIMIT, MARKETING_MEDIA_TYPES, MARKETING_STOP_FOOTER } from "@/lib/marketing/media-rules";
import { createClient } from "@/lib/supabase/client";
import { campaignDraftError, campaignMediaError, campaignQrSource, parseCampaignRecipients } from "./campaign-form";
import styles from "./campaigns.module.css";

const connectionLabels: Record<string, string> = { disconnected: "غير متصل", provisioning: "جارٍ تجهيز الاتصال", pairing: "بانتظار ربط واتساب", connected: "متصل وجاهز", mismatch: "الرقم المرتبط مختلف", uncertain: "حالة الاتصال قيد التحقق", error: "تعذر الاتصال", disconnecting: "جارٍ فصل الرقم" };
const campaignLabels: Record<string, string> = { queued: "بانتظار الإرسال", scheduled: "مجدولة", sending: "قيد الإرسال", completed: "انتهت المعالجة", cancelled: "ملغاة", paused: "متوقفة مؤقتًا" };
const formatNumber = (value: number) => value.toLocaleString("ar-SA");
const formatDate = (value: string) => new Date(value).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
type ApiResult = { ok: boolean; message?: string; data?: { dashboard: MarketingDashboard; qr?: string; qrStatus?: string } };
type Draft = { title: string; body: string; customerIds: string[]; consent: boolean; scheduledAt: string };
type Attachment = { file: File; previewUrl: string | null; kind: "image" | "video"; status: "uploading" | "ready" | "failed"; media: MarketingCampaignMedia | null; error: string };
const emptyDraft: Draft = { title: "", body: "", customerIds: [], consent: false, scheduledAt: "" };

function CampaignMediaPreview({ attachment }: { attachment: Attachment }) {
  if (!attachment.previewUrl) return null;
  return <div className={styles.mediaPreview}>
    {attachment.kind === "video" ? <video src={attachment.previewUrl} controls playsInline preload="metadata" aria-label={`معاينة الفيديو ${attachment.file.name}`} /> :
      // A local object URL previews the selected file before its private upload completes.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={attachment.previewUrl} alt={`معاينة صورة الحملة ${attachment.file.name}`} />}
  </div>;
}

export function CampaignConsole({ initialDashboard }: { initialDashboard: MarketingDashboard | null }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [phone, setPhone] = useState(initialDashboard?.connection?.phone ?? "");
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialDashboard ? "" : "تعذر تحميل الحملات أعد المحاولة");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [review, setReview] = useState(false);
  const [reviewedAudience, setReviewedAudience] = useState("");
  const [disconnectReview, setDisconnectReview] = useState(false);
  const [cancelReview, setCancelReview] = useState<string | null>(null);
  const [audienceSearch, setAudienceSearch] = useState("");
  const [audiencePage, setAudiencePage] = useState(0);
  const [qrWaiting, setQrWaiting] = useState(false);
  const qrIntent = useRef<{ started: number; lastRequest: number; received: boolean } | null>(null);
  const authorizationLost = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const mutation = useRef(false);
  const mounted = useRef(true);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<AbortController | null>(null);
  const uploadTimer = useRef<number | null>(null);
  const uploadSequence = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

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
      if (response.status === 401 || response.status === 403) {
        authorizationLost.current = true;
        qrIntent.current = null;
        setQrWaiting(false);
        setQr(null);
      }
      if (action?.action === "qr" && response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) {
        qrIntent.current = null; setQrWaiting(false); setQr(null);
      }
      const result = await response.json() as ApiResult;
      if (!response.ok || !result.ok || !result.data?.dashboard) throw new Error(result.message || "تعذر إتمام الطلب حاول مجددًا");
      if (!mounted.current || current !== sequence.current) return null;
      setDashboard(result.data.dashboard);
      const availableIds = new Set(result.data.dashboard.audience.filter((customer) => !customer.suppressed).map((customer) => customer.id));
      setDraft((previous) => ({ ...previous, customerIds: previous.customerIds.filter((id) => availableIds.has(id)) }));
      if (result.data.qr !== undefined && qrIntent.current) {
        const source = campaignQrSource(result.data.qr);
        setQr(source);
        if (source && qrIntent.current) qrIntent.current.received = true;
        if (source) setQrWaiting(false);
      }
      if (result.data.dashboard.connection?.status !== "pairing") { setQr(null); qrIntent.current = null; setQrWaiting(false); }
      if (action?.action === "qr") {
        if (result.data.qrStatus === "error" || result.data.qrStatus === "passkeyRequired") {
          qrIntent.current = null; setQr(null); setQrWaiting(false);
          setNotice(result.data.qrStatus === "passkeyRequired" ? "يحتاج واتساب إلى تأكيد إضافي افتح التطبيق على جوالك وأكمل التأكيد ثم أعد طلب الرمز" : "تعذر تجهيز رمز الربط الآن أعد طلبه بعد قليل");
        } else if (result.data.qrStatus === "alreadyLogged") {
          qrIntent.current = null; setQr(null); setQrWaiting(false);
          setNotice("تم تسجيل اتصال واتساب جارٍ التحقق من رقم العلامة");
        } else if (result.data.qrStatus === "timeout" && qrIntent.current && !qrIntent.current.received) setQrWaiting(true);
      }
      setError("");
      return result.data;
    } catch (failure) {
      if (mounted.current && current === sequence.current) {
        if (action?.action === "qr" && qrIntent.current && !authorizationLost.current) setQrWaiting(true);
        else setError(controller.signal.aborted ? "استغرق الطلب وقتًا طويلًا تحقق من الاتصال ثم أعد المحاولة بنفس البيانات" : failure instanceof Error ? failure.message : "تعذر الاتصال حاول مجددًا");
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
    const lifecycleUploadSequence = uploadSequence;
    return () => {
      mounted.current = false; qrIntent.current = null; lifecycleSequence.current++; requestRef.current?.abort();
      lifecycleUploadSequence.current++; uploadRef.current?.abort();
      if (uploadTimer.current !== null) window.clearTimeout(uploadTimer.current);
      if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null; }
    };
  }, []);
  useEffect(() => {
    if (!dashboard?.eligible) return;
    let ticks = 0;
    const poll = () => {
      if (authorizationLost.current) return;
      const intent = qrIntent.current;
      if (intent && Date.now() - intent.started >= 300000) {
        qrIntent.current = null; setQrWaiting(false); setQr(null);
        setNotice("انتهت مهلة تجهيز الرمز يمكنك طلب رمز جديد عندما تكون جاهزًا للربط");
      }
      if (document.visibilityState !== "visible" || !navigator.onLine || mutation.current) return;
      ticks++;
      if (qrIntent.current && connectionStatus === "pairing") {
        if (Date.now() - qrIntent.current.lastRequest >= (qrIntent.current.received ? 20000 : 5000)) {
          qrIntent.current.lastRequest = Date.now();
          void request({ action: "qr" }, true);
          return;
        }
      }
      const pairing = ["pairing", "provisioning", "uncertain", "disconnecting"].includes(connectionStatus ?? "");
      if (pairing) void request({ action: "refresh" }, true);
      else if (ticks % 3 === 0) void request(undefined, true);
    };
    const timer = window.setInterval(poll, 5000);
    const foreground = () => { if (!authorizationLost.current && document.visibilityState === "visible" && navigator.onLine) poll(); };
    window.addEventListener("online", foreground);
    document.addEventListener("visibilitychange", foreground);
    return () => { window.clearInterval(timer); window.removeEventListener("online", foreground); document.removeEventListener("visibilitychange", foreground); };
  }, [connectionStatus, dashboard?.eligible, request]);
  useEffect(() => { if (review) reviewRef.current?.focus(); }, [review]);

  function edit(field: keyof Draft, value: string | boolean | string[]) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setReview(false);
  }
  function removeAttachment() {
    uploadSequence.current++; uploadRef.current?.abort(); uploadRef.current = null;
    if (uploadTimer.current !== null) { window.clearTimeout(uploadTimer.current); uploadTimer.current = null; }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setAttachment(null); setReview(false);
  }
  async function uploadAttachment(file: File) {
    removeAttachment();
    const invalid = campaignMediaError(file);
    const kind = MARKETING_MEDIA_TYPES[file.type as keyof typeof MARKETING_MEDIA_TYPES]?.kind ?? "image";
    if (invalid) { setAttachment({ file, kind, previewUrl: null, status: "failed", media: null, error: invalid }); return; }
    const previewUrl = URL.createObjectURL(file);
    previewUrlRef.current = previewUrl;
    setAttachment({ file, kind, previewUrl, status: "uploading", media: null, error: "" });
    const current = ++uploadSequence.current;
    const controller = new AbortController(); uploadRef.current = controller;
    const isCurrent = () => mounted.current && uploadSequence.current === current;
    const timeout = window.setTimeout(() => {
      if (!isCurrent()) return;
      uploadSequence.current++; controller.abort(); uploadRef.current = null;
      uploadTimer.current = null;
      setAttachment(previous => previous ? { ...previous, status: "failed", error: "استغرق رفع المرفق وقتًا طويلًا تحقق من الاتصال وأعد المحاولة" } : null);
    }, 180000);
    uploadTimer.current = timeout;
    try {
      const prepared = await fetch("/api/marketing/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare", fileName: file.name, mimeType: file.type, size: file.size }), cache: "no-store", signal: controller.signal });
      const preparation = await prepared.json() as { ok: boolean; message?: string; data?: { mediaId: string; bucket: string; upload: { path: string; token: string } } };
      if (!isCurrent()) return;
      if (!prepared.ok || !preparation.ok || !preparation.data?.upload) throw new Error(preparation.message || "تعذر تجهيز رفع المرفق حاول مجددًا");
      const target = preparation.data;
      const { error: uploadError } = await createClient().storage.from(target.bucket).uploadToSignedUrl(target.upload.path, target.upload.token, file, { contentType: file.type });
      if (!isCurrent()) return;
      if (uploadError) throw new Error("تعذر رفع المرفق احتفظنا برسالتك ويمكنك المحاولة مجددًا");
      const verified = await fetch("/api/marketing/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "finalize", mediaId: target.mediaId }), cache: "no-store", signal: controller.signal });
      const verification = await verified.json() as { ok: boolean; message?: string; data?: { media: MarketingCampaignMedia } };
      if (!isCurrent()) return;
      if (!verified.ok || !verification.ok || !verification.data?.media?.id) throw new Error(verification.message || "تعذر التحقق من المرفق اختر ملفًا آخر أو أعد المحاولة");
      setAttachment({ file, kind, previewUrl, status: "ready", media: verification.data.media, error: "" });
    } catch (failure) {
      if (isCurrent()) setAttachment(previous => previous ? { ...previous, status: "failed", error: failure instanceof Error && /[\u0600-\u06ff]/.test(failure.message) ? failure.message : "تعذر رفع المرفق تحقق من الاتصال وأعد المحاولة" } : null);
    } finally {
      window.clearTimeout(timeout);
      if (uploadSequence.current === current) { uploadRef.current = null; uploadTimer.current = null; }
    }
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
    const invalid = campaignDraftError({ ...draft, mediaId: attachment?.media?.id, mediaStatus: attachment?.status });
    if (invalid) { setError(invalid); errorRef.current?.focus(); return; }
    setReviewedAudience(JSON.stringify(draft.customerIds));
    setError(""); setNotice(""); setReview(true);
  }
  async function launch() {
    if (reviewedAudience !== JSON.stringify(draft.customerIds)) { setReview(false); setError("تغير العملاء المحددون راجع الحملة مجددًا قبل الإرسال"); return; }
    const invalid = campaignDraftError({ ...draft, mediaId: attachment?.media?.id, mediaStatus: attachment?.status });
    if (invalid) { setError(invalid); setReview(false); return; }
    const payload = { title: draft.title.trim(), body: draft.body.trim(), customerIds: draft.customerIds, consent: true, ...(attachment?.media ? { mediaId: attachment.media.id } : {}), ...(draft.scheduledAt ? { scheduledAt: new Date(draft.scheduledAt).toISOString() } : {}) };
    const fingerprint = JSON.stringify(payload);
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    const result = await request({ action: "createCampaign", ...payload, idempotencyKey: attempt.current.key });
    if (result) { attempt.current = null; setDraft(emptyDraft); removeAttachment(); setReview(false); setNotice("تمت إضافة الحملة تابع حالة كل مرحلة في سجل الحملات"); }
  }

  const connected = connectionStatus === "connected" && Boolean(dashboard?.connection?.verifiedPhone);
  const ready = Boolean(dashboard?.eligible && dashboard.configured && connected);
  const mediaPending = attachment !== null && attachment.status !== "ready";
  const messageLimit = attachment ? MARKETING_MEDIA_BODY_LIMIT : 3000;
  const audience = dashboard?.audience ?? [];
  const filteredAudience = audience.filter((customer) => `${customer.name} ${customer.phone}`.toLocaleLowerCase("ar").includes(audienceSearch.trim().toLocaleLowerCase("ar")));
  const eligibleAudience = filteredAudience.filter((customer) => !customer.suppressed);
  const page = Math.min(audiencePage, Math.max(0, Math.ceil(filteredAudience.length / 20) - 1));
  const visibleAudience = filteredAudience.slice(page * 20, (page + 1) * 20);
  const selectedIds = new Set(draft.customerIds);
  const reviewing = review && reviewedAudience === JSON.stringify(draft.customerIds);
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
            {connectionStatus === "pairing" && <div className={styles.actions}><button className={styles.button} disabled={busy || qrWaiting || !dashboard.eligible} onClick={() => { qrIntent.current = { started: Date.now(), lastRequest: Date.now(), received: false }; setQrWaiting(true); setQr(null); void request({ action: "qr" }); }}><QrCode size={17} aria-hidden="true" />{qrWaiting ? "جارٍ تجهيز رمز الربط" : qr ? "تجديد رمز الربط" : "إظهار رمز الربط"}</button></div>}
            {qrWaiting && connectionStatus === "pairing" && <p className={styles.hint} role="status">ننتظر جاهزية واتساب وسيظهر الرمز تلقائيًا قد يستغرق التجهيز حتى خمس دقائق أبق الصفحة مفتوحة</p>}
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
              <label className={styles.field} htmlFor="campaign-body">نص رسالة واتساب<textarea id="campaign-body" className={styles.input} rows={6} maxLength={messageLimit} required disabled={busy} value={draft.body} onChange={(event) => edit("body", event.target.value)} placeholder="اكتب رسالتك بطابع علامتك" aria-describedby="campaign-body-help" /></label>
              <p id="campaign-body-help" className={styles.count}>{formatNumber(draft.body.trim().length)} من {formatNumber(messageLimit)} حرف{attachment ? " — يصل النص مع الصورة أو الفيديو في رسالة واحدة" : " — يمكنك إضافة صورة أو فيديو لرسالتك"}</p>
              <fieldset className={styles.mediaPicker} aria-describedby="campaign-media-help">
                <legend>صورة أو فيديو اختياري</legend>
                <p id="campaign-media-help" className={styles.hint}>مرفق واحد للحملة صورة JPG أو PNG أو WebP حتى ١٠ ميجابايت أو فيديو MP4 حتى ٥٠ ميجابايت</p>
                <div className={styles.mediaActions}>
                  <label className={`${styles.secondary} ${styles.fileChoice}`} data-disabled={busy || !dashboard.eligible || !dashboard.configured}><ImagePlus size={18} aria-hidden="true" /><span>{attachment ? "استبدال المرفق" : "إضافة صورة أو فيديو"}</span><input id="campaign-media" className={styles.fileInput} type="file" accept="image/jpeg,image/png,image/webp,video/mp4" disabled={busy || !dashboard.eligible || !dashboard.configured} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadAttachment(file); }} /></label>
                  {attachment && <button type="button" className={styles.secondary} disabled={busy} onClick={removeAttachment}><Trash2 size={16} aria-hidden="true" />إزالة المرفق</button>}
                </div>
                {attachment && <div className={styles.attachment} data-state={attachment.status} aria-busy={attachment.status === "uploading"}>
                  <div className={styles.attachmentInfo}><strong>{attachment.file.name}</strong><span>{attachment.kind === "video" ? "فيديو" : "صورة"} · {formatNumber(Math.max(0.01, attachment.file.size / (1024 * 1024)))} ميجابايت</span></div>
                  {attachment.status === "uploading" ? <p className={styles.mediaStatus} role="status">جارٍ رفع المرفق والتحقق منه يمكنك متابعة كتابة الرسالة</p> : attachment.status === "failed" ? <><p className={styles.mediaError} role="alert">{attachment.error}</p><button type="button" className={styles.secondary} disabled={busy} onClick={() => void uploadAttachment(attachment.file)}>إعادة رفع المرفق</button></> : <p className={styles.mediaStatus} role="status"><CheckCheck size={16} aria-hidden="true" />المرفق جاهز للإرسال</p>}
                </div>}
              </fieldset>
              <fieldset className={styles.audience} aria-describedby="recipient-help">
                <legend>عملاء الحملة</legend>
                <p id="recipient-help" className={styles.hint}>عملاء علامتك وأصحاب بطاقات الولاء دون تكرار الأرقام وجود العميل أو تحميل بطاقته لا يعني موافقته على الرسائل التسويقية</p>
                <label className={styles.field} htmlFor="audience-search">ابحث بالاسم أو رقم الجوال<input id="audience-search" className={styles.input} type="search" value={audienceSearch} onChange={(event) => { setAudienceSearch(event.target.value); setAudiencePage(0); }} placeholder="ابحث في عملاء علامتك" /></label>
                <div className={styles.audienceTools}><label className={styles.check}><input type="checkbox" aria-label="تحديد كل العملاء الظاهرين في البحث" disabled={busy || !eligibleAudience.length} checked={eligibleAudience.length > 0 && eligibleAudience.every((customer) => selectedIds.has(customer.id))} onChange={(event) => { const ids = new Set(draft.customerIds); for (const customer of eligibleAudience) { if (event.target.checked) ids.add(customer.id); else ids.delete(customer.id); } edit("customerIds", [...ids]); }} /><span>{audienceSearch ? "تحديد نتائج البحث" : "تحديد الكل"}</span></label><span className={styles.count} role="status">{formatNumber(draft.customerIds.length)} محدد من {formatNumber(audience.length)} عميل</span></div>
                {!filteredAudience.length ? <p className={styles.empty}>{audience.length ? "لا يوجد عميل يطابق البحث" : "سيظهر هنا عملاء علامتك وأصحاب بطاقات الولاء عند توفر أرقامهم"}</p> : <ul className={styles.audienceList}>{visibleAudience.map((customer) => <li key={customer.id} className={styles.customer} data-suppressed={customer.suppressed}>
                  <label className={styles.check}><input type="checkbox" aria-label={`اختيار ${customer.name} ${customer.phone}`} checked={!customer.suppressed && selectedIds.has(customer.id)} disabled={busy || customer.suppressed} onChange={(event) => edit("customerIds", event.target.checked ? [...new Set([...draft.customerIds, customer.id])] : draft.customerIds.filter((id) => id !== customer.id))} /><span><strong>{customer.name}</strong><bdi dir="ltr">+{customer.phone}</bdi><small>{customer.source === "both" ? "عميل العلامة وصاحب بطاقة ولاء" : customer.source === "loyalty" ? "صاحب بطاقة ولاء" : "عميل العلامة"}</small></span></label>
                  <button type="button" className={styles.secondary} disabled={busy || customer.suppressed} aria-label={customer.suppressed ? `الإرسال موقوف إلى ${customer.phone}` : `إيقاف الإرسال إلى ${customer.phone}`} onClick={async () => { const result = await request({ action: "optOut", customerId: customer.id }); if (result) { setReview(false); setNotice("تم إيقاف الرسائل التسويقية لهذا العميل واستبعاده من الحملات"); } }}>{customer.suppressed ? "الإرسال موقوف" : "إيقاف الإرسال"}</button>
                </li>)}</ul>}
                {filteredAudience.length > 20 && <div className={styles.audienceTools}><button type="button" className={styles.secondary} disabled={page === 0} onClick={() => setAudiencePage(page - 1)}>السابق</button><span className={styles.count}>صفحة {formatNumber(page + 1)} من {formatNumber(Math.ceil(filteredAudience.length / 20))}</span><button type="button" className={styles.secondary} disabled={(page + 1) * 20 >= filteredAudience.length} onClick={() => setAudiencePage(page + 1)}>التالي</button></div>}
                <p className={styles.count}>عندما يرسل العميل كلمة إيقاف أوقف الإرسال إليه يدويًا من هذه القائمة — {formatNumber(dashboard.optOutCount)} رقم موقوف</p>
              </fieldset>
              <label className={styles.field} htmlFor="campaign-date">موعد الإرسال اختياري<input id="campaign-date" className={styles.input} type="datetime-local" value={draft.scheduledAt} disabled={busy} onChange={(event) => edit("scheduledAt", event.target.value)} aria-describedby="schedule-help" /></label>
              <p id="schedule-help" className={styles.count}>اتركه فارغًا لبدء الإرسال بعد التأكيد — اختيار الموعد حسب توقيت جهازك</p>
              <label className={styles.check}><input type="checkbox" checked={draft.consent} disabled={busy} onChange={(event) => edit("consent", event.target.checked)} /><span>أؤكد أن أصحاب هذه الأرقام وافقوا على استقبال رسائل علامتي التسويقية وأنني سأحترم طلبات إيقافها</span></label>
            </div>
            {!reviewing && <div className={styles.actions}><button className={styles.button} disabled={busy || !ready || mediaPending}><Send size={16} aria-hidden="true" />مراجعة الحملة</button></div>}
            {reviewing && <div ref={reviewRef} tabIndex={-1} className={styles.review} aria-label="مراجعة الحملة قبل الإرسال"><h3>راجع التفاصيل قبل الإرسال</h3><dl><dt>من الرقم</dt><dd><bdi dir="ltr">+{dashboard.connection?.verifiedPhone}</bdi></dd><dt>عدد العملاء</dt><dd>{formatNumber(draft.customerIds.length)}</dd><dt>موعد البدء</dt><dd>{draft.scheduledAt ? formatDate(draft.scheduledAt) : "بعد التأكيد"}</dd>{attachment?.media && <><dt>المرفق</dt><dd>{attachment.kind === "video" ? "فيديو" : "صورة"} — {attachment.file.name}</dd></>}</dl>{attachment && <CampaignMediaPreview attachment={attachment} />}<p className={styles.reviewMessage}>{draft.body.trim()}{"\n\n"}{MARKETING_STOP_FOOTER}</p><p>سترسل الرسالة إلى العملاء الذين اخترتهم ولن تُرسل إلى الأرقام الموقوفة من الحملات</p><div className={styles.actions}><button type="button" className={styles.button} disabled={busy || !ready || mediaPending} onClick={() => void launch()}>{busy ? "جارٍ تأكيد الحملة" : draft.scheduledAt ? "تأكيد جدولة الحملة" : "تأكيد بدء الإرسال"}</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => setReview(false)}>العودة للتعديل</button></div></div>}
          </form>
          <aside className={styles.preview} aria-label="معاينة رسالة واتساب"><div className={styles.previewHeader}><MessageCircle aria-hidden="true" /><div>{dashboard.brandName}<p className={styles.hint}>معاينة رسالتك</p></div></div><div className={styles.bubble}>{attachment && <CampaignMediaPreview attachment={attachment} />}<p>{draft.body.trim() ? `${draft.body.trim()}\n\n${MARKETING_STOP_FOOTER}` : "ستظهر رسالتك هنا أثناء كتابتها"}</p></div><p className={styles.hint}>نضيف عبارة إيقاف الرسائل تلقائيًا دون رابط وعند طلب العميل الإيقاف يمكنك استبعاده من قائمة العملاء</p></aside>
        </section>
        <section className={styles.panel} aria-labelledby="history-heading"><div className={styles.heading}><div><p className={styles.eyebrow}>متابعة الرسائل</p><h2 id="history-heading">سجل الحملات</h2><p className={styles.hint}>قبول الإرسال لا يعني وصول الرسالة أو قراءتها تتحدث الحالات عند ورود تأكيدها</p></div><span className={styles.badge}>{formatNumber(dashboard.campaigns.length)} حملة</span></div>
          {!dashboard.campaigns.length ? <p className={styles.empty}>لم تنشئ حملات بعد<br />بعد تأكيد حملتك الأولى ستظهر رسالتها ونتائجها هنا</p> : <div className={styles.history}>{dashboard.campaigns.map((campaign) => <article key={campaign.id} className={styles.campaign}><div className={styles.heading}><div><h3>{campaign.title}</h3><p className={styles.count}>{formatDate(campaign.createdAt)} بتوقيت السعودية{campaign.scheduledAt && <> — مجدولة {formatDate(campaign.scheduledAt)}</>}</p></div><span className={styles.badge}>{campaignLabels[campaign.status] ?? "قيد التحقق"}</span></div><p className={styles.message}>{campaign.body}</p><div className={styles.metrics}>{([["الأرقام", campaign.total], ["بانتظار الإرسال", campaign.queued], ["مقبولة للإرسال", campaign.accepted], ["تم التسليم", campaign.delivered], ["تمت القراءة", campaign.read]] as const).map(([label, value]) => <div className={styles.metric} key={label}><strong>{formatNumber(value)}</strong>{label}</div>)}</div><details><summary>تفاصيل الحالات الأخرى</summary><dl><dt>تعذر الإرسال</dt><dd>{formatNumber(campaign.failed)}</dd><dt>لم يتأكد الإرسال</dt><dd>{formatNumber(campaign.uncertain)}</dd><dt>ملغاة</dt><dd>{formatNumber(campaign.cancelled)}</dd><dt>مستبعدة</dt><dd>{formatNumber(campaign.suppressed)}</dd></dl><p className={styles.hint}>الرسائل التي لم يتأكد إرسالها لا يعاد إرسالها تلقائيًا لتجنب التكرار</p></details>{["queued", "scheduled", "sending", "paused"].includes(campaign.status) && <div className={styles.cancel}>{cancelReview !== campaign.id ? <button className={styles.secondary} disabled={busy} onClick={() => setCancelReview(campaign.id)}>إلغاء الرسائل المتبقية</button> : <div className={styles.review}><p>سيُلغى انتظار الرسائل المتبقية ولا يمكن استرجاع ما أُرسل بالفعل</p><div className={styles.actions}><button className={styles.danger} disabled={busy} onClick={async () => { const result = await request({ action: "cancelCampaign", campaignId: campaign.id }); if (result) { setCancelReview(null); setNotice("تم إلغاء الرسائل التي لم يبدأ إرسالها"); } }}>تأكيد الإلغاء</button><button className={styles.secondary} disabled={busy} onClick={() => setCancelReview(null)}>متابعة الحملة</button></div></div>}</div>}</article>)}</div>}
        </section>
      </>}
    </div>
  </DashboardPageShell>;
}
