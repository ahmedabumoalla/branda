"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, ArrowUpLeft } from "lucide-react";
import { loginFinanceAction } from "@/app/actions/finance-access";
import styles from "./finance-login.module.css";

export function HospitalLogin({ slug }: { slug: string }) {
  const router = useRouter(), lock = useRef(false);
  const [english, setEnglish] = useState(false), [busy, setBusy] = useState(false), [visible, setVisible] = useState(false), [error, setError] = useState("");
  const t = (ar: string, en: string) => english ? en : ar;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return;
    const form = new FormData(event.currentTarget);
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await loginFinanceAction(slug, String(form.get("identity") ?? ""), String(form.get("password") ?? ""));
      if (result.ok) { router.replace(result.redirectTo); router.refresh(); }
      else setError(t("تعذر الدخول تحقق من بيانات الحساب وصلاحيته", "Unable to sign in Check your credentials and account access"));
    } catch { setError(t("تعذر الاتصال حاول مرة أخرى", "Unable to connect Please try again")); }
    finally { lock.current = false; setBusy(false); }
  }
  return <main className={styles.page} dir={english ? "ltr" : "rtl"} lang={english ? "en" : "ar"}>
    <section className={styles.story}><span>MIND CAFÉ &amp; BAKERY</span><h1>{t("مايند المستشفى", "MIND Hospital")}</h1><p>{t("الطلبات والمبيعات ومديونيات العيادات في مكان واحد", "Orders, sales and clinic receivables in one place")}</p><div className={styles.rule} /><small>{t("دخول مستقل لفريق مايند", "Independent access for the MIND team")}</small></section>
    <section className={styles.panel} aria-labelledby="mind-login-title"><button type="button" className={styles.switchLink} onClick={() => { setEnglish(!english); setError(""); }} disabled={busy}>{english ? "العربية" : "English"}</button><div className={styles.mark}><LockKeyhole aria-hidden="true" /></div><h2 id="mind-login-title">{t("دخول مايند", "Sign in to MIND")}</h2><form onSubmit={submit} aria-busy={busy}>
      <label>{t("اسم المستخدم أو الجوال أو البريد", "Username, phone or email")}<input name="identity" autoComplete="username" required maxLength={254} placeholder={t("مايند", "Your account username")} disabled={busy} /></label>
      <label>{t("كلمة المرور", "Password")}<div className={styles.password}><input name="password" autoComplete="current-password" type={visible ? "text" : "password"} required maxLength={128} dir="ltr" disabled={busy} /><button type="button" aria-label={visible ? t("إخفاء كلمة المرور", "Hide password") : t("إظهار كلمة المرور", "Show password")} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div></label>
      {error && <p className={styles.error} role="alert">{error}</p>}<button className={styles.submit} disabled={busy} type="submit">{busy ? t("جار الدخول", "Signing in") : t("دخول", "Sign in")}<ArrowUpLeft aria-hidden="true" /></button>
    </form></section>
  </main>;
}
