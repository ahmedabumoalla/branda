"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarClock, CheckCheck, ChevronLeft, ChevronRight, Gift, MessageCircle, RefreshCw, Send, Users, X } from "lucide-react";
import { createBrandAnalyticsCampaignAction, loadBrandAnalyticsCampaignAudienceAction } from "@/app/actions/brand-analytics-campaign";
import type { BrandAnalyticsCampaignAudience, BrandAnalyticsCampaignAudienceInput, BrandAnalyticsCampaignInput } from "@/lib/analytics/brand-analytics-campaign";
import { analyticsCampaignDraftError, analyticsCampaignMessageTemplate, analyticsCampaignSaudiInput, analyticsCampaignSchedule } from "@/lib/analytics/brand-analytics-campaign-form";
import styles from "./brand-analytics-campaign.module.css";

type Segment = BrandAnalyticsCampaignAudienceInput["segment"];
type Brand = { id: string; name: string };
type Review = { input: BrandAnalyticsCampaignInput; audience: BrandAnalyticsCampaignAudience };
const number = (value: number) => value.toLocaleString("ar-SA");
const date = (value: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value));
const segmentName = (segment: Segment, days: number) => segment === "loyal" ? "الأكثر ولاء وانتظامًا" : segment === "inactive" ? "المنقطعون أكثر من ١٠ أيام" : `غائبون أكثر من ${number(days)} يومًا`;

export function BrandAnalyticsCampaign({ brand, initialSegment = "inactive" }: { brand: Brand; initialSegment?: Segment }) {
  const [open, setOpen] = useState(false);
  const [segment, setSegment] = useState<Segment>(initialSegment);
  const [absenceDays, setAbsenceDays] = useState("30");
  const [audience, setAudience] = useState<BrandAnalyticsCampaignAudience | null>(null);
  const [audienceBusy, setAudienceBusy] = useState(false);
  const [audienceError, setAudienceError] = useState("");
  const [kind, setKind] = useState<"message" | "offer">("message");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sendMode, setSendMode] = useState<"now" | "scheduled">("now");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ total: number; scheduledAt?: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const errorPanel = useRef<HTMLDivElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const audienceRequest = useRef(0);
  const sendingRef = useRef(false);
  const reviewingRef = useRef(false);
  const openRef = useRef(false);
  const locked = sending || uncertain;
  const days = segment === "absent" ? Number(absenceDays) : 10;
  const validDays = Number.isInteger(days) && days >= 1 && days <= 365;
  const audienceMatches = audience?.brandId === brand.id && audience.segment === segment && audience.inactiveDays === days;
  const eligible = audienceMatches ? audience.total : 0;
  const pages = Math.max(1, Math.ceil((audience?.total || 0) / 25));
  const clockNow = audience ? Date.parse(audience.generatedAt) : null;

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
  useEffect(() => { if (error) errorPanel.current?.focus(); }, [error]);
  useEffect(() => () => { openRef.current = false; ++audienceRequest.current; }, []);

  async function readAudience(nextSegment: Segment, nextDays: number, page = 1) {
    if (!Number.isInteger(nextDays) || nextDays < 1 || nextDays > 365) {
      setAudienceError("حدد مدة غياب من يوم واحد إلى ٣٦٥ يومًا"); return null;
    }
    const sequence = ++audienceRequest.current;
    setAudienceBusy(true); setAudienceError(""); setAudience(null);
    try {
      const result = await loadBrandAnalyticsCampaignAudienceAction({ brandId: brand.id, segment: nextSegment, inactiveDays: nextDays, page });
      if (!openRef.current || sequence !== audienceRequest.current) return null;
      if (!result.ok) { setAudienceError(result.message); return null; }
      if (result.data.brandId !== brand.id || result.data.segment !== nextSegment || result.data.inactiveDays !== nextDays) {
        setAudienceError("تغيرت الشريحة أعد تحميل العملاء"); return null;
      }
      setAudience(result.data); return result.data;
    } catch { if (openRef.current && sequence === audienceRequest.current) setAudienceError("تعذر تحميل الشريحة أعد المحاولة"); return null; }
    finally { if (openRef.current && sequence === audienceRequest.current) setAudienceBusy(false); }
  }
  function begin() {
    openRef.current = true; setOpen(true); setSuccess(null); setError(""); setReview(null);
    void readAudience(segment, days);
  }
  function close() {
    if (sendingRef.current || uncertain || reviewingRef.current) return;
    openRef.current = false; ++audienceRequest.current;
    setOpen(false); setReview(null); setAudienceBusy(false); setError(""); trigger.current?.focus();
  }
  function changeSegment(next: Segment) {
    if (locked || reviewBusy) return;
    setSegment(next); setReview(null); setError("");
    void readAudience(next, next === "absent" ? Number(absenceDays) : 10);
  }
  async function prepareReview() {
    if (locked || reviewingRef.current || audienceBusy) return;
    const invalid = analyticsCampaignDraftError(title, body);
    if (invalid) { setError(invalid); return; }
    if (!validDays) { setError("حدد مدة غياب من يوم واحد إلى ٣٦٥ يومًا"); return; }
    const scheduled = sendMode === "scheduled" ? analyticsCampaignSchedule(scheduledLocal) : null;
    if (scheduled?.error) { setError(scheduled.error); return; }
    reviewingRef.current = true; setReviewBusy(true); setError("");
    try {
      const fresh = await readAudience(segment, days);
      if (!fresh || !openRef.current) return;
      if (!fresh.total) { setError("لا يوجد عملاء متاحون في هذه الشريحة اختر شريحة أخرى"); return; }
      if (fresh.total > 10000) { setError("الحملة تستوعب حتى ١٠ آلاف مستلم اختر شريحة أصغر قبل الإرسال"); return; }
      if (!fresh.sender.ready) { setError("رقم واتساب برندة غير متصل أعد ربطه ثم حدّث حالة الشريحة"); return; }
      setReview({ audience: fresh, input: { brandId: brand.id, segment, inactiveDays: days, audienceDigest: fresh.digest,
        idempotencyKey: crypto.randomUUID(), contentKind: kind, title: title.trim(), body: body.trim(),
        ...(scheduled?.scheduledAt ? { scheduledAt: scheduled.scheduledAt } : {}) } });
    } finally { reviewingRef.current = false; setReviewBusy(false); }
  }
  async function launch() {
    if (!review || sendingRef.current) return;
    const snapshot = review;
    const wasUncertain = uncertain;
    sendingRef.current = true; setSending(true); setError("");
    try {
      const result = await createBrandAnalyticsCampaignAction(snapshot.input);
      if (result.ok) {
        setSuccess({ total: result.data.total, scheduledAt: snapshot.input.scheduledAt });
        setReview(null); setUncertain(false); setTitle(""); setBody("");
      } else {
        setError(result.message);
        if (wasUncertain || result.code === "uncertain") setUncertain(true);
        else {
          setUncertain(false); setReview(null);
          if (result.code === "audience_changed" || result.code === "sender_unavailable") void readAudience(segment, days);
        }
      }
    } catch { setUncertain(true); setError("لم تتأكد نتيجة الطلب اضغط التحقق والمتابعة بنفس الحملة لتجنب تكرار الإرسال"); }
    finally { sendingRef.current = false; setSending(false); }
  }

  return <section className={styles.campaign} aria-label={`حملات واتساب ${brand.name}`}>
    <div className={styles.entry}><span className={styles.entryIcon}><MessageCircle size={22} aria-hidden="true" /></span><div><h3>حوّل التحليلات إلى تواصل</h3><p>رسالة للمنقطعين أو عرض خاص للعملاء الأكثر ولاء في {brand.name}</p></div><button ref={trigger} type="button" className={styles.primary} onClick={begin}><Send size={17} aria-hidden="true" />إنشاء رسالة أو عرض</button></div>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="analytics-campaign-title" onCancel={event => { event.preventDefault(); close(); }} onClose={() => { if (!locked) close(); }}>
      {open && <div className={styles.content} dir="rtl"><header className={styles.header}><div><span className={styles.eyebrow}>{brand.name}</span><h2 id="analytics-campaign-title">{success ? "حملتك جاهزة للمتابعة" : review ? "راجع الحملة قبل الإرسال" : "رسالة تصل في وقتها"}</h2></div><button type="button" className={styles.iconButton} aria-label="إغلاق إنشاء الحملة" disabled={locked || reviewBusy} onClick={close}><X size={20} aria-hidden="true" /></button></header>
      {error && <div ref={errorPanel} className={styles.error} role="alert" tabIndex={-1}>{error}</div>}
      {success ? <div className={styles.success} role="status"><CheckCheck size={38} aria-hidden="true" /><h3>{success.scheduledAt ? "تمت جدولة الحملة" : "أُضيفت الحملة إلى قائمة الإرسال"}</h3><p>{number(success.total)} عميل من {brand.name}</p><p>{success.scheduledAt ? `تبدأ المعالجة ${date(success.scheduledAt)} بتوقيت الرياض` : "تُرسل الرسائل تباعًا ويمكنك متابعة كل حالة في سجل الحملات"}</p><div className={styles.actions}><Link href="/admin/marketing-campaigns" className={styles.primary}>متابعة سجل الحملات<ArrowLeft size={16} aria-hidden="true" /></Link><button type="button" onClick={close}>العودة للتحليلات</button></div></div> : review ? <section className={styles.review}>
        <h3 ref={reviewHeading} tabIndex={-1}>{review.input.title}</h3><dl className={styles.reviewFacts}><div><dt>العلامة</dt><dd>{brand.name}</dd></div><div><dt>الشريحة</dt><dd>{segmentName(review.input.segment, review.input.inactiveDays ?? 10)}</dd></div><div><dt>كل المستلمين</dt><dd>{number(review.audience.total)} عميل</dd></div><div><dt>الإرسال من</dt><dd>واتساب برندة <bdi dir="ltr">{review.audience.sender.phone ? `+${review.audience.sender.phone}` : ""}</bdi></dd></div><div><dt>موعد المعالجة</dt><dd>{review.input.scheduledAt ? `${date(review.input.scheduledAt)} بتوقيت الرياض` : "بعد تأكيد الإرسال"}</dd></div><div><dt>نوع الرسالة</dt><dd>{review.input.contentKind === "offer" ? "عرض خاص" : "رسالة تواصل"}</dd></div></dl>
        <div className={styles.reviewBody}>{review.input.body}</div><p className={styles.hint}>الإرسال يشمل جميع العملاء المتاحين في الشريحة وليس الصفحة الظاهرة فقط ويُستبعد من لم يعد يطابقها وقت الإرسال مثل العميل الذي عاد للزيارة</p>
        {uncertain && <p className={styles.hint}>نتحقق من الطلب نفسه قبل أي محاولة أخرى ويمكنك فتح السجل في نافذة جديدة لمراجعة حالته</p>}
        <div className={styles.actions}><button type="button" className={styles.primary} disabled={sending} onClick={() => void launch()}><Send size={17} aria-hidden="true" />{sending ? "جارٍ تأكيد الحملة" : uncertain ? "التحقق والمتابعة بنفس الحملة" : review.input.scheduledAt ? `تأكيد الجدولة إلى ${number(review.audience.total)} عميل` : `تأكيد الإرسال إلى ${number(review.audience.total)} عميل`}</button>{uncertain ? <a href="/admin/marketing-campaigns" target="_blank" rel="noopener noreferrer">فتح سجل الحملات</a> : <button type="button" disabled={sending} onClick={() => { setReview(null); setError(""); }}>العودة للتعديل</button>}</div>
      </section> : <>
        <section className={styles.audienceSection} aria-labelledby="campaign-audience-heading"><div className={styles.sectionHeading}><div><h3 id="campaign-audience-heading"><Users size={18} aria-hidden="true" />من تريد أن تصلهم الرسالة</h3><p>العملاء محسوبون من نشاطهم في {brand.name} فقط</p></div><button type="button" disabled={audienceBusy || reviewBusy} onClick={() => void readAudience(segment, days)}><RefreshCw size={15} aria-hidden="true" />تحديث الشريحة</button></div><fieldset className={styles.segments} disabled={reviewBusy}><legend className={styles.srOnly}>شريحة العملاء</legend>{([{ value: "inactive", label: "منقطعون أكثر من ١٠ أيام" }, { value: "loyal", label: "الأكثر ولاء وانتظامًا" }, { value: "absent", label: "مدة غياب أحددها" }] as const).map(item => <button key={item.value} type="button" aria-pressed={segment === item.value} onClick={() => changeSegment(item.value)}>{item.label}</button>)}</fieldset>
          {segment === "absent" && <div className={styles.absence}><label htmlFor="campaign-absence-days">أكثر من كم يوم دون زيارة<input id="campaign-absence-days" type="number" min={1} max={365} step={1} value={absenceDays} disabled={reviewBusy} onChange={event => { setAbsenceDays(event.target.value); setAudience(null); ++audienceRequest.current; setAudienceBusy(false); setAudienceError(""); }} /></label><button type="button" disabled={!validDays || audienceBusy || reviewBusy} onClick={() => void readAudience(segment, days)}>عرض العملاء</button></div>}
          <p className={styles.hint}>{segment === "loyal" ? "ثلاثة أيام زيارة مختلفة على الأقل ومتوسط عودة لا يتجاوز أربعة أيام وآخر زيارة خلال عشرة أيام" : "الغياب يُحسب من آخر ختم ناجح أو صرف مكافأة وإذا لم توجد زيارة فمن إصدار البطاقة أو التسجيل"}</p>
          {audienceError && <div className={styles.error} role="alert">{audienceError}</div>}
          {audienceBusy && <p className={styles.loading} role="status">جارٍ التحقق من العملاء ورقم الإرسال</p>}
          {audience && audienceMatches && <><div className={styles.audienceStats}><div><strong>{number(audience.total)}</strong><span>عميل متاح للإرسال</span></div><div><strong>{number(audience.matched)}</strong><span>عميل يطابق الشريحة</span></div><div><strong>{number(audience.excluded)}</strong><span>مستبعد من الإرسال</span></div><div className={audience.sender.ready ? styles.senderReady : styles.senderUnavailable}><strong>{audience.sender.ready ? "واتساب متصل" : "واتساب غير جاهز"}</strong><span>الإرسال من برندة <bdi dir="ltr">{audience.sender.phone ? `+${audience.sender.phone}` : ""}</bdi></span></div></div><p className={styles.hint}>يستبعد من لا يملك جوالًا متاحًا للإرسال أو لديه منع تواصل ويُرسل لكل رقم مرة واحدة</p>
            <details className={styles.recipientDetails}><summary>مراجعة أسماء المستلمين وأرقامهم</summary><div className={styles.tableWrap} tabIndex={0} role="region" aria-label="مستلمو الحملة"><table><thead><tr><th scope="col">العميل</th><th scope="col">الجوال</th><th scope="col">آخر زيارة</th><th scope="col">مدة الغياب</th></tr></thead><tbody>{audience.items.map(item => <tr key={item.phone}><th scope="row">{item.name}</th><td><bdi dir="ltr">{item.phone}</bdi></td><td>{item.lastVisitAt ? date(item.lastVisitAt) : "لا توجد زيارة مسجلة"}</td><td>{number(item.inactiveDays)} يوم</td></tr>)}</tbody></table>{!audience.total && <p className={styles.empty}>لا يوجد مستلمون متاحون في هذه الشريحة جرّب مدة أو شريحة أخرى</p>}</div><nav className={styles.pagination} aria-label="صفحات مستلمي الحملة"><span>{number(audience.total)} مستلم إجمالًا</span><div><button type="button" disabled={audienceBusy || reviewBusy || audience.page <= 1} onClick={() => void readAudience(segment, days, audience.page - 1)}><ChevronRight size={15} aria-hidden="true" />السابق</button><span>{number(audience.page)} من {number(pages)}</span><button type="button" disabled={audienceBusy || reviewBusy || audience.page >= pages} onClick={() => void readAudience(segment, days, audience.page + 1)}>التالي<ChevronLeft size={15} aria-hidden="true" /></button></div></nav></details>
          </>}
        </section>
        <div className={styles.composer}><section className={styles.form} aria-labelledby="campaign-content-heading"><h3 id="campaign-content-heading">ماذا تريد أن تقول لهم</h3><fieldset className={styles.segments} disabled={reviewBusy}><legend className={styles.srOnly}>نوع المحتوى</legend><button type="button" aria-pressed={kind === "message"} onClick={() => setKind("message")}><MessageCircle size={16} aria-hidden="true" />رسالة تواصل</button><button type="button" aria-pressed={kind === "offer"} onClick={() => setKind("offer")}><Gift size={16} aria-hidden="true" />عرض خاص</button></fieldset><label htmlFor="analytics-campaign-subject">عنوان الحملة<input id="analytics-campaign-subject" value={title} maxLength={100} disabled={reviewBusy} onChange={event => setTitle(event.target.value)} placeholder={kind === "offer" ? `عرض خاص من ${brand.name}` : `رسالة لعملاء ${brand.name}`} /></label><label htmlFor="analytics-campaign-body">{kind === "offer" ? "تفاصيل العرض كما تصل للعميل" : "نص رسالة واتساب"}<textarea id="analytics-campaign-body" rows={7} maxLength={3000} value={body} disabled={reviewBusy} onChange={event => setBody(event.target.value)} placeholder={kind === "offer" ? "اكتب اسم العلامة وقيمة العرض وشروطه ومدة صلاحيته وطريقة الاستفادة منه" : "اكتب رسالتك واذكر اسم العلامة للعميل"} /></label><div className={styles.bodyFooter}><span>{number(body.length)} / ٣٠٠٠ حرف</span><button type="button" disabled={reviewBusy} onClick={() => { setBody(analyticsCampaignMessageTemplate(brand.name, segment)); if (!title.trim()) setTitle(`${segment === "loyal" ? "شكرًا لولائك" : "اشتقنا لك"} — ${brand.name}`); setKind("message"); }}>استخدام رسالة مقترحة</button></div>{kind === "offer" && <p className={styles.hint}>وضح قيمة العرض وشروطه ومدة صلاحيته داخل الرسالة</p>}
          <fieldset className={styles.schedule} disabled={reviewBusy}><legend><CalendarClock size={17} aria-hidden="true" />موعد الإرسال</legend><div className={styles.segments}><button type="button" aria-pressed={sendMode === "now"} onClick={() => setSendMode("now")}>بعد التأكيد</button><button type="button" aria-pressed={sendMode === "scheduled"} onClick={() => setSendMode("scheduled")}>جدولة لوقت لاحق</button></div>{sendMode === "scheduled" && <label htmlFor="analytics-campaign-time">التاريخ والوقت بتوقيت الرياض<input id="analytics-campaign-time" type="datetime-local" dir="ltr" step={60} value={scheduledLocal} min={clockNow ? analyticsCampaignSaudiInput(clockNow + 60000) : undefined} max={clockNow ? analyticsCampaignSaudiInput(clockNow + 365 * 86400_000) : undefined} onChange={event => setScheduledLocal(event.target.value)} /></label>}</fieldset>
        </section><aside className={styles.preview} aria-label="معاينة رسالة واتساب"><div className={styles.previewHeader}><MessageCircle size={20} aria-hidden="true" /><strong>برندة</strong><span>معاينة الرسالة</span></div><div className={styles.previewStage}><div className={styles.bubble}><p>{body.trim() || "ستظهر رسالتك هنا كما تصل إلى العميل"}</p><small><CheckCheck size={15} aria-hidden="true" />الآن</small></div></div><p className={styles.previewNote}>يصل النص كما يظهر في المعاينة من رقم واتساب برندة</p></aside></div>
        <footer className={styles.footer}><p>{eligible ? `الحملة تشمل ${number(eligible)} عميلًا متاحًا في الشريحة` : "اختر شريحة لديها مستلمون متاحون للمتابعة"}</p><button type="button" className={styles.primary} disabled={reviewBusy || audienceBusy || !audienceMatches || !eligible || !audience?.sender.ready || !validDays} onClick={() => void prepareReview()}>{reviewBusy ? "جارٍ تجهيز المراجعة" : "مراجعة الحملة قبل الإرسال"}<ArrowLeft size={17} aria-hidden="true" /></button></footer>
      </>}
      </div>}
    </dialog>
  </section>;
}
