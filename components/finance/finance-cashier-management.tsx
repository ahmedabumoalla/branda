"use client";

import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import type { FinanceStaff } from "@/lib/finance/brand-finance";
import { Empty, Panel } from "./finance-ui";
import styles from "./finance.module.css";

export function FinanceCashierManagement({ staff, userId, disabled, onAdd, onEdit }: {
  staff: FinanceStaff[];
  userId: string;
  disabled: boolean;
  onAdd: () => void;
  onEdit: (cashier: FinanceStaff) => void;
}) {
  const cashiers = staff.filter(employee => employee.role === "cashier");

  return <Panel title="إدارة الكاشير" action={
    <button type="button" className={styles.primary} disabled={disabled} onClick={onAdd}>
      <Plus size={16} aria-hidden="true" />إضافة موظف كاشير
    </button>
  }>
    <div className={styles.panelBody}>
      <p className={styles.muted}>أضف الموظف باسمه ورقم جواله وكلمة مرور للحساب الجديد ثم يدخل إلى الكاشير برقم جواله وكلمة المرور أو رمز واتساب</p>
      <Link href="/cashier/login?type=sales" className={styles.secondary}>
        صفحة دخول موظف الكاشير<ArrowLeft size={16} aria-hidden="true" />
      </Link>
    </div>
    {!cashiers.length ? <Empty title="لم تضف موظفي كاشير بعد">اختر إضافة موظف كاشير لربط الموظف بنقطة البيع الخاصة بعلامتك</Empty> :
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label="موظفو الكاشير">
          <thead><tr><th scope="col">الموظف</th><th scope="col">الحالة</th><th scope="col">الإجراء</th></tr></thead>
          <tbody>{cashiers.map(cashier => <tr key={cashier.user_id}>
            <td><strong>{cashier.name}</strong></td>
            <td><span className={styles.badge}>{cashier.active ? "نشط" : "موقوف"}</span></td>
            <td>{cashier.user_id !== userId && <button type="button" className={styles.secondary} disabled={disabled}
              aria-label={`تعديل الكاشير ${cashier.name}`} onClick={() => onEdit(cashier)}>تعديل الكاشير</button>}</td>
          </tr>)}</tbody>
        </table>
      </div>}
  </Panel>;
}
