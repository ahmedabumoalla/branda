"use client";

import { useState } from "react";
import { saveBrandLoyaltyProgramAction, sendLoyaltyWalletAnnouncementAction } from "@/app/actions/loyalty-experience";
import { BrandLoyaltyCard } from "@/components/loyalty/brand-loyalty-card";
import { EnrollmentQr, downloadEnrollmentQr } from "@/components/loyalty/enrollment-qr";
import type { LoyaltyCardsDashboard } from "@/lib/data/loyalty-cards";
import type { LoyaltyIdentity, LoyaltyExperienceSettings } from "@/lib/loyalty/experience-types";
import s from "@/components/loyalty/brand-loyalty.module.css";

export function BrandLoyaltyDashboard({ dashboard, identity, initialExperience, enrollmentUrl, walletReady, configError }: {
  dashboard: LoyaltyCardsDashboard; identity: LoyaltyIdentity; initialExperience: LoyaltyExperienceSettings;
  enrollmentUrl: string; walletReady: { apple: boolean; google: boolean }; configError?: string;
}) {
  const [program, setProgram] = useState(dashboard.program);
  const [experience, setExperience] = useState(initialExperience);
  const [latitude, setLatitude] = useState(initialExperience.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(initialExperience.longitude?.toString() ?? "");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const totalStamps = dashboard.cards.reduce((sum, card) => sum + card.totalPurchases, 0);
  const earnedRewards = dashboard.cards.reduce((sum, card) => sum + card.completedCycles, 0);

  async function save() {
    if (busy) return;
    setBusy(true); setStatus("");
    try {
      if ((latitude.trim() === "") !== (longitude.trim() === "")) throw new Error("أدخل خط العرض وخط الطول معًا.");
      await saveBrandLoyaltyProgramAction({ program: { ...program, appleWalletEnabled: true, googleWalletEnabled: true, cardBackground: "#3b1420", cardForeground: "#f8f2e8", cardAccent: "#970e29" }, experience: {
        ...experience, latitude: latitude.trim() ? Number(latitude) : null, longitude: longitude.trim() ? Number(longitude) : null,
      } });
      setStatus("انحفظت إعدادات برنامجك. بطاقات العملاء تستخدم عدد الأختام والمكافأة المحددين.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "تعذر الحفظ، حاول مرة ثانية."); }
    finally { setBusy(false); }
  }

  async function announce() {
    if (sending) return;
    setSending(true); setStatus("");
    try {
      const result = await sendLoyaltyWalletAnnouncementAction(title, body);
      setStatus(result.message);
    } catch { setStatus("تعذر إرسال الإعلان للمحافظ. تحقق من الربط وحاول مرة ثانية."); }
    finally { setSending(false); }
  }

  return <section className={s.dashboard} dir="rtl">
    <header className={s.dashboardHeader}><div><p className={s.eyebrow}>علاقة تكبر مع كل زيارة</p><h1>الولاء والمكافآت</h1><p>بطاقة تحمل هويتك، وأختام ترجع عميلك للحظة يحبّها.</p></div>
      {identity.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img className={s.logo} src={identity.logoUrl} alt={identity.name} />}
    </header>
    {configError && <p className={s.status} role="alert">{configError}</p>}
    {status && <p className={s.status} role="status">{status}</p>}
    <div className={s.stats}><div><b>{dashboard.cards.length}</b><span>عضويات في آخر ١٠٠ بطاقة</span></div><div><b>{totalStamps}</b><span>أختام هذه العضويات</span></div><div><b>{earnedRewards}</b><span>مكافآت مكتملة لهذه العضويات</span></div></div>
    <div className={s.editor}>
      <form className={s.form} onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className={s.settingsGroup}><h2 className={s.sectionTitle}>برنامجك، على ذوقك</h2>
          <label className={s.check}><input type="checkbox" checked={program.enabled} disabled={busy} onChange={(event) => setProgram({ ...program, enabled: event.target.checked })} />برنامج الولاء فعّال</label>
          <div className={s.twoFields}>
            <label className={s.field}>عدد الأختام<input type="number" min={1} max={100} required value={program.purchasesRequired} disabled={busy} onChange={(event) => setProgram({ ...program, purchasesRequired: Number(event.target.value) })} /></label>
            <label className={s.field}>صلاحية المكافأة بالأيام<input type="number" min={1} max={365} required value={experience.rewardValidityDays} disabled={busy} onChange={(event) => setExperience({ ...experience, rewardValidityDays: Number(event.target.value) })} /></label>
          </div>
          <label className={s.field}>المكافأة<input value={program.rewardName} maxLength={80} minLength={2} required disabled={busy} onChange={(event) => setProgram({ ...program, rewardName: event.target.value })} /></label>
          <label className={s.field}>شروط المكافأة<textarea value={program.terms} maxLength={1000} disabled={busy} onChange={(event) => setProgram({ ...program, terms: event.target.value })} /></label>
          <p className={s.walletNote}>كل قراءة صحيحة للبطاقة تضيف ختمًا. عند اكتمال الأختام، تصدر مكافأة بباركود مستقل وصلاحية تبدأ من وقت إصدارها. تغيير الصلاحية يطبّق على المكافآت الجديدة.</p>
        </div>
        <div className={s.settingsGroup}><h2 className={s.sectionTitle}>قريب من الفرع</h2>
          <label className={s.field}>دعوة الزيارة<textarea maxLength={240} minLength={2} required value={experience.nearbyMessage} disabled={busy} onChange={(event) => setExperience({ ...experience, nearbyMessage: event.target.value })} /></label>
          <div className={s.twoFields}>
            <label className={s.field}>خط العرض<input dir="ltr" type="number" min={-90} max={90} step="any" value={latitude} disabled={busy} onChange={(event) => setLatitude(event.target.value)} /></label>
            <label className={s.field}>خط الطول<input dir="ltr" type="number" min={-180} max={180} step="any" value={longitude} disabled={busy} onChange={(event) => setLongitude(event.target.value)} /></label>
          </div>
          <p className={s.walletNote}>أضف إحداثيات الفرع لتفعيل الظهور بالقرب منه. أبل يدعم نص الدعوة؛ قوقل يحدد نص تنبيه القرب. ظهور التنبيه يعتمد على إعدادات موقع العميل وإشعارات المحفظة.</p>
        </div>
        <button className={s.button} disabled={busy || Boolean(configError)}>{busy ? "جاري حفظ البرنامج..." : "حفظ برنامج الولاء"}</button>
      </form>
      <div className={s.preview}><h2 className={s.sectionTitle}>بطاقة {identity.name}</h2>
        <BrandLoyaltyCard identity={identity} member={{ customerName: "بطاقة الولاء", cardCode: "PREVIEW", stamps: 0, required: Math.max(1, Math.min(100, program.purchasesRequired || 1)), rewardName: program.rewardName }} />
        <p className={s.walletNote}>معاينة الهوية. يحصل كل عميل على نفس العضوية في أبل وقوقل، باسم العميل وباركوده وأختامه الفعلية.</p>
        <div className={s.enrollment}><EnrollmentQr url={enrollmentUrl} name={identity.name} /><div><h3>من هنا تبدأ الحكاية</h3><p>ضع هذا الباركود عند الفرع. ينقل العميل إلى صفحة التسجيل بهويتك.</p><button type="button" className={s.textButton} onClick={() => downloadEnrollmentQr(enrollmentUrl, identity.slug)}>تحميل باركود التسجيل</button><a className={s.textButton} href={enrollmentUrl} target="_blank" rel="noopener noreferrer">فتح صفحة العضوية</a></div></div>
        <a className={s.button} style={{ marginTop: 24 }} href="/loyalty/scan">فتح صفحة قراءة بطاقات الولاء</a>
        <p className={s.walletNote}>صفحة مستقلة للموظف بعد تسجيل الدخول: قراءة بطاقة وإضافة ختم، أو قراءة مكافأة وصرفها.</p>
        <form className={`${s.form} ${s.rewards}`} onSubmit={(event) => { event.preventDefault(); void announce(); }}>
          <h2 className={s.sectionTitle}>كلمة لعملائك</h2>
          <p>أبل: {walletReady.apple ? "ربط جاهز" : "بانتظار الربط"} · قوقل: {walletReady.google ? "ربط جاهز" : "بانتظار الربط"}</p>
          <label className={s.field}>عنوان الإعلان<input value={title} maxLength={80} minLength={2} required disabled={sending} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className={s.field}>الرسالة<textarea value={body} maxLength={240} minLength={2} required disabled={sending} onChange={(event) => setBody(event.target.value)} /></label>
          <button className={s.button} disabled={sending || Boolean(configError) || (!walletReady.apple && !walletReady.google)}>{sending ? "جاري إرسال الإعلان..." : "إرسال للمحافظ"}</button>
          <p className={s.walletNote}>للعملاء الذين حفظوا البطاقة وفعّلوا إشعاراتها. وصول التنبيه تحكمه سياسات المحفظة؛ قوقل يسمح بثلاثة تنبيهات لكل بطاقة خلال ٢٤ ساعة.</p>
        </form>
      </div>
    </div>
    <section className={s.activity}><h2 className={s.sectionTitle}>آخر الأختام والمكافآت</h2>
      {dashboard.events.length ? <table><thead><tr><th>العميل</th><th>العملية</th><th>الأختام بعد العملية</th><th>الموظف</th><th>التاريخ</th></tr></thead><tbody>{dashboard.events.map((event) => <tr key={event.id}><td>{event.customerName}</td><td>{event.eventType === "stamp" ? "إضافة ختم" : event.eventType === "redeem" ? "صرف مكافأة" : "إلغاء"}</td><td>{event.stampsAfter}</td><td>{event.cashierName}</td><td>{new Date(event.createdAt).toLocaleDateString("ar-SA-u-ca-gregory", { timeZone: "Asia/Riyadh" })}</td></tr>)}</tbody></table> : <p>أول زيارة تبدأ أول حكاية. عمليات الأختام والمكافآت تظهر هنا.</p>}
    </section>
  </section>;
}
