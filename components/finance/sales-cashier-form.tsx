"use client";

import { useRef, useState } from "react";
import { Field } from "./finance-ui";
import styles from "./finance.module.css";
import { isSalesCashierPassword, SALES_CASHIER_PASSWORD_HINT, SALES_CASHIER_PASSWORD_PATTERN } from "@/lib/finance/sales-cashier-password";

export function SalesCashierForm({ pending, error, onCancel, onSubmit }: {
  pending: boolean; error: string; onCancel: () => void;
  onSubmit: (operation: "sales_cashier_create", payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [visible, setVisible] = useState(false);
  const [localError, setLocalError] = useState("");
  const busy = useRef(false);
  return <form className={styles.form} onSubmit={async event => {
    event.preventDefault(); if (pending || busy.current) return;
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get("password") ?? "");
    if (!isSalesCashierPassword(password)) { setLocalError(SALES_CASHIER_PASSWORD_HINT); return; }
    setLocalError("");
    busy.current = true;
    try { await onSubmit("sales_cashier_create", { name: String(fields.get("name") ?? "").trim(), phone: String(fields.get("phone") ?? "").trim(), password: String(fields.get("password") ?? "") }); }
    finally { busy.current = false; }
  }}>
    <p className={styles.notice}>حساب مخصص للمبيعات ونقطة البيع والوردية لا يمنح صلاحيات لوحة تحكم العلامة أو كاشير الولاء</p>
    {(localError || error) && <p role="alert" className={styles.error}>{localError || error}</p>}
    <fieldset disabled={pending} className={styles.form} style={{ border: 0, padding: 0, margin: 0 }}>
      <div className={styles.fields}>
        <Field label="اسم كاشير المبيعات"><input name="name" required minLength={2} maxLength={100} autoComplete="off" /></Field>
        <Field label="رقم الجوال" hint="يستخدمه الموظف للدخول إلى نقطة البيع"><input name="phone" type="tel" inputMode="tel" dir="ltr" required maxLength={30} autoComplete="off" placeholder="05xxxxxxxx" /></Field>
      </div>
      <Field label="كلمة المرور" hint={`${SALES_CASHIER_PASSWORD_HINT} — للحساب الجديد فقط ولا تستبدل كلمة مرور العميل المسجل`}><input name="password" type={visible ? "text" : "password"} dir="ltr" required minLength={8} maxLength={128} pattern={SALES_CASHIER_PASSWORD_PATTERN} title={SALES_CASHIER_PASSWORD_HINT} autoComplete="new-password" /></Field>
      <label className={styles.check}><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} />إظهار كلمة المرور</label>
      <div className={styles.notice}>للموظف الجديد تُرسل كلمة المرور ورابط الدخول على واتساب إذا كان مسجلًا كعميل يُربط حسابه دون تغيير كلمته الحالية ويصله رابط الدخول برمز واتساب</div>
      <div className={styles.formFooter}><button type="submit" className={styles.primary}>{pending ? "جار إضافة الكاشير" : "إضافة كاشير المبيعات"}</button><button type="button" className={styles.secondary} onClick={onCancel}>إلغاء</button></div>
    </fieldset>
  </form>;
}
