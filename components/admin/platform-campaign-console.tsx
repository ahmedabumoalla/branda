"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpLeft, CalendarClock, Check, CheckCheck, ChevronLeft, ChevronRight, CircleAlert, ImagePlus, LoaderCircle, Megaphone, MessageCircle, RefreshCw, Search, Send, ShieldCheck, Upload, Users, Video, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MARKETING_MEDIA_TYPES } from "@/lib/marketing/media-rules";
import type { PlatformCampaignAudience, PlatformCampaignAudiencePage, PlatformCampaignCreateInput, PlatformCampaignDashboard, PlatformCampaignMedia, PlatformCampaignSummary } from "@/lib/marketing/platform-types";
import s from "./platform-campaign-console.module.css";

const api = "/api/admin/marketing-campaigns";
const number = (value: number) => value.toLocaleString("ar-SA-u-nu-latn");
const date = (value: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value));
const statusLabels: Record<PlatformCampaignSummary["status"], string> = { queued: "بانتظار الإرسال", sending: "جارٍ الإرسال", completed: "اكتمل التنفيذ", cancelled: "ملغاة" };
const maxScheduleDays = 365;
export function platformCampaignSaudiInput(timestamp: number) { return new Date(timestamp + 3 * 60 * 60 * 1000).toISOString().slice(0, 16); }
export function platformCampaignSchedule(value: string, now = Date.now()): { scheduledAt: string; error: null } | { scheduledAt: null; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return { scheduledAt: null, error: "اختر تاريخ ووقت إرسال الحملة بتوقيت السعودية" };
  const timestamp = Date.parse(`${value}:00+03:00`);
  if (!Number.isFinite(timestamp) || platformCampaignSaudiInput(timestamp) !== value) return { scheduledAt: null, error: "اختر تاريخًا ووقتًا صحيحين للحملة" };
  if (timestamp <= now) return { scheduledAt: null, error: "اختر موعدًا لاحقًا لإرسال الحملة" };
  if (timestamp > now + maxScheduleDays * 86400_000) return { scheduledAt: null, error: "اختر موعدًا خلال ٣٦٥ يومًا من الآن" };
  return { scheduledAt: new Date(timestamp).toISOString(), error: null };
}
type Attachment = { file: File; url: string; kind: "image" | "video"; status: "uploading" | "ready" | "failed"; media?: PlatformCampaignMedia; error?: string };
type Review = { input: PlatformCampaignCreateInput; count: number; audienceLabel: string };
type ApiResponse<T> = { ok: boolean; message?: string; data?: T };
class RequestFailure extends Error { constructor(message: string, readonly ambiguous = false) { super(message); } }

async function request<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal });
  let result: ApiResponse<T>;
  try { result = await response.json() as ApiResponse<T>; }
  catch { throw new RequestFailure("تعذر قراءة نتيجة الطلب حاول مجددًا", true); }
  if (!response.ok || !result.ok) throw new RequestFailure(result.message || "تعذر إكمال الطلب حاول مجددًا", response.status >= 500);
  return result.data as T;
}

export function platformCampaignDraftError(title: string, body: string, count: number, attachment?: { status: string; media?: { id: string } } | null) {
  if (!title.trim()) return "اكتب عنوان الحملة";
  if (title.trim().length > 100) return "عنوان الحملة لا يتجاوز ١٠٠ حرف";
  if (!body.trim()) return "اكتب نص الحملة";
  if (body.trim().length > (attachment ? 1024 : 3000)) return attachment ? "نص الصورة أو الفيديو لا يتجاوز ١٠٢٤ حرفًا" : "نص الحملة لا يتجاوز ٣٠٠٠ حرف";
  if (attachment && (attachment.status !== "ready" || !attachment.media?.id)) return "أكمل رفع الصورة أو الفيديو قبل مراجعة الحملة";
  if (count <= 0) return "اختر العملاء الذين تريد إرسال الحملة إليهم";
  return null;
}

function MediaPreview({ attachment }: { attachment: Attachment }) {
  return attachment.kind === "video"
    ? <video src={attachment.url} controls preload="metadata" className={s.mediaPreview} aria-label="معاينة فيديو الحملة" />
    // eslint-disable-next-line @next/next/no-img-element
    : <img src={attachment.url} alt="صورة الحملة" className={s.mediaPreview} />;
}

export function PlatformCampaignConsole({ initialDashboard }: { initialDashboard: PlatformCampaignDashboard | null }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sendMode, setSendMode] = useState<"now" | "scheduled">("now");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [clockNow, setClockNow] = useState<number | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [search, setSearch] = useState("");
  const [brandId, setBrandId] = useState("");
  const [filters, setFilters] = useState({ search: "", brandId: "" });
  const [page, setPage] = useState(1);
  const [audience, setAudience] = useState<PlatformCampaignAudiencePage | null>(null);
  const [audienceError, setAudienceError] = useState("");
  const [audienceLoading, setAudienceLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [allMatching, setAllMatching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ambiguous, setAmbiguous] = useState(false);
  const [error, setError] = useState(initialDashboard ? "" : "تعذر تحميل الحملات أعد تحديث الحالة");
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [audienceReload, setAudienceReload] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const uploadSequence = useRef(0);
  const uploadController = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const mounted = useRef(true);
  const launching = useRef(false);
  const attempt = useRef<Review | null>(null);
  const locked = busy || ambiguous;
  const count = allMatching ? audience?.total ?? 0 : selected.length;
  const dirtyFilters = search.trim() !== filters.search || brandId !== filters.brandId;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; uploadController.current?.abort(); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); };
  }, []);

  useEffect(() => {
    const update = () => setClockNow(Date.now());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 30_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(page) });
    if (filters.brandId) query.set("brandId", filters.brandId);
    if (filters.search) query.set("search", filters.search);
    request<PlatformCampaignAudiencePage>(`${api}/audience?${query}`, undefined, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setAudience(result); setAudienceError(""); setAudienceLoading(false);
    }).catch(() => {
      if (controller.signal.aborted) return;
      setAudience(null); setAudienceError("تعذر تحميل العملاء أعد المحاولة"); setAudienceLoading(false);
    });
    return () => controller.abort();
  }, [filters, page, audienceReload]);

  useEffect(() => {
    if (review && !dialog.current?.open) dialog.current?.showModal();
    if (!review && dialog.current?.open) dialog.current.close();
  }, [review]);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try { const result = await request<PlatformCampaignDashboard>(api); if (mounted.current) { setDashboard(result); setError(""); } }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "تعذر تحديث الحملات"); }
    finally { if (mounted.current) setRefreshing(false); }
  }

  function editContent() { if (!locked) { attempt.current = null; setReview(null); setError(""); setNotice(""); } }
  function removeAttachment() {
    if (locked) return;
    uploadSequence.current++; uploadController.current?.abort(); uploadController.current = null;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null; setAttachment(null); editContent();
  }
  async function upload(file: File) {
    if (locked) return;
    const rule = MARKETING_MEDIA_TYPES[file.type as keyof typeof MARKETING_MEDIA_TYPES];
    if (!rule || file.size <= 0 || file.size > rule.maxSize) { setError("اختر صورة JPG أو PNG أو WebP حتى ١٠ ميجابايت أو فيديو MP4 حتى ٥٠ ميجابايت"); return; }
    removeAttachment();
    const sequence = ++uploadSequence.current;
    const controller = new AbortController(); uploadController.current = controller;
    const url = URL.createObjectURL(file); previewUrl.current = url;
    setAttachment({ file, url, kind: rule.kind, status: "uploading" });
    const current = () => mounted.current && sequence === uploadSequence.current;
    const timeout = window.setTimeout(() => {
      if (!current()) return;
      uploadSequence.current++; controller.abort();
      setAttachment(previous => previous ? { ...previous, status: "failed", error: "استغرق الرفع وقتًا طويلًا أزل المرفق ثم أعد رفعه" } : null);
    }, 180_000);
    try {
      const target = await request<{ mediaId: string; bucket: string; upload: { path: string; token: string } }>(`${api}/media`, { action: "prepare", fileName: file.name, mimeType: file.type, size: file.size }, controller.signal);
      if (!current()) return;
      const result = await createClient().storage.from(target.bucket).uploadToSignedUrl(target.upload.path, target.upload.token, file, { contentType: file.type });
      if (!current()) return;
      if (result.error) throw new Error("تعذر رفع المرفق أزله ثم أعد المحاولة");
      const verified = await request<{ media: PlatformCampaignMedia; previewUrl: string }>(`${api}/media`, { action: "finalize", mediaId: target.mediaId }, controller.signal);
      if (current()) setAttachment({ file, url, kind: rule.kind, status: "ready", media: verified.media });
    } catch (failure) {
      if (current()) setAttachment(previous => previous ? { ...previous, status: "failed", error: failure instanceof Error && /[\u0600-\u06ff]/.test(failure.message) ? failure.message : "تعذر رفع المرفق أزله ثم أعد المحاولة" } : null);
    } finally { window.clearTimeout(timeout); if (current()) uploadController.current = null; }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked) return;
    editContent(); setAllMatching(false); setAudience(null); setAudienceLoading(true);
    setPage(1); setFilters({ brandId, search: search.trim() });
  }
  function changePage(next: number) { setAudienceLoading(true); setPage(next); }
  function beginReview() {
    if (locked) return;
    if (dirtyFilters) { setError("طبّق فلتر العملاء قبل مراجعة الحملة"); return; }
    const invalid = platformCampaignDraftError(title, body, count, attachment);
    if (invalid) { setError(invalid); return; }
    if (!dashboard?.sender.ready) { setError("رقم برندة غير جاهز للإرسال حدّث الحالة بعد إعادة ربطه"); return; }
    if (audienceLoading || audienceError) { setError("انتظر تحميل العملاء قبل المراجعة"); return; }
    const schedule = sendMode === "scheduled" ? platformCampaignSchedule(scheduledLocal) : null;
    if (schedule?.error) { setError(schedule.error); return; }
    const filter = { ...(filters.brandId ? { brandId: filters.brandId } : {}), ...(filters.search ? { search: filters.search } : {}) };
    const audienceInput: PlatformCampaignAudience = allMatching ? { mode: "filtered", ...filter } : { mode: "selected", phones: [...selected] };
    const input: PlatformCampaignCreateInput = { action: "createCampaign", idempotencyKey: crypto.randomUUID(), title: title.trim(), body: body.trim(), audience: audienceInput, ...(attachment?.media ? { mediaId: attachment.media.id } : {}), ...(schedule?.scheduledAt ? { scheduledAt: schedule.scheduledAt } : {}) };
    const snapshot = { input, count, audienceLabel: !allMatching ? "العملاء المحددون من جميع نتائج البحث والفلاتر" : filters.brandId ? dashboard.brands.find(brand => brand.id === filters.brandId)?.name || "العلامة المحددة" : "كل العلامات التجارية" };
    attempt.current = snapshot; setReview(snapshot); setError("");
  }

  async function launch() {
    if (launching.current || !attempt.current) return;
    const snapshot = attempt.current;
    launching.current = true; setBusy(true); setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90_000);
    try {
      const result = await request<{ campaignId: string; total: number }>(api, snapshot.input, controller.signal);
      if (!result?.campaignId) throw new RequestFailure("لم يتأكد إنشاء الحملة", true);
      if (!mounted.current) return;
      attempt.current = null; setAmbiguous(false); setReview(null);
      setTitle(""); setBody(""); setSelected([]); setAllMatching(false); setSendMode("now"); setScheduledLocal("");
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null; setAttachment(null);
      setNotice(snapshot.input.scheduledAt ? `تمت جدولة الحملة إلى ${number(result.total)} عميل وتبدأ المعالجة ${date(snapshot.input.scheduledAt)} بتوقيت السعودية` : `بدأت الحملة إلى ${number(result.total)} عميل ويمكنك متابعة الإرسال في السجل`);
      await refresh();
    } catch (failure) {
      if (!mounted.current) return;
      const unknown = !(failure instanceof RequestFailure) || failure.ambiguous;
      setAmbiguous(unknown);
      setError(unknown ? "لم يتأكد إنشاء الحملة أعد التأكيد بنفس الطلب للتحقق دون تكرارها" : failure.message);
    } finally { window.clearTimeout(timeout); launching.current = false; if (mounted.current) setBusy(false); }
  }

  async function cancelCampaign(id: string) {
    if (locked) return;
    setBusy(true); setError("");
    try { await request(api, { action: "cancelCampaign", campaignId: id }); setCancelId(null); setNotice("أُلغيت الرسائل التي لم يبدأ إرسالها"); await refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "تعذر إلغاء الحملة حاول مجددًا"); }
    finally { setBusy(false); }
  }

  return <section className={s.page} dir="rtl" aria-labelledby="platform-campaign-title">
    <header className={s.heading}><div><span className={s.eyebrow}><Megaphone aria-hidden="true" />من برندة إلى عملاء العلامات</span><h1 id="platform-campaign-title">الحملات التسويقية</h1><p>اكتب رسالتك واختر جمهورها وتابع إرسالها من رقم برندة</p></div><button type="button" className={s.secondary} onClick={() => void refresh()} disabled={refreshing || locked}><RefreshCw aria-hidden="true" className={refreshing ? s.spin : undefined} />تحديث الحالة</button></header>
    <div className={s.sender}><span className={s.senderIcon}><MessageCircle aria-hidden="true" /></span><div><span className={s.eyebrow}>رقم الإرسال</span><strong>واتساب برندة {dashboard?.sender.phone && <bdi dir="ltr">+{dashboard.sender.phone}</bdi>}</strong><p>رسالة واحدة لكل رقم حتى لو كان العميل لدى أكثر من علامة</p></div><span className={s.status} data-ready={dashboard?.sender.ready}>{dashboard?.sender.ready ? <Check aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}{dashboard?.sender.ready ? "جاهز للإرسال" : dashboard ? "يحتاج إلى ربط" : "بانتظار التحقق"}</span></div>
    {error && <p className={s.alert} role="alert"><CircleAlert aria-hidden="true" />{error}</p>}
    {notice && <p className={s.notice} role="status"><CheckCheck aria-hidden="true" />{notice}</p>}
    <div className={s.workspace}>
      <section className={s.panel} aria-labelledby="campaign-content-heading"><div className={s.panelHeading}><span className={s.step}>١</span><div><h2 id="campaign-content-heading">محتوى الحملة</h2><p>العنوان لتنظيم حملاتك والنص هو الذي يصل إلى العميل</p></div></div>
        <label className={s.field} htmlFor="platform-campaign-name">عنوان الحملة<input id="platform-campaign-name" maxLength={100} value={title} disabled={locked} placeholder="مثل وصول القهوة التركية" onChange={event => { editContent(); setTitle(event.target.value); }} /></label>
        <label className={s.field} htmlFor="platform-campaign-body">نص الحملة<textarea id="platform-campaign-body" rows={6} maxLength={attachment ? 1024 : 3000} value={body} disabled={locked} placeholder="اكتب رسالتك كما تريد أن تصل للعميل" onChange={event => { editContent(); setBody(event.target.value); }} /><span className={s.count}>{number(body.length)} / {number(attachment ? 1024 : 3000)} حرف</span></label>
        <label className={s.upload} data-disabled={locked}><ImagePlus aria-hidden="true" /><span><strong>أضف صورة أو فيديو</strong><small>صورة حتى ١٠ ميجابايت أو فيديو MP4 حتى ٥٠ ميجابايت</small></span><Upload aria-hidden="true" /><input id="platform-campaign-media" type="file" accept="image/jpeg,image/png,image/webp,video/mp4" disabled={locked || attachment?.status === "uploading"} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} /></label>
        {attachment && <div className={s.attachment}><div>{attachment.kind === "video" ? <Video aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}<span><strong>{attachment.file.name}</strong><small role="status">{attachment.status === "uploading" ? "جارٍ رفع المرفق والتحقق منه" : attachment.status === "ready" ? "المرفق جاهز" : attachment.error}</small></span>{attachment.status === "uploading" && <LoaderCircle className={s.spin} aria-hidden="true" />}</div><button type="button" className={s.iconButton} disabled={locked} onClick={removeAttachment} aria-label="إزالة المرفق"><X aria-hidden="true" /></button></div>}
        <fieldset className={s.schedule} disabled={locked}><legend><CalendarClock aria-hidden="true" />موعد الإرسال</legend><div className={s.selectionModes}><button type="button" className={s.secondary} aria-pressed={sendMode === "now"} onClick={() => { editContent(); setSendMode("now"); }}>إرسال الآن</button><button type="button" className={s.secondary} aria-pressed={sendMode === "scheduled"} onClick={() => { editContent(); setSendMode("scheduled"); }}>جدولة الحملة</button></div>{sendMode === "scheduled" && <label className={s.field} htmlFor="platform-campaign-scheduled">تاريخ ووقت الإرسال بتوقيت السعودية<input id="platform-campaign-scheduled" type="datetime-local" dir="ltr" step={60} value={scheduledLocal} disabled={locked} min={clockNow ? platformCampaignSaudiInput(clockNow + 60_000) : undefined} max={clockNow ? platformCampaignSaudiInput(clockNow + maxScheduleDays * 86400_000) : undefined} onChange={event => { editContent(); setScheduledLocal(event.target.value); }} /><span className={s.count}>تبدأ المعالجة عند الموعد المحدد بتوقيت السعودية ثم تُرسل الرسائل تباعًا</span></label>}</fieldset>
      </section>
      <aside className={s.preview} aria-label="معاينة رسالة واتساب"><div className={s.previewHeading}><span><MessageCircle aria-hidden="true" />برندة</span><small>معاينة الرسالة</small></div><div className={s.previewStage}><div className={s.bubble}>{attachment && <MediaPreview attachment={attachment} />}<p>{body.trim() || "ستظهر رسالتك هنا كما تصل إلى العميل"}</p><span className={s.previewTime}><CheckCheck aria-hidden="true" />الآن</span></div></div><p className={s.previewHint}>يُرسل النص الذي كتبته مع المرفق الذي تختاره</p></aside>
    </div>

    <section className={`${s.panel} ${s.audience}`} aria-labelledby="campaign-audience-heading"><div className={s.panelHeading}><span className={s.step}>٢</span><div><h2 id="campaign-audience-heading">اختر العملاء</h2><p>استهدف كل العلامات أو صفِّ الجمهور حسب علامة محددة</p></div><span className={s.selectionCount} role="status"><Users aria-hidden="true" />{number(count)} محدد</span></div>
      <form className={s.filters} onSubmit={applyFilters}><label className={s.field} htmlFor="platform-campaign-brand">العلامة التجارية<select id="platform-campaign-brand" disabled={locked} value={brandId} onChange={event => { editContent(); setAllMatching(false); setBrandId(event.target.value); }}><option value="">كل العلامات التجارية</option>{dashboard?.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label><label className={s.field} htmlFor="platform-campaign-search">ابحث عن عميل<input id="platform-campaign-search" type="search" maxLength={80} disabled={locked} value={search} placeholder="الاسم أو رقم الجوال" onChange={event => { editContent(); setAllMatching(false); setSearch(event.target.value); }} /></label><button className={s.secondary} type="submit" disabled={locked}><Search aria-hidden="true" />عرض العملاء</button></form>
      <div className={s.audienceTools}><div className={s.selectionModes}><button type="button" className={s.secondary} disabled={locked || audienceLoading || dirtyFilters || !audience?.total} aria-pressed={allMatching} onClick={() => { editContent(); setAllMatching(true); }}><CheckCheck aria-hidden="true" />تحديد كل نتائج الفلتر</button><button type="button" className={s.secondary} disabled={locked} aria-pressed={!allMatching} onClick={() => { editContent(); setAllMatching(false); }}>اختيار عملاء محددين</button><button type="button" className={s.secondary} disabled={locked || (!allMatching && !selected.length)} onClick={() => { editContent(); setAllMatching(false); setSelected([]); }}>إلغاء التحديد</button></div><span className={s.count}>{audienceLoading ? "جارٍ تحميل العملاء" : audience ? `${number(audience.total)} عميل مطابق` : ""}</span></div>
      {allMatching ? <p className={s.audienceNote}>سيشمل الإرسال كل العملاء المطابقين للفلتر في جميع الصفحات</p> : <p className={s.audienceNote}>اختياراتك محفوظة عند البحث وتغيير العلامة والتنقل بين الصفحات</p>}
      {dirtyFilters && <p className={s.audienceNote}>اضغط عرض العملاء لتطبيق الفلتر الجديد</p>}
      {audienceError ? <div className={s.empty} role="alert"><CircleAlert aria-hidden="true" /><p>{audienceError}</p><button type="button" className={s.secondary} onClick={() => { setAudienceLoading(true); setAudienceReload(value => value + 1); }}>إعادة المحاولة</button></div> : audienceLoading ? <div className={s.empty} role="status"><LoaderCircle className={s.spin} aria-hidden="true" /><p>نجهّز قائمة العملاء</p></div> : !audience?.items.length ? <div className={s.empty}><Users aria-hidden="true" /><p>لا يوجد عملاء يطابقون هذا الفلتر</p></div> : <>
        <div className={s.customerList}>{audience.items.map(customer => <label className={s.customer} key={customer.id}><input type="checkbox" aria-label={`اختيار ${customer.name} ${customer.phone}`} checked={allMatching || selected.includes(customer.phone)} disabled={locked || allMatching || dirtyFilters} onChange={event => { editContent(); setSelected(previous => event.target.checked ? [...new Set([...previous, customer.phone])] : previous.filter(phone => phone !== customer.phone)); }} /><span className={s.customerAvatar}>{customer.name.trim().slice(0, 1) || <Users aria-hidden="true" />}</span><span className={s.customerIdentity}><strong>{customer.name || "عميل العلامة"}</strong><bdi dir="ltr">+{customer.phone}</bdi></span><span className={s.customerBrands}>{customer.brands.map(brand => <span key={brand.id}>{brand.name}</span>)}</span></label>)}</div>
        <nav className={s.pagination} aria-label="صفحات العملاء"><button type="button" className={s.iconButton} disabled={locked || page <= 1} onClick={() => changePage(page - 1)} aria-label="صفحة العملاء السابقة"><ChevronRight aria-hidden="true" /></button><span>صفحة {number(audience.page)} من {number(Math.max(1, Math.ceil(audience.total / audience.pageSize)))}</span><button type="button" className={s.iconButton} disabled={locked || page * audience.pageSize >= audience.total} onClick={() => changePage(page + 1)} aria-label="صفحة العملاء التالية"><ChevronLeft aria-hidden="true" /></button></nav>
      </>}
      <div className={s.launchBar}><div><strong>{number(count)} عميل في جمهور الحملة</strong><span>{allMatching ? "كل نتائج الفلتر في جميع الصفحات" : "العملاء الذين حددتهم من القائمة"}</span></div><button type="button" className={s.primary} disabled={locked || !dashboard?.sender.ready || audienceLoading || dirtyFilters || attachment?.status === "uploading"} onClick={beginReview}><Send aria-hidden="true" />مراجعة الحملة والإرسال</button></div>
    </section>

    <section className={s.historySection} aria-labelledby="campaign-history-heading"><div className={s.sectionHeading}><div><span className={s.eyebrow}>كل حملة لها أثر</span><h2 id="campaign-history-heading">سجل الحملات</h2></div><span className={s.count}>حالات الإرسال من رقم برندة</span></div>{!dashboard?.campaigns.length ? <div className={`${s.panel} ${s.empty}`}><Megaphone aria-hidden="true" /><p>حملتك الأولى تبدأ من هنا</p><span>بعد الإطلاق تظهر الرسائل ونتائج الإرسال في هذا السجل</span></div> : <div className={s.historyList}>{dashboard.campaigns.map(campaign => <article className={s.campaign} key={campaign.id}><div className={s.campaignHeading}><div><h3>{campaign.title}</h3><time dateTime={campaign.createdAt}>{date(campaign.createdAt)}</time></div><span className={s.status}>{campaign.status === "queued" && campaign.scheduledAt && (Date.parse(campaign.scheduledAt) > (clockNow ?? Date.parse(campaign.createdAt))) ? "مجدولة" : statusLabels[campaign.status]}</span></div>{campaign.scheduledAt && <p className={s.scheduledHint}><CalendarClock aria-hidden="true" />موعد الإرسال {date(campaign.scheduledAt)} بتوقيت السعودية</p>}<p className={s.historyBody}>{campaign.body}</p>{campaign.mediaKind && <span className={s.mediaBadge}>{campaign.mediaKind === "video" ? <Video aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}{campaign.mediaKind === "video" ? "تتضمن فيديو" : "تتضمن صورة"}</span>}<div className={s.metrics}>{([["إجمالي العملاء", campaign.total], ["مقبولة للإرسال", campaign.accepted], ["بانتظار الإرسال", campaign.pending], ["تعذر الإرسال", campaign.failed]] as const).map(([label, value]) => <div key={label}><strong>{number(value)}</strong><span>{label}</span></div>)}</div><details className={s.details}><summary>تفاصيل الحالات الأخرى</summary><dl><dt>لم يتأكد إرسالها</dt><dd>{number(campaign.uncertain)}</dd><dt>ملغاة</dt><dd>{number(campaign.cancelled)}</dd><dt>مستبعدة</dt><dd>{number(campaign.suppressed)}</dd></dl><p>قبول الرسالة للإرسال لا يعني تسليمها والرسائل غير المؤكدة لا تُعاد تلقائيًا</p></details>{["queued", "sending"].includes(campaign.status) && <div className={s.cancel}>{cancelId === campaign.id ? <><span>إلغاء الرسائل التي لم يبدأ إرسالها؟</span><button type="button" className={s.secondary} disabled={locked} onClick={() => void cancelCampaign(campaign.id)}>تأكيد إلغاء المتبقي</button><button type="button" className={s.secondary} disabled={locked} onClick={() => setCancelId(null)}>متابعة الحملة</button></> : <button type="button" className={s.secondary} disabled={locked} onClick={() => setCancelId(campaign.id)}>إلغاء الرسائل المتبقية</button>}</div>}</article>)}</div>}</section>

    <dialog ref={dialog} className={s.dialog} aria-labelledby="campaign-review-heading" onCancel={event => { if (locked) event.preventDefault(); else setReview(null); }} onClose={() => { if (!locked) setReview(null); }}>
      {review && <><div className={s.panelHeading}><span className={s.senderIcon}><ShieldCheck aria-hidden="true" /></span><div><span className={s.eyebrow}>الخطوة الأخيرة</span><h2 id="campaign-review-heading">راجع الحملة قبل الإرسال</h2></div><button type="button" className={s.iconButton} disabled={locked} onClick={() => setReview(null)} aria-label="إغلاق مراجعة الحملة"><X aria-hidden="true" /></button></div><h3 className={s.reviewTitle}>{review.input.title}</h3><dl className={s.reviewSummary}><dt>رقم الإرسال</dt><dd>برندة <bdi dir="ltr">{dashboard?.sender.phone ? `+${dashboard.sender.phone}` : ""}</bdi></dd><dt>الجمهور</dt><dd>{review.audienceLabel}</dd><dt>عدد العملاء</dt><dd>{number(review.count)}</dd><dt>موعد المعالجة</dt><dd>{review.input.scheduledAt ? <>{date(review.input.scheduledAt)}<br />بتوقيت السعودية</> : "بعد تأكيد الإطلاق"}</dd></dl>{attachment && <MediaPreview attachment={attachment} />}<p className={s.reviewMessage}>{review.input.body}</p>{error && <p className={s.alert} role="alert">{error}</p>}<div className={s.reviewActions}><button type="button" className={s.primary} disabled={busy} onClick={() => void launch()}>{busy ? <LoaderCircle className={s.spin} aria-hidden="true" /> : <Send aria-hidden="true" />}{busy ? "جارٍ تأكيد الحملة" : ambiguous ? "تحقق من الحملة وأكمل" : review.input.scheduledAt ? "تأكيد جدولة الحملة" : "إطلاق الحملة الآن"}</button><button type="button" className={s.secondary} disabled={locked} onClick={() => setReview(null)}>العودة للتعديل<ArrowUpLeft aria-hidden="true" /></button></div></>}
    </dialog>
  </section>;
}
