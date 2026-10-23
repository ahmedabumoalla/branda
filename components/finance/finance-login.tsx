"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, ArrowUpLeft } from "lucide-react";
import { loginFinanceAction } from "@/app/actions/finance-access";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import styles from "./finance-login.module.css";

export function FinanceLogin({ slug }: { slug: string }) {
  const router = useRouter();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const form = new FormData(event.currentTarget);
    locked.current = true; setBusy(true); setError("");
    try {
      const result = await loginFinanceAction(slug, String(form.get("identity") ?? ""), String(form.get("password") ?? ""));
      if (result.ok) { router.replace(result.redirectTo); router.refresh(); }
      else setError(result.message);
    } catch { setError("تعذر الاتصال حاول مرة أخرى"); }
    finally { locked.current = false; setBusy(false); }
  }
  return <main className={styles.page} dir="rtl">
    <section className={styles.story}><BarndaksaLogo /><span>برندة المالية</span><h1>كل حركة محسوبة<br /><em>وكل رصيد واضح</em></h1><p>المبيعات والمخزون والورديات في مساحة عمل واحدة</p><div className={styles.rule} /><small>مساحة مالية مستقلة للعلامة وفريقها</small></section>
    <section className={styles.panel} aria-labelledby="finance-login-title">
      <div className={styles.mark}><LockKeyhole aria-hidden="true" /></div><p className={styles.kicker}>دخول الفريق المالي</p>
      <h2 id="finance-login-title">جاهز لبداية الوردية</h2><p className={styles.hint}>استخدم الحساب الذي أضافه مسؤول العلامة إلى المالية</p>
      <form onSubmit={submit} aria-busy={busy}>
        <label>البريد الإلكتروني أو رقم الجوال<input name="identity" autoComplete="username" required maxLength={254} dir="ltr" disabled={busy} /></label>
        <label>كلمة المرور<div className={styles.password}><input name="password" autoComplete="current-password" type={visible ? "text" : "password"} required maxLength={128} dir="ltr" disabled={busy} /><button type="button" aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div></label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.submit} disabled={busy} type="submit">{busy ? "جار تسجيل الدخول" : "الدخول إلى كاشير المالية"}<ArrowUpLeft aria-hidden="true" /></button>
      </form>
      <p className={styles.note}>تحتاج صلاحية دخول؟ تواصل مع مسؤول العلامة</p>
    </section>
  </main>;
}
