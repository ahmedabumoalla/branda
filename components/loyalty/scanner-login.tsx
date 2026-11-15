"use client";
import { useActionState } from "react";
import s from "./brand-loyalty.module.css";

export function ScannerLogin({ action }: { action: (state: { message: string }, form: FormData) => Promise<{ message: string }> }) {
  const [state, submit, pending] = useActionState(action, { message: "" });
  return <main dir="rtl" className={s.page}><section className={s.scanner}>
    <p className={s.eyebrow}>برندة · للموظفين</p><h1>أختام ومكافآت، بخطوة</h1><p>سجّل الدخول بحساب الموظف لقراءة بطاقات علامتك.</p>
    <form action={submit} className={s.form}>
      <label className={s.field}>بريد الموظف<input name="email" type="email" dir="ltr" autoComplete="username" maxLength={254} required disabled={pending} /></label>
      <label className={s.field}>كلمة المرور<input name="password" type="password" dir="ltr" autoComplete="current-password" maxLength={200} required disabled={pending} /></label>
      {state.message && <p role="alert" className={s.error}>{state.message}</p>}
      <button className={s.button} disabled={pending}>{pending ? "جاري الدخول..." : "دخول لصفحة القراءة"}</button>
    </form>
  </section></main>;
}
