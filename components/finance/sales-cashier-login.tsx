"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpLeft, Eye, EyeOff, ReceiptText } from "lucide-react";
import { loginSalesCashierAction, requestSalesCashierOtpAction, verifySalesCashierOtpAction, resetSalesCashierPasswordAction } from "@/app/actions/finance-access";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { CashierSystemSwitch } from "@/components/cashier/cashier-system-switch";
import { CashierLanguageSwitch, useCashierLanguage } from "@/components/cashier/cashier-language";
import { isSalesCashierPassword, SALES_CASHIER_PASSWORD_HINT, SALES_CASHIER_PASSWORD_PATTERN } from "@/lib/finance/sales-cashier-password";
import styles from "./finance-login.module.css";

export function salesCashierBrandDestination(slug: string, result: { redirectTo?: string; brands?: { slug: string; name: string }[] }) {
  const target = `/finance/${encodeURIComponent(slug)}/pos`;
  return result.redirectTo === target || result.brands?.some(brand => brand.slug === slug) ? target : null;
}

export function SalesCashierLogin({ slug }: { slug?: string } = {}) {
  const { t, errorText, dir, locale } = useCashierLanguage();
  const router = useRouter();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [brands, setBrands] = useState<{ slug: string; name: string }[]>([]);
  const [mode, setMode] = useState<"password" | "otp" | "reset">("password");
  const [otpPhone, setOtpPhone] = useState("");
  const [notice, setNotice] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busyRef.current) return;
    const form = event.currentTarget, fields = new FormData(form);
    busyRef.current = true; setBusy(true); setError("");
    try {
      const phone = String(fields.get("phone") ?? "");
      if (mode !== "password" && !otpPhone) {
        const requested = await requestSalesCashierOtpAction(phone);
        if (!requested.ok) setError(requested.message);
        else { setOtpPhone(phone); setNotice(requested.message); setRetryAt(Date.now() + 60_000); }
        return;
      }
      if (mode === "reset") {
        const password = String(fields.get("newPassword") ?? "");
        if (!isSalesCashierPassword(password)) { setError(SALES_CASHIER_PASSWORD_HINT); return; }
        if (password !== String(fields.get("confirmation") ?? "")) { setError("تأكيد كلمة المرور لا يطابق كلمة المرور الجديدة"); return; }
      }
      const result = mode === "reset"
        ? await resetSalesCashierPasswordAction(otpPhone, String(fields.get("code") ?? ""), String(fields.get("newPassword") ?? ""), String(fields.get("confirmation") ?? ""))
        : mode === "otp" ? await verifySalesCashierOtpAction(otpPhone, String(fields.get("code") ?? "")) : await loginSalesCashierAction(phone, String(fields.get("password") ?? ""));
      if (!result.ok) setError(result.message);
      else {
        if (slug) {
          const destination = salesCashierBrandDestination(slug, result);
          if (!destination) { setError("لا يوجد وصول نشط لكاشير المبيعات في هذه العلامة تواصل مع مالك العلامة"); return; }
          form.reset(); router.replace(destination); router.refresh(); return;
        }
        form.reset();
        if ("redirectTo" in result && result.redirectTo) { router.replace(result.redirectTo); router.refresh(); }
        else if (result.brands) setBrands(result.brands);
      }
    } catch { setError("تعذر الاتصال حاول مجددًا"); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function resend() {
    if (busyRef.current) return;
    if (Date.now() < retryAt) { setError("انتظر دقيقة بين طلبات رمز الدخول"); return; }
    busyRef.current = true; setBusy(true); setError("");
    try {
      const result = await requestSalesCashierOtpAction(otpPhone);
      if (result.ok) { setNotice(result.message); setRetryAt(Date.now() + 60_000); }
      else setError(result.message);
    } catch { setError("تعذر إرسال الرمز حاول مجددًا"); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <main className={styles.page} dir={dir} lang={locale}>
    <section className={styles.story}><BarndaksaLogo /><span>{t("كاشير المبيعات")}</span><h1>{t("نقطة بيعك")}<br /><em>{t("جاهزة لورديتك")}</em></h1><p>{t("أصناف علامتك وفواتيرها والتحصيل في مكان واحد")}</p><div className={styles.rule} /><small>{t("دخول مستقل للمبيعات والورديات")}</small></section>
    <section className={styles.panel} aria-labelledby="sales-login-title">
      <div className={styles.loginToolbar}><CashierLanguageSwitch /></div>
      <CashierSystemSwitch active="sales" />
      <div className={styles.mark}><ReceiptText aria-hidden="true" /></div><p className={styles.kicker}>{t("برندة المالية")}</p>
      <h2 id="sales-login-title">{t(mode === "reset" ? "تعيين كلمة مرور الكاشير" : "دخول كاشير المبيعات")}</h2><p className={styles.hint}>{t(mode === "reset" ? "تحقق برمز واتساب ثم اختر كلمة مرور جديدة لحسابك" : "ادخل بكلمة مرورك أو برمز واتساب إلى رقمك المسجل لدى العلامة")}</p>
      {!brands.length && <div className={styles.loginModes} role="group" aria-label={t("طريقة دخول كاشير المبيعات")}>{([['password', 'كلمة المرور'], ['otp', 'رمز واتساب']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={mode === value} disabled={busy} onClick={() => { setMode(value); setOtpPhone(""); setVisible(false); setNotice(""); setError(""); }}>{t(label)}</button>)}</div>}
      {brands.length ? <div className={styles.accessChoices}><p className={styles.hint}>{t("اختر العلامة لبدء العمل")}</p>{brands.map(brand => <Link className={styles.accessChoice} key={brand.slug} href={`/finance/${encodeURIComponent(brand.slug)}/pos`}><strong>{brand.name}</strong><ArrowUpLeft aria-hidden="true" /></Link>)}</div> : <form onSubmit={submit} aria-busy={busy}>
        <label>{t("رقم الجوال")}<input name="phone" type="tel" inputMode="tel" autoComplete="username" required maxLength={30} dir="ltr" placeholder="05xxxxxxxx" disabled={busy} readOnly={Boolean(otpPhone)} /></label>
        {mode === "password" && <label>{t("كلمة المرور")}<div className={styles.password}><input name="password" type={visible ? "text" : "password"} autoComplete="current-password" required maxLength={128} dir="ltr" disabled={busy} /><button type="button" disabled={busy} aria-label={t(visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور")} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div></label>}
        {mode === "password" && <p className={styles.hint}>{t("إذا كان حسابك مسجلًا كعميل استخدم كلمة مروره الحالية أو رمز واتساب كلمة المرور المحددة عند إضافتك ككاشير لا تغيّر كلمة حسابك السابق")}</p>}
        {mode === "password" && <button type="button" className={styles.switchLink} disabled={busy} onClick={() => { setMode("reset"); setOtpPhone(""); setVisible(false); setNotice(""); setError(""); }}>{t("نسيت كلمة المرور أو تريد تعيينها؟")}</button>}
        {mode !== "password" && otpPhone && <label>{t("رمز الدخول")}<input name="code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" required minLength={6} maxLength={6} pattern="[0-9٠-٩۰-۹]{6}" disabled={busy} /></label>}
        {mode === "reset" && otpPhone && <>
          <label>{t("كلمة المرور الجديدة")}<div className={styles.password}><input name="newPassword" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={128} pattern={SALES_CASHIER_PASSWORD_PATTERN} aria-describedby="sales-password-policy" dir="ltr" disabled={busy} /><button type="button" disabled={busy} aria-label={t(visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور")} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div></label>
          <p id="sales-password-policy" className={styles.hint}>{t(SALES_CASHIER_PASSWORD_HINT)}</p>
          <label>{t("تأكيد كلمة المرور الجديدة")}<input name="confirmation" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={128} dir="ltr" disabled={busy} /></label>
        </>}
        {notice && <p className={styles.hint} role="status">{t(notice)}</p>}
        {error && <p className={styles.error} role="alert">{errorText(error)}</p>}
        {error && mode === "password" && <button type="button" className={styles.switchLink} disabled={busy} onClick={() => { setMode("otp"); setOtpPhone(""); setNotice(""); setError(""); }}>{t("الدخول برمز واتساب بدل كلمة المرور")}</button>}
        <button type="submit" className={styles.submit} disabled={busy}>{t(busy ? "جار التحقق" : mode !== "password" && !otpPhone ? "أرسل رمز واتساب" : mode === "reset" ? "حفظ كلمة المرور والدخول" : "الدخول إلى نقطة البيع")}<ArrowUpLeft aria-hidden="true" /></button>
        {mode !== "password" && otpPhone && <button type="button" className={styles.switchLink} disabled={busy} onClick={resend}>{t("إعادة إرسال الرمز بعد دقيقة")}</button>}
      </form>}
      {slug && <Link className={styles.switchLink} href={`/finance/${encodeURIComponent(slug)}/login?access=management`}>{t("دخول الإدارة المالية")}</Link>}
    </section>
  </main>;
}
