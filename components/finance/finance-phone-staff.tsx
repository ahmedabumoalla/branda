"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createFinancePhoneStaffAccountAction, fetchFinancePhoneStaffAction, resetFinancePhoneStaffPasswordAction } from "@/app/actions/finance-access";
import { financeRoleLabels, financeStaffRoles, type FinanceStaffRole } from "@/lib/finance/permissions";
import { isSalesCashierPassword, SALES_CASHIER_PASSWORD_HINT } from "@/lib/finance/sales-cashier-password";
import type { FinanceSnapshot, FinanceStaff } from "@/lib/finance/brand-finance";
import { Modal } from "@/components/dashboard/ui/modal";
import { Empty, Field, Panel } from "./finance-ui";
import styles from "./finance.module.css";

export function FinancePhoneStaff({ snapshot, disabled, onRefresh, onEdit }: { snapshot: FinanceSnapshot; disabled: boolean; onRefresh: () => Promise<unknown>; onEdit: (staff: FinanceStaff) => void }) {
  const [users, setUsers] = useState<{ userId: string; phone: string; canResetPassword: boolean }[]>([]);
  const [dialog, setDialog] = useState<"new" | FinanceStaff | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [revision, setRevision] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    void fetchFinancePhoneStaffAction().then(result => { if (!active) return; if (result.ok) setUsers(result.users); else setError(result.message); }).catch(() => { if (active) setError("تعذر تحميل أرقام المستخدمين أعد المحاولة"); });
    return () => { active = false; };
  }, [revision]);
  const staff = snapshot.staff.filter(row => row.user_id !== snapshot.userId && row.user_id !== snapshot.ownerUserId);
  function open(value: "new" | FinanceStaff) { setError(""); setNotice(""); setDialog(value); }
  return <>
    <Panel title="إدارة المستخدمين والصلاحيات" action={<button className={styles.primary} disabled={disabled || pending} onClick={() => open("new")}>إضافة مستخدم</button>}>
      <div className={styles.panelBody}>
        <p className={styles.muted}>أنشئ المستخدم برقم جواله وكلمة مروره وحدد صلاحياته يدخل الجميع من بوابة الكاشير ويظهر لكل مستخدم ما يسمح به دوره</p>
        <div className={styles.actions}><Link className={styles.secondary} href="/cashier/login?type=sales" target="_blank" rel="noopener noreferrer">بوابة دخول المستخدمين</Link><Link className={styles.secondary} href="/dashboard/settings">تغيير كلمة مرور المالك</Link><button className={styles.secondary} disabled={pending} onClick={() => { setError(""); setRevision(value => value + 1); }}>تحديث المستخدمين</button></div>
        {notice && <p role="status" className={styles.notice}>{notice}</p>}
        {!dialog && error && <p role="alert" className={styles.error}>{error}</p>}
      </div>
      {!staff.length ? <Empty title="لا يوجد مستخدمون بعد">أضف المستخدم واختر دوره لبدء العمل</Empty> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>المستخدم</th><th>رقم الجوال</th><th>الصلاحية</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{staff.map(row => { const account = users.find(user => user.userId === row.user_id); return <tr key={row.user_id}><td>{row.name}</td><td><bdi dir="ltr">{account?.phone || "—"}</bdi></td><td>{financeRoleLabels[row.role]}</td><td>{row.active ? "نشط" : "موقوف"}</td><td><div className={styles.actions}><button className={styles.secondary} disabled={disabled || pending} onClick={() => onEdit(row)}>الصلاحيات والحالة</button>{account?.canResetPassword && <button className={styles.secondary} disabled={disabled || pending} onClick={() => open(row)}>تغيير كلمة المرور</button>}</div></td></tr>; })}</tbody></table></div>}
    </Panel>
    <Modal open={dialog !== null} title={dialog === "new" ? "إضافة مستخدم" : "تغيير كلمة مرور المستخدم"} onClose={() => { if (!pending) setDialog(null); }} panelClassName="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
      {dialog && <form key={dialog === "new" ? "new" : dialog.user_id} className={styles.form} noValidate onSubmit={async event => {
        event.preventDefault(); if (lock.current || disabled) return;
        const data = new FormData(event.currentTarget), password = String(data.get("password") ?? ""), confirmation = String(data.get("confirmation") ?? "");
        setError("");
        if (dialog === "new" && String(data.get("name") ?? "").trim().length < 2) { setError("أدخل اسم المستخدم من حرفين على الأقل"); return; }
        if (!isSalesCashierPassword(password)) { setError(SALES_CASHIER_PASSWORD_HINT); return; }
        if (password !== confirmation) { setError("كلمتا المرور غير متطابقتين"); return; }
        lock.current = true; setPending(true);
        try {
          const result = dialog === "new" ? await createFinancePhoneStaffAccountAction({ name: String(data.get("name") ?? "").trim(), phone: String(data.get("phone") ?? "").trim(), password, role: String(data.get("role") ?? "cashier") as FinanceStaffRole }) : await resetFinancePhoneStaffPasswordAction({ userId: dialog.user_id, password });
          if (!result.ok) { setError(result.message); return; }
          setDialog(null); setNotice(result.message || "تم حفظ المستخدم"); setRevision(value => value + 1);
          try { await onRefresh(); } catch { setError("تم الحفظ لكن تعذر تحديث القائمة حدّث الصفحة دون تكرار العملية"); }
        } catch { setError("تعذر تأكيد العملية حدّث قائمة المستخدمين قبل إعادة المحاولة"); }
        finally { lock.current = false; setPending(false); }
      }}>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <fieldset disabled={pending} className={styles.form} style={{ border: 0, padding: 0, margin: 0 }}>
          {dialog === "new" ? <div className={styles.fields}><Field label="اسم المستخدم"><input name="name" required minLength={2} maxLength={100} autoComplete="off" /></Field><Field label="رقم الجوال"><input name="phone" required type="tel" dir="ltr" inputMode="tel" maxLength={30} autoComplete="off" placeholder="05xxxxxxxx" /></Field><Field label="الصلاحية"><select name="role" defaultValue="cashier">{financeStaffRoles.map(role => <option key={role} value={role}>{financeRoleLabels[role]}</option>)}</select></Field></div> : <p className={styles.notice}>تغيير كلمة مرور {dialog.name} ينهي جلساته السابقة ويحتاج الدخول بالكلمة الجديدة</p>}
          <Field label="كلمة المرور" hint={SALES_CASHIER_PASSWORD_HINT}><input name="password" type="password" required maxLength={128} autoComplete="new-password" dir="ltr" /></Field>
          <Field label="تأكيد كلمة المرور"><input name="confirmation" type="password" required maxLength={128} autoComplete="new-password" dir="ltr" /></Field>
          {dialog === "new" && <p className={styles.notice}>سلّم المستخدم رقم الدخول وكلمة المرور مباشرة ثم يفتح بوابة الكاشير</p>}
          <div className={styles.formFooter}><button type="submit" className={styles.primary}>{pending ? "جار الحفظ" : "حفظ المستخدم"}</button><button type="button" className={styles.secondary} onClick={() => setDialog(null)}>إلغاء</button></div>
        </fieldset>
      </form>}
    </Modal>
  </>;
}
