"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Globe2 } from "lucide-react";
import { requestHospitalCustomerOtpAction, completeHospitalCustomerOtpAction } from "@/app/actions/hospital-customer-auth";
import { hospitalAccountEntryHref } from "@/lib/commerce/hospital-account-routing";
import s from "./doctor-account.module.css";
import form from "./doctor-login.module.css";

export function HospitalDoctorLogin() {
  const router = useRouter();
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const t = (ar: string, en: string) => language === "ar" ? ar : en;
  useEffect(() => { if (stage === "code") codeInput.current?.focus(); }, [stage]);
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  async function requestCode() {
    if (lock.current || remaining > 0 || !phone.trim()) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await requestHospitalCustomerOtpAction("mind-hospital", phone.trim());
      if (!result.required || !result.ok) {
        if (result.required && result.retryAfterSeconds) setRemaining(result.retryAfterSeconds);
        setError(result.required && language === "ar" ? result.message : t("خدمة التحقق غير متاحة حاليًا حاول لاحقًا", "Verification is unavailable Please try again later"));
        return;
      }
      setMaskedPhone(result.maskedPhone); setRemaining(result.resendAfterSeconds); setCode(""); setStage("code");
    } catch { setError(t("تعذر الاتصال حاول مرة أخرى", "Could not connect Please try again")); }
    finally { lock.current = false; setBusy(false); }
  }

  async function verifyCode() {
    if (lock.current) return;
    if (!/^\d{6}$/.test(code)) { setError(t("أدخل رمز التحقق المكوّن من ٦ أرقام", "Enter the six digit verification code")); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await completeHospitalCustomerOtpAction("mind-hospital", phone.trim(), code);
      if (!result.ok) { setError(language === "ar" ? result.message : "Could not verify the code Check the code and try again"); return; }
      router.replace(hospitalAccountEntryHref());
    } catch { setError(t("تعذر الاتصال حاول مرة أخرى", "Could not connect Please try again")); }
    finally { lock.current = false; setBusy(false); }
  }

  return <main className={s.page} dir={language === "ar" ? "rtl" : "ltr"} lang={language}>
    <div className={form.shell}>
      <header className={s.header}>
        <Link href="/menu/mind-hospital" className={s.brand} aria-label={t("منيو MND", "MND menu")}><Image src="/menu-art/dabab/dabab-hospital-logo-v1.webp" alt="MND Café & Bakery" width={140} height={60} priority /></Link>
        <button type="button" className={s.button} onClick={() => { setLanguage(language === "ar" ? "en" : "ar"); setError(""); }}><Globe2 size={17} aria-hidden="true" />{language === "ar" ? "English" : "العربية"}</button>
      </header>
      <section className={s.welcome}>
        <p className={s.eyebrow}>{t("MND · المستشفى", "MND · Hospital")}</p>
        <h1>{t("فواتيرك وحسابك", "Your invoices and account")}</h1>
        <p className={s.intro}>{t("استخدم رقم الجوال نفسه المسجل في طلباتك", "Use the same mobile number you entered in your orders")}</p>
      </section>
      <form className={form.form} aria-busy={busy} onSubmit={event => { event.preventDefault(); if (stage === "phone") void requestCode(); else void verifyCode(); }}>
        {stage === "phone" ? <label className={form.field}>{t("رقم الجوال", "Mobile number")}<input required type="tel" inputMode="tel" autoComplete="tel" dir="ltr" maxLength={25} placeholder="05xxxxxxxx" value={phone} disabled={busy} onChange={event => { setPhone(event.target.value); setError(""); }} /></label>
          : <><p className={form.hint}>{t("أرسلنا رمز التحقق إلى", "We sent a verification code to")} <bdi>{maskedPhone}</bdi></p><label className={form.field}>{t("رمز التحقق", "Verification code")}<input ref={codeInput} required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} dir="ltr" value={code} disabled={busy} onChange={event => { setCode(event.target.value.replace(/[^0-9]/g, "")); setError(""); }} /></label></>}
        {error && <p className={form.error} role="alert">{error}</p>}
        <button className={s.primary} type="submit" disabled={busy || (stage === "phone" && remaining > 0)}>{busy ? t("جارٍ التحقق", "Please wait") : stage === "phone" ? t("إرسال رمز التحقق", "Send verification code") : t("تحقق وافتح حسابي", "Verify and open my account")}</button>
        {remaining > 0 && <p className={form.hint}>{t("يمكن إعادة الإرسال بعد", "You can resend in")} <bdi>{remaining}</bdi> {t("ثانية", "seconds")}</p>}
        {stage === "code" && <div className={form.actions}><button className={s.button} type="button" disabled={busy || remaining > 0} onClick={() => void requestCode()}>{t("إعادة إرسال الرمز", "Resend code")}</button><button className={s.button} type="button" disabled={busy} onClick={() => { setStage("phone"); setCode(""); setError(""); }}>{t("تغيير رقم الجوال", "Change mobile number")}</button></div>}
      </form>
      <div className={form.back}><Link className={s.menuLink} href={hospitalAccountEntryHref()}>{t("العودة للحساب", "Back to account")}</Link><Link className={s.menuLink} href="/menu/mind-hospital">{t("العودة للمنيو", "Back to menu")}</Link></div>
    </div>
  </main>;
}
