import React, { useEffect, useRef, useState } from "react";
import type { FinanceSnapshot } from "../../lib/finance/brand-finance";
import styles from "../../components/finance/finance.module.css";
import { localRequest } from "./api";
import { InitialRestore } from "./backup";

export type LocalSession = { authenticated: boolean; initialized: boolean; csrf?: string; snapshot?: FinanceSnapshot; user?: { id: string; name: string; username: string; role: string } };

export function LocalAuth({ session, refresh }: { session: LocalSession; refresh: () => Promise<LocalSession> }) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  return <main className="offline-auth">
    <img src="/brand/barndaksa-logo-brown.png" alt="برندة" />
    <h1>{session.initialized ? "تسجيل الدخول" : "تشغيل مالية برندة المحلية"}</h1>
    <p>{session.initialized ? "ادخل بحسابك على هذا الجهاز" : "أنشئ حساب المالك وبيانات المنشأة"}</p>
    <form className={styles.form} noValidate aria-busy={pending} onSubmit={async event => {
      event.preventDefault();
      if (pending) return;
      const fields = new FormData(event.currentTarget);
      const data = { company: String(fields.get("company") || "").trim(), name: String(fields.get("name") || "").trim(), username: String(fields.get("username") || "").trim(), password: String(fields.get("password") || ""), confirmPassword: String(fields.get("confirmPassword") || "") };
      setError("");
      if (!session.initialized && (data.company.length < 2 || data.company.length > 150)) { setError("أدخل اسم المنشأة من حرفين إلى ١٥٠ حرفًا"); return; }
      if (!session.initialized && (data.name.length < 2 || data.name.length > 100)) { setError("أدخل اسم المالك من حرفين إلى ١٠٠ حرف"); return; }
      if (!/^[a-z0-9][a-z0-9_.-]{2,59}$/i.test(data.username)) { setError("اسم الدخول من ٣ إلى ٦٠ حرفًا إنجليزيًا أو رقمًا دون مسافات ويمكن استخدام النقطة والشرطة"); return; }
      if (data.password.length < 10 || data.password.length > 128) { setError("كلمة المرور يجب أن تكون من ١٠ إلى ١٢٨ حرفًا"); return; }
      if (!session.initialized && data.password !== data.confirmPassword) { setError("كلمتا المرور غير متطابقتين"); return; }
      setPending(true);
      const creating = !session.initialized;
      try {
        await localRequest(creating ? "/api/setup" : "/api/login", data);
        const current = await refresh();
        if (!current.authenticated || !current.snapshot) throw new Error(creating ? "تم إنشاء المؤسسة لكن تعذر تثبيت جلسة الدخول افتح البرنامج من ملف التشغيل واسمح بحفظ ملفات الارتباط المحلية ثم سجل الدخول بحسابك" : "تعذر تثبيت جلسة الدخول اسمح بحفظ ملفات الارتباط المحلية ثم حاول مجددًا");
      } catch (reason) {
        setError(reason instanceof TypeError ? "تعذر الاتصال بالبرنامج المحلي تأكد من بقاء نافذة التشغيل مفتوحة ثم حاول مجددًا" : reason instanceof Error ? reason.message : "تعذر إكمال الإعداد حاول مرة أخرى");
      } finally { setPending(false); }
    }}>
      {error && <p ref={errorRef} className={styles.error} role="alert" tabIndex={-1}>{error}</p>}
      {!session.initialized && <><label>اسم المنشأة<input name="company" required maxLength={150} disabled={pending} autoComplete="organization" /></label><label>اسم المالك<input name="name" required maxLength={100} disabled={pending} autoComplete="name" /></label></>}
      <label>اسم الدخول<input name="username" required maxLength={60} autoComplete="username" autoCapitalize="none" spellCheck={false} dir="ltr" disabled={pending} aria-describedby="offline-username-help" /><span className="offline-auth-hint" id="offline-username-help">بالإنجليزي أو الأرقام دون مسافات مثل owner</span></label>
      <label>كلمة المرور<input name="password" type="password" required minLength={10} maxLength={128} autoComplete={session.initialized ? "current-password" : "new-password"} disabled={pending} aria-describedby="offline-password-help" /><span className="offline-auth-hint" id="offline-password-help">١٠ أحرف على الأقل</span></label>
      {!session.initialized && <label>تأكيد كلمة المرور<input name="confirmPassword" type="password" required minLength={10} maxLength={128} autoComplete="new-password" disabled={pending} /></label>}
      <button type="submit" className={styles.primary} disabled={pending}>{pending ? session.initialized ? "جار الدخول" : "جار إنشاء المؤسسة وفتح المالية" : session.initialized ? "دخول" : "إنشاء حساب المالك"}</button>
    </form>
    {!session.initialized && <InitialRestore refresh={async () => { await refresh(); }} />}
    <small>تعمل هذه النسخة على جهازك دون إنترنت</small>
    <small>الإصدار 3.0.1</small>
  </main>;
}
