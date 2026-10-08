"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpLeft, Bell, Check, Copy, Download, Gift, History, LoaderCircle, MapPin, Save, ScanLine } from "lucide-react";
import { saveRastLoyaltySettingsAction, sendLoyaltyWalletAnnouncementAction } from "@/app/actions/loyalty-experience";
import type { LoyaltyCardsDashboard } from "@/lib/data/loyalty-cards";
import type { LoyaltyExperienceSettings, LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import { RastBrand } from "./rast-brand";
import { RastQrCode } from "./qr-code";
import { RastStampCard } from "./rast-stamp-card";
import type { RastWalletAvailability } from "./rast-member-card";
import s from "./rast-loyalty.module.css";

type Props = {
  initialDashboard: LoyaltyCardsDashboard;
  initialExperience: LoyaltyExperienceSettings;
  identity: LoyaltyIdentity;
  signupUrl: string;
  walletAvailability: RastWalletAvailability;
  products?: Array<{ id: string; name: string }>;
  activityLog?: ReactNode;
};

export function RastLoyaltyDashboard({ initialDashboard, initialExperience, identity, signupUrl, walletAvailability, products = [], activityLog }: Props) {
  const router = useRouter();
  const [section, setSection] = useState<"settings" | "activity">("settings");
  const [program, setProgram] = useState(initialDashboard.program);
  const [savedActivation, setSavedActivation] = useState({ enabled: initialDashboard.program.enabled, apple: initialDashboard.program.appleWalletEnabled, google: initialDashboard.program.googleWalletEnabled });
  const [experience, setExperience] = useState(initialExperience);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [notificationError, setNotificationError] = useState("");
  const [notificationResult, setNotificationResult] = useState("");
  const [mapsUrl, setMapsUrl] = useState(() => initialExperience.latitude != null && initialExperience.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${initialExperience.latitude},${initialExperience.longitude}`
    : "");
  const signupQr = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const announcementDialog = useRef<HTMLDialogElement>(null);
  const saveLock = useRef(false);
  const sendLock = useRef(false);
  const anyWalletReady = savedActivation.enabled && ((walletAvailability.apple && savedActivation.apple) || (walletAvailability.google && savedActivation.google));

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLock.current) return;
    setError(""); setMessage("");
    saveLock.current = true; setSaving(true);
    try {
      const result = await saveRastLoyaltySettingsAction({ program: { ...program, cardBackground: "#3b1420", cardForeground: "#f8f2e8", cardAccent: "#970e29" }, experience: { ...experience, mapsUrl: mapsUrl.trim() } });
      if (!result.ok) { setError(result.message); requestAnimationFrame(() => errorRef.current?.focus()); return; }
      setSavedActivation({ enabled: program.enabled, apple: program.appleWalletEnabled, google: program.googleWalletEnabled });
      setMessage(!program.enabled
        ? "تم حفظ الإعدادات. التسجيل ما زال متوقفًا؛ فعّل برنامج الولاء ثم احفظ لفتح التسجيل للعملاء."
        : walletAvailability.apple && program.appleWalletEnabled
          ? "تم حفظ الإعدادات وفتح التسجيل. يستطيع العميل التحقق عبر واتساب ثم إضافة بطاقته إلى محفظة أبل."
          : !walletAvailability.apple
            ? "تم حفظ الإعدادات وفتح التسجيل. محفظة أبل بانتظار اكتمال الربط."
            : "تم حفظ الإعدادات وفتح التسجيل. لإتاحة بطاقة أبل، فعّل خيار محفظة أبل ثم احفظ.");
      router.refresh();
    } catch { setError("تعذر حفظ الإعدادات. تحقق من البيانات وحاول مرة أخرى."); requestAnimationFrame(() => errorRef.current?.focus()); }
    finally { setSaving(false); saveLock.current = false; }
  }

  async function copySignup() {
    try { await navigator.clipboard.writeText(signupUrl); setCopied(true); }
    catch { setError("تعذر النسخ التلقائي. يمكنك تحديد رابط التسجيل ونسخه."); }
  }

  function downloadQr() {
    const svg = signupQr.current?.querySelector("svg");
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "rast-loyalty-signup.svg"; document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function sendAnnouncement() {
    if (sendLock.current) return;
    sendLock.current = true; setSending(true); setNotificationError(""); setNotificationResult("");
    try {
      const result = await sendLoyaltyWalletAnnouncementAction(title.trim(), body.trim());
      const count = result.apple.count + result.google.count;
      const failed = result.apple.status === "failed" || result.google.status === "failed";
      setNotificationResult(count ? `قبلت خدمة المحافظ ${count} طلبات تحديث${failed ? "، وتعذر تنفيذ بعض الطلبات" : ""}. ظهور الإشعار على الجوال يعتمد على إعدادات العميل.` : failed ? "تعذر تسليم الإشعار حاليًا. بقيت الرسالة في قائمة إعادة المحاولة." : "لم تُرسل إشعارات؛ لا توجد محافظ جاهزة لاستقبالها حاليًا.");
      announcementDialog.current?.close();
    } catch { setNotificationError("تعذر إرسال الإشعار. تحقق من الإعدادات وحاول مرة أخرى."); announcementDialog.current?.close(); }
    finally { setSending(false); sendLock.current = false; }
  }

  return <div className={s.dashboard} dir="rtl">
    <header className={s.dashboardHeader}><div><span className={s.eyebrow}>أهل مقهى الكواكب</span><h1>الولاء، بطابع مقهى الكواكب.</h1><p>بطاقة يعرفها عميلك. ومكافأة ترجّعه لك.</p></div><Link className={s.secondary} href="/dashboard/cashier"><ScanLine aria-hidden="true" />إدارة الكاشير</Link></header>
    {activityLog && <nav className={s.dashboardSections} aria-label="أقسام الولاء والمكافآت">
      <button type="button" aria-pressed={section === "settings"} aria-controls="rast-program-panel" onClick={() => setSection("settings")}><Gift aria-hidden="true" />البرنامج والمكافآت</button>
      <button type="button" aria-pressed={section === "activity"} aria-controls="rast-activity-panel" onClick={() => setSection("activity")}><History aria-hidden="true" />سجل العمليات والموظفين</button>
    </nav>}
    {activityLog && <div id="rast-activity-panel" hidden={section !== "activity"}>{activityLog}</div>}
    <div id="rast-program-panel" hidden={section !== "settings"}>
    <div className={s.dashboardLayout}>
      <div className={s.dashboardMain}>
        <section className={s.signupPanel} aria-labelledby="signup-panel-title"><div className={s.signupDetails}><RastBrand identity={identity} /><h2 id="signup-panel-title">رحلة الولاء تبدأ بمسحة</h2><p>{savedActivation.enabled ? "اعرض هذا الرمز عند الكاشير. يسجّل العميل اسمه ورقم جواله، ويتحقق عبر واتساب، وتكون بطاقته جاهزة." : "رابطك ورمزك جاهزان. فعّل برنامج الولاء واحفظ الإعدادات قبل مشاركة الرمز مع العملاء."}</p><a href={signupUrl} className={s.signupUrl} dir="ltr" target="_blank" rel="noreferrer">{signupUrl}<ArrowUpLeft aria-hidden="true" /></a><div className={s.signupActions}><button type="button" onClick={() => void copySignup()} className={s.secondary}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "تم نسخ الرابط" : "نسخ الرابط"}</button><button type="button" onClick={downloadQr} className={s.secondary}><Download aria-hidden="true" />تحميل الرمز</button></div></div><div ref={signupQr} className={s.signupQr}><RastQrCode value={signupUrl} label="امسح الرمز للانضمام إلى أهل مقهى الكواكب" /><span>{savedActivation.enabled ? "امسحها، وصِر من أهل مقهى الكواكب" : "جاهز للمشاركة بعد التفعيل"}</span></div></section>
        <p data-testid="rast-saved-activation" role="status" className={s.deliveryResult}>{savedActivation.enabled ? "التسجيل مفتوح للعملاء من الرابط أعلاه." : "التسجيل متوقف حاليًا. حدّد المكافأة، ثم فعّل برنامج الولاء واحفظ لفتح التسجيل من الرابط أعلاه."}</p>
        <form onSubmit={saveSettings} aria-busy={saving} className={s.settingsForm}>
          <fieldset disabled={saving} className={s.settingsFieldset}>
            <legend>إعدادات البرنامج</legend>
            <div className={s.settingsHeading}><div><Gift aria-hidden="true" /><h2>كل ختم يقرّب المكافأة</h2></div><label className={s.toggle}><input type="checkbox" name="enabled" checked={program.enabled} aria-describedby="rast-activation-hint" onChange={(event) => setProgram((value) => ({ ...value, enabled: event.target.checked }))} /><span>تفعيل برنامج الولاء وفتح التسجيل</span></label></div>
            <p id="rast-activation-hint" className={s.sectionDescription}>حفظ إعدادات البطاقة وحده لا يفتح التسجيل. اختر التفعيل واحفظ عندما تصبح المكافأة وشروطها جاهزة.</p>
            <div className={s.settingsGrid}>
              <label className={s.field}><span>عدد الأختام للمكافأة</span><input type="number" inputMode="numeric" min={1} max={100} step={1} required value={program.purchasesRequired || ""} onChange={(event) => setProgram((value) => ({ ...value, purchasesRequired: Number(event.target.value) }))} /><small>عند إكمال العدد، تصدر مكافأة ويبدأ رصيد أختام جديد.</small></label>
              <label className={s.field}><span>صلاحية المكافأة بالأيام</span><input type="number" inputMode="numeric" min={1} max={365} step={1} required value={experience.rewardValidityDays || ""} onChange={(event) => setExperience((value) => ({ ...value, rewardValidityDays: Number(event.target.value) }))} /><small>تُحسب من وقت إصدار المكافأة للعميل.</small></label>
              <label className={s.field}><span>نوع المكافأة</span><select value={experience.rewardKind ?? "custom"} onChange={(event) => { const kind = event.target.value as "product" | "discount" | "custom"; setExperience((value) => ({ ...value, rewardKind: kind, rewardDiscountPercent: kind === "discount" ? value.rewardDiscountPercent ?? 10 : null })); if (kind !== "product") setProgram((value) => ({ ...value, rewardProductId: null })); }}><option value="product">منتج من القائمة</option><option value="discount">خصم بنسبة مئوية</option><option value="custom">مكافأة خاصة</option></select></label>
              <label className={s.field}><span>اسم المكافأة</span><input type="text" minLength={2} maxLength={80} required value={program.rewardName} onChange={(event) => setProgram((value) => ({ ...value, rewardName: event.target.value }))} placeholder="مثلًا: مشروب من اختيارك" /></label>
              {experience.rewardKind === "product" ? <label className={`${s.field} ${s.fullWidth}`}><span>منتج المكافأة</span><select required value={program.rewardProductId ?? ""} onChange={(event) => setProgram((value) => ({ ...value, rewardProductId: event.target.value || null }))}><option value="">اختر المنتج</option>{program.rewardProductId && !products.some((product) => product.id === program.rewardProductId) ? <option value={program.rewardProductId}>{program.rewardProductName || "المنتج المحدد حاليًا"}</option> : null}{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><small>المنتج الذي يصرفه الكاشير عند استبدال المكافأة.</small></label> : null}
              {experience.rewardKind === "discount" ? <label className={s.field}><span>نسبة الخصم</span><input type="number" inputMode="numeric" min={1} max={100} step={1} required value={experience.rewardDiscountPercent ?? ""} onChange={(event) => setExperience((value) => ({ ...value, rewardDiscountPercent: Number(event.target.value) }))} /><small>يسجّل الكاشير استبدال المكافأة ويطبّق النسبة على الفاتورة.</small></label> : null}
              <label className={`${s.field} ${s.fullWidth}`}><span>تفاصيل وشروط المكافأة</span><textarea rows={3} maxLength={500} value={program.terms} onChange={(event) => setProgram((value) => ({ ...value, terms: event.target.value }))} placeholder="اكتب ما يحتاج العميل معرفته قبل الاستبدال" /></label>
            </div>
            <div className={s.settingsSection}><div className={s.settingsHeading}><div><MapPin aria-hidden="true" /><h2>إذا صار قريب، ذكّره بمقهى الكواكب</h2></div></div><p className={s.sectionDescription}>تذكير بالقرب من الفرع يظهر في المحافظ التي تدعم الموقع، بحسب إعدادات جهاز العميل.</p><div className={s.settingsGrid}>
              <label className={`${s.field} ${s.fullWidth}`}><span>رسالة الترحيب بالقرب من الفرع</span><textarea minLength={2} maxLength={240} required rows={2} value={experience.nearbyMessage} onChange={(event) => setExperience((value) => ({ ...value, nearbyMessage: event.target.value }))} /></label>
              <label className={`${s.field} ${s.fullWidth}`}><span>رابط قوقل ماب للفرع</span><input type="url" name="mapsUrl" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={2048} value={mapsUrl} onChange={(event) => setMapsUrl(event.target.value)} placeholder="https://maps.app.goo.gl/..." dir="ltr" aria-describedby="rast-maps-url-hint" /></label>
            </div><p id="rast-maps-url-hint" className={s.hint}>الصق رابط الفرع من قوقل ماب؛ ندعم رابط المشاركة المختصر. اترك الحقل فارغًا واحفظ لإلغاء تذكير القرب من الفرع.</p></div>
            <div className={s.settingsSection}>
              <div className={s.settingsHeading}><h2>إضافة البطاقة إلى المحافظ</h2></div>
              <p className={s.sectionDescription}>اختر المحافظ المتاحة لعملاء مقهى الكواكب. تظهر أزرار الإضافة بعد تفعيل البرنامج وحفظ الإعدادات وتسجيل العميل.</p>
              <div className={s.settingsGrid}>
                <div><label className={s.toggle}><input type="checkbox" name="appleWalletEnabled" checked={program.appleWalletEnabled} disabled={!walletAvailability.apple && !program.appleWalletEnabled} aria-describedby="rast-apple-activation-hint" onChange={(event) => setProgram((value) => ({ ...value, appleWalletEnabled: event.target.checked }))} /><span>إتاحة بطاقة محفظة أبل</span></label><p id="rast-apple-activation-hint" className={s.hint}>{walletAvailability.apple ? "أبل جاهزة. فعّل الخيار ثم احفظ لإتاحة البطاقة للعملاء." : "محفظة أبل غير جاهزة حاليًا؛ يتاح التفعيل بعد اكتمال الربط."}</p></div>
                <div><label className={s.toggle}><input type="checkbox" name="googleWalletEnabled" checked={program.googleWalletEnabled} disabled={!walletAvailability.google && !program.googleWalletEnabled} aria-describedby="rast-google-activation-hint" onChange={(event) => setProgram((value) => ({ ...value, googleWalletEnabled: event.target.checked }))} /><span>إتاحة بطاقة محفظة قوقل</span></label><p id="rast-google-activation-hint" className={s.hint}>{walletAvailability.google ? "قوقل جاهزة. فعّل الخيار ثم احفظ لإتاحة البطاقة للعملاء." : "محفظة قوقل بانتظار اكتمال التفعيل. يمكنك تشغيل أبل بشكل مستقل."}</p></div>
              </div>
            </div>
            {error ? <p ref={errorRef} tabIndex={-1} role="alert" className={s.error}>{error}</p> : null}
            {message ? <p role="status" className={s.success}>{message}</p> : null}
            <div className={s.saveBar}><span>التغييرات تطبّق بعد الحفظ.</span><button type="submit" className={s.primary}>{saving ? <LoaderCircle className={s.spinner} aria-hidden="true" /> : <Save aria-hidden="true" />}{saving ? "جاري الحفظ..." : "حفظ إعدادات الولاء"}</button></div>
          </fieldset>
        </form>
        <section className={s.notifications} aria-labelledby="notifications-title"><div className={s.settingsHeading}><div><Bell aria-hidden="true" /><h2 id="notifications-title">خلّ أخبار مقهى الكواكب توصلهم</h2></div></div><p className={s.sectionDescription}>أرسل عرضًا أو خبرًا إلى العملاء الذين أضافوا بطاقتهم إلى المحفظة.</p><form onSubmit={(event) => { event.preventDefault(); if (!sending && anyWalletReady) announcementDialog.current?.showModal(); }}><fieldset disabled={sending || !anyWalletReady} className={s.notificationFields}><legend className={s.srOnly}>محتوى الإشعار</legend><label className={s.field}><span>عنوان الإشعار</span><input value={title} onChange={(event) => setTitle(event.target.value)} minLength={2} maxLength={80} required placeholder="شي حلو ينتظرك في مقهى الكواكب" /></label><label className={s.field}><span>نص الرسالة</span><textarea rows={3} value={body} onChange={(event) => setBody(event.target.value)} minLength={2} maxLength={240} required placeholder="اكتب العرض أو الخبر الذي ترغب بإرساله" /></label><button type="submit" className={s.primary}><Bell aria-hidden="true" />مراجعة الإشعار وإرساله</button></fieldset></form>{!anyWalletReady ? <p className={s.hint}>إرسال الإشعارات متاح بعد تفعيل إحدى المحافظ وإضافة العملاء لبطاقاتهم.</p> : null}{notificationError ? <p className={s.error} role="alert">{notificationError}</p> : null}{notificationResult ? <p className={s.deliveryResult} role="status">{notificationResult}</p> : null}</section>
      </div>
      <aside className={s.dashboardPreview}><div className={s.previewTitle}><h2>بطاقة أهل مقهى الكواكب</h2><span>معاينة مباشرة</span></div><RastStampCard identity={identity} stamps={0} required={program.purchasesRequired} rewardName={program.rewardName} preview /><p className={s.hint}>الشعار والألوان من هوية مقهى الكواكب. الأختام المكتملة تضيء في بطاقة العميل.</p><div className={s.walletReadiness}><h3>حالة المحافظ المحفوظة</h3><p><span dir="ltr">Apple Wallet</span><strong>{!walletAvailability.apple ? "بانتظار اكتمال الربط" : savedActivation.enabled && savedActivation.apple ? "مفعّلة للعملاء" : "جاهزة للتفعيل"}</strong></p><p><span dir="ltr">Google Wallet</span><strong>{!walletAvailability.google ? "بانتظار اكتمال الربط" : savedActivation.enabled && savedActivation.google ? "مفعّلة للعملاء" : "جاهزة للتفعيل"}</strong></p></div></aside>
    </div>
    <dialog ref={announcementDialog} className={s.announcementDialog} onCancel={(event) => { if (sending) event.preventDefault(); }} aria-labelledby="announcement-review-title"><h2 id="announcement-review-title">مراجعة الإشعار</h2><p>سيُرسل إلى محافظ عملاء مقهى الكواكب المؤهلة لاستقبال التحديثات.</p><div className={s.messagePreview}><strong>{title}</strong><p>{body}</p></div><div className={s.dialogActions}><button type="button" className={s.primary} onClick={() => void sendAnnouncement()} disabled={sending}>{sending ? "جاري الإرسال…" : "إرسال الإشعار"}</button><button type="button" className={s.secondary} onClick={() => announcementDialog.current?.close()} disabled={sending}>رجوع للتعديل</button></div></dialog>
    </div>
  </div>;
}
