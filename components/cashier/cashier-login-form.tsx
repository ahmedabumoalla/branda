"use client";

import Link from "next/link";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { loginCashierAction, requestCashierOtpAction, verifyCashierOtpAction } from "@/app/actions/cashier";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { CashierLanguageSwitch, useCashierLanguage } from "./cashier-language";
import { CashierSystemSwitch } from "./cashier-system-switch";
import styles from "./cashier-login.module.css";

export function CashierLoginForm({ initialMessage = "" }: { initialMessage?: string }) {
  const { t, errorText, dir, locale } = useCashierLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"whatsapp" | "password">("whatsapp");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!retryAt) return;
    const update = () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  async function requestCode() {
    const result = await requestCashierOtpAction(phone);
    setMessage(result.message);
    if (result.retryAfterSeconds) {
      setRemaining(result.retryAfterSeconds);
      setRetryAt(Date.now() + result.retryAfterSeconds * 1000);
    }
    if (result.ok) { setCodeSent(true); setCode(""); }
  }

  async function resend() {
    if (loading || remaining > 0) return;
    setLoading(true);
    try { await requestCode(); }
    catch { setMessage("تعذر إرسال رمز واتساب حاول مجددًا بعد قليل"); }
    finally { setLoading(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage("");
    try {
      if (mode === "whatsapp" && !codeSent) {
        await requestCode();
      } else {
        const result = mode === "password" ? await loginCashierAction(email, password) : await verifyCashierOtpAction(code);
        if (result && !result.ok) setMessage(result.message);
      }
    } catch {
      setMessage("تعذر بدء جلسة نقطة التشغيل حاول مجددًا");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main dir={dir} lang={locale} className={styles.page}>
      <section className={styles.panel} aria-labelledby="loyalty-login-title">
        <header className={styles.header}><BarndaksaLogo variant="dark" width={112} height={45} className={styles.logo} priority /><CashierLanguageSwitch dark /></header>
        <div className={styles.body}>
          <CashierSystemSwitch active="loyalty" compact />
          <h1 id="loyalty-login-title" className={styles.heading}>{t("دخول كاشير الولاء")}</h1>
          <div className={styles.loginModes} role="group" aria-label={t("طريقة الدخول")}>
            {(["whatsapp", "password"] as const).map(value => <button key={value} type="button" disabled={loading} aria-pressed={mode === value}
              onClick={() => { setMode(value); setMessage(""); }}>
              {value === "whatsapp" ? t("رمز واتساب") : t("البريد وكلمة المرور")}
            </button>)}
          </div>
          <form onSubmit={submit} className={styles.form} aria-busy={loading}>
          <fieldset disabled={loading} className={styles.fields}>
          {mode === "password" ? <>
          <label className={styles.field}>{t("البريد الإلكتروني")} <input
              type="email"
              dir="ltr"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="cashier@example.com"
            />
          </label>
          <label className={styles.field}>{t("كلمة المرور")} <span className={styles.password}>
              <input
                type={showPassword ? "text" : "password"}
                dir="ltr"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-pressed={showPassword}
                aria-label={showPassword ? t("إخفاء كلمة المرور") : t("إظهار كلمة المرور")}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </span>
          </label>
          </> : <>
            <label className={styles.field}>{t("رقم واتساب")}
              <input type="tel" dir="ltr" inputMode="tel" autoComplete="tel" required maxLength={30} readOnly={codeSent} value={phone}
                onChange={event => setPhone(event.target.value)} placeholder="05xxxxxxxx" />
            </label>
            {codeSent ? <>
              <button type="button" onClick={() => { setCodeSent(false); setCode(""); setMessage(""); }} className={styles.switchLink}>{t("تغيير الرقم")}</button>
              <label className={styles.field}>{t("رمز التحقق")}
                <input type="text" dir="ltr" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} value={code}
                  onChange={event => setCode(event.target.value)} autoFocus
                  className={styles.code} />
              </label>
              <button type="button" disabled={loading || remaining > 0} onClick={() => void resend()} className={styles.switchLink}>
                {remaining > 0 ? t({ text: "إعادة الإرسال بعد {seconds} ثانية", values: { seconds: remaining } }) : t("إعادة إرسال الرمز")}
              </button>
            </> : null}
          </>}
          </fieldset>
          {message ? (
            <p role="status" className={styles.notice}>
              {errorText(message)}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading || (mode === "whatsapp" && !codeSent && remaining > 0)}
            className={styles.submit}
          >
            {loading ? <Loader2 className={styles.spinner} /> : <LogIn className="h-5 w-5" />}
            {loading ? t("جارٍ التحقق") : mode === "whatsapp" && !codeSent ? t("أرسل رمز واتساب") : t("دخول")}
          </button>
          </form>
          <details className={styles.help}><summary>{t("مساعدة الدخول")}</summary>
            <p className={styles.hint}>{mode === "whatsapp" ? t("للحسابات الجديدة أدخل رقم واتساب المسجل لدى الفرع") : t("الحسابات السابقة تدخل بالبريد وكلمة المرور المعتادة")}</p>
            <div className={styles.helpLinks}><Link href="/cashier/login" className={styles.switchLink}>{t("اختيار نوع الكاشير")}</Link><Link href="/login" className={styles.switchLink}>{t("العودة إلى تسجيل الدخول العام")}</Link></div>
          </details>
        </div>
      </section>
    </main>
  );
}
