"use client";

import Link from "next/link";
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { loginCashierAction, requestCashierOtpAction, verifyCashierOtpAction } from "@/app/actions/cashier";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { CashierLanguageSwitch, useCashierLanguage } from "./cashier-language";

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
    <main dir={dir} lang={locale} className="grid min-h-dvh place-items-center bg-[#F8F4EF] px-4 py-8 text-[#311912]">
      <section className="w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-xl">
        <div className="bg-[#311912] px-6 py-7 text-white sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-5"><BarndaksaLogo variant="dark" width={128} height={52} priority /><CashierLanguageSwitch dark /></div>
          <div className="mt-5 flex items-center gap-2 text-xs font-black text-emerald-200">
            <ShieldCheck className="h-4 w-4" />{t("دخول مخصص لموظفي الفرع")} </div>
        </div>
        <form onSubmit={submit} className="p-6 sm:p-8">
          <h1 className="text-2xl font-black">{t("دخول نقطة التشغيل")} </h1>
          <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">{mode === "whatsapp" ? t("للحسابات الجديدة أدخل رقم واتساب المسجل لدى الفرع") : t("الحسابات السابقة تدخل بالبريد وكلمة المرور المعتادة")}</p>
          <div className="mt-5 grid grid-cols-2 gap-2" role="group" aria-label={t("طريقة الدخول")}>
            {(["whatsapp", "password"] as const).map(value => <button key={value} type="button" disabled={loading} aria-pressed={mode === value}
              onClick={() => { setMode(value); setMessage(""); }}
              className={`min-h-12 rounded-xl border px-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6B3A25] disabled:opacity-60 ${mode === value ? "border-[#6B3A25] bg-[#F8F4EF] text-[#6B3A25]" : "border-[#E8DED5]"}`}>
              {value === "whatsapp" ? t("رمز واتساب") : t("البريد وكلمة المرور")}
            </button>)}
          </div>
          <fieldset disabled={loading}>
          {mode === "password" ? <>
          <label className="mt-6 block text-sm font-black">{t("البريد الإلكتروني")} <input
              type="email"
              dir="ltr"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] bg-[#FCFAF7] px-4 outline-none focus:border-[#6B3A25]"
              placeholder="cashier@example.com"
            />
          </label>
          <label className="mt-4 block text-sm font-black">{t("كلمة المرور")} <span className="relative mt-2 block">
              <input
                type={showPassword ? "text" : "password"}
                dir="ltr"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-12 w-full rounded-2xl border border-[#E8DED5] bg-[#FCFAF7] px-4 pl-12 outline-none focus:border-[#6B3A25]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#6B3A25]"
                aria-label={showPassword ? t("إخفاء كلمة المرور") : t("إظهار كلمة المرور")}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </span>
          </label>
          </> : <>
            <label className="mt-6 block text-sm font-black">{t("رقم واتساب")}
              <input type="tel" dir="ltr" inputMode="tel" autoComplete="tel" required maxLength={30} readOnly={codeSent} value={phone}
                onChange={event => setPhone(event.target.value)} placeholder="05xxxxxxxx"
                className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] bg-[#FCFAF7] px-4 outline-none focus:border-[#6B3A25]" />
            </label>
            {codeSent ? <>
              <button type="button" onClick={() => { setCodeSent(false); setCode(""); setMessage(""); }} className="mt-1 min-h-11 text-sm font-bold text-[#6B3A25] underline underline-offset-4">{t("تغيير الرقم")}</button>
              <label className="mt-2 block text-sm font-black">{t("رمز التحقق")}
                <input type="text" dir="ltr" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} value={code}
                  onChange={event => setCode(event.target.value)} autoFocus
                  className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] bg-[#FCFAF7] px-4 text-center text-xl tracking-[0.3em] outline-none focus:border-[#6B3A25]" />
              </label>
              <button type="button" disabled={loading || remaining > 0} onClick={() => void resend()} className="mt-2 min-h-11 text-sm font-bold text-[#6B3A25] underline underline-offset-4 disabled:opacity-50">
                {remaining > 0 ? t({ text: "إعادة الإرسال بعد {seconds} ثانية", values: { seconds: remaining } }) : t("إعادة إرسال الرمز")}
              </button>
            </> : null}
          </>}
          </fieldset>
          {message ? (
            <p role="status" className="mt-4 rounded-xl bg-[#F8F4EF] p-3 text-sm font-bold leading-6 text-[#6B3A25]">
              {errorText(message)}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading || (mode === "whatsapp" && !codeSent && remaining > 0)}
            className="mt-6 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#6B3A25] px-5 font-black text-white disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
            {loading ? t("جارٍ التحقق") : mode === "whatsapp" && !codeSent ? t("أرسل رمز واتساب") : t("دخول")}
          </button>
          <Link href="/login" className="mt-5 block text-center text-sm font-black text-[#6B3A25] underline underline-offset-4">{t("العودة إلى تسجيل الدخول العام")} </Link>
        </form>
      </section>
    </main>
  );
}
