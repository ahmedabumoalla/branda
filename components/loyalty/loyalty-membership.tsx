"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completeLoyaltyOtpAction, requestLoyaltyOtpAction } from "@/app/actions/loyalty-experience";
import { BrandLoyaltyCard } from "./brand-loyalty-card";
import { SecureQrCode } from "./secure-qr-code";
import type { LoyaltyIdentity, LoyaltyMemberCard } from "@/lib/loyalty/experience-types";
import s from "./brand-loyalty.module.css";

type Reward = { rewardCode: string; rewardTitle: string; expiresAt: string | null };

export function LoyaltyMembership({ identity, member, rewards, walletReady, enabled, terms }: {
  identity: LoyaltyIdentity; member: LoyaltyMemberCard | null; rewards: Reward[];
  walletReady: { apple: boolean; google: boolean }; enabled: boolean; terms: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<"join" | "verify">("join");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [maskedPhone, setMaskedPhone] = useState("");
  const [welcome, setWelcome] = useState("");
  const lock = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === "verify") codeInput.current?.focus();
  }, [stage]);
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  async function submit(resend = false) {
    if (lock.current || (resend && remaining > 0)) return;
    if (name.trim().length < 2) { setError("اكتب اسمك حتى نرحّب فيك."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      if (stage === "join" || resend) {
        const result = await requestLoyaltyOtpAction(identity.slug, phone);
        if (!result.required) { setError("خدمة التحقق بالواتساب غير متاحة حاليًا. جرّب لاحقًا."); return; }
        if (!result.ok) {
          setError(result.message);
          if ("retryAfterSeconds" in result && result.retryAfterSeconds) setRemaining(result.retryAfterSeconds);
          return;
        }
        setMaskedPhone(result.maskedPhone); setRemaining(result.resendAfterSeconds); setCode(""); setStage("verify");
      } else {
        const result = await completeLoyaltyOtpAction(identity.slug, phone, code, name.trim());
        if (!result.ok) { setError(result.message); return; }
        setWelcome(result.returningCustomer ? "يا هلا برجعتك، مكانك ومكافآتك محفوظة." : "صرت من أهلنا، ومكافأتك تبدأ من أول زيارة.");
        router.refresh();
      }
    } catch { setError("تعذر الاتصال. حاول مرة ثانية، بياناتك محفوظة هنا."); }
    finally { lock.current = false; setBusy(false); }
  }

  return <main className={s.page} dir="rtl"><div className={s.container}>
    <header className={s.masthead}>
      {identity.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */
        <img src={identity.logoUrl} alt={identity.name} /> : <span>{identity.name}</span>}
      <a href={identity.slug === "rast" ? "/menu/rast" : `/c/${identity.slug}`}>اكتشف المنيو</a>
    </header>
    {!enabled ? <div className={s.intro}><h1>ننتظرك قريبًا</h1><p>برنامج الولاء غير متاح حاليًا. يسعدنا نشوفك في {identity.name}.</p></div>
      : member ? <>
        <div className={s.intro}><p className={s.eyebrow}>أهلًا بك في {identity.name}</p><h1>يا هلا، {member.customerName}</h1><p aria-live="polite">{welcome || "وجودك له طعم مختلف. بطاقتك معك، وكل زيارة تقرّبك من مكافأتك."}</p></div>
        <div className={s.wallets}>
          {(["apple", "google"] as const).map((provider) => <section className={s.wallet} key={provider}>
            <h2>{provider === "apple" ? "بطاقتك لمحفظة أبل" : "بطاقتك لمحفظة قوقل"}</h2>
            <BrandLoyaltyCard identity={identity} member={member} />
            {walletReady[provider] ? <a className={s.button} href={`/api/wallet/${provider}/${encodeURIComponent(member.cardCode)}`}>{provider === "apple" ? "إضافة إلى محفظة أبل" : "إضافة إلى محفظة قوقل"}</a>
              : <button type="button" className={s.button} disabled>{provider === "apple" ? "إضافة إلى محفظة أبل" : "إضافة إلى محفظة قوقل"}</button>}
            <p className={s.walletNote}>{walletReady[provider] ? "هذه نسخة من عضويتك نفسها؛ الأختام والمكافآت مشتركة بين المحفظتين." : "حفظ البطاقة متاح بعد اكتمال ربط المحفظة. تقدر تستخدم باركود عضويتك الآن."}</p>
          </section>)}
        </div>
        <section className={s.rewards}><h2>مكافآتك، على ذوقك</h2>
          {rewards.length ? rewards.map((reward) => <article className={s.reward} key={reward.rewardCode}>
            <div><h3>{reward.rewardTitle}</h3><p>اعرض الباركود للموظف لاستلام المكافأة.</p>{reward.expiresAt && <p>صالحة حتى {new Date(reward.expiresAt).toLocaleDateString("ar-SA-u-ca-gregory", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" })}</p>}</div>
            <SecureQrCode kind="customer-reward" value={reward.rewardCode} title="باركود استلام المكافأة" size={130} />
          </article>) : <p>كمّل {member.required} أختام، ومكافأتك بتظهر هنا.</p>}
          {terms && <p className={s.walletNote}>{terms}</p>}
          <button type="button" className={s.textButton} onClick={() => router.refresh()}>تحديث أختامي ومكافآتي</button>
        </section>
      </> : <div className={s.join}>
        <div className={s.joinIntro}><p className={s.eyebrow}>لأهل {identity.name}</p><h1>كل زيارة حكاية.<br />ومكافأتك تتمّمها.</h1><p>خلّ بطاقتك معك. اجمع أختامك، وارجع للحظة تستاهلها.</p><p className={s.joinSignature} dir="ltr">A LITTLE MORE, JUST FOR YOU.</p></div>
        <form className={s.form} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <h2>{stage === "join" ? "حيّاك بين أهلنا" : "باقي خطوة ونرحّب فيك"}</h2>
          <p>{stage === "join" ? "اسمك ورقم جوالك يكفون. عندك حساب؟ نرجعك لنفس عضويتك بعد التحقق." : `أرسلنا رمزًا على واتساب للرقم ${maskedPhone}.`}</p>
          {stage === "join" ? <>
            <label className={s.field}>الاسم<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" minLength={2} maxLength={120} required disabled={busy} /></label>
            <label className={s.field}>رقم الجوال<input dir="ltr" type="tel" inputMode="tel" autoComplete="tel" placeholder="05xxxxxxxx" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={16} required disabled={busy} /></label>
          </> : <label className={s.field}>رمز التحقق<input ref={codeInput} dir="ltr" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ""))} required disabled={busy} /></label>}
          {error && <p className={s.error} role="alert">{error}</p>}
          <button className={s.button} disabled={busy}>{busy ? "لحظات..." : stage === "join" ? "أرسل رمز التحقق على واتساب" : "تحقق وافتح بطاقتي"}</button>
          {stage === "verify" && <div className={s.formFooter}>
            <button type="button" className={s.textButton} disabled={busy || remaining > 0} onClick={() => void submit(true)}>{remaining ? `إعادة الإرسال بعد ${remaining} ثانية` : "إعادة إرسال الرمز"}</button>
            <button type="button" className={s.textButton} disabled={busy} onClick={() => { setStage("join"); setCode(""); setError(""); }}>تغيير رقم الجوال</button>
          </div>}
          <p className={s.walletNote}>نرسل رمز التحقق عبر خدمة برندة. يحافظ التحقق على عضويتك وأختامك.</p>
        </form>
      </div>}
  </div></main>;
}
