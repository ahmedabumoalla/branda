'use client';
import type { CashierPermissions } from '@/lib/finance/cashier-permissions';
import styles from './finance.module.css';
export function CashierPermissionFields({ value = {} }: { value?: Partial<CashierPermissions> }) {
  return <section className={styles.notice}><h3>صلاحيات الموظف في الكاشير</h3><div className={styles.fields}>{([
    ['createItem', 'إضافة أصناف مخزنية جديدة'], ['createSupplier', 'إضافة مورد جديد'],
    ['credit', 'إنشاء فاتورة مشتريات آجلة'], ['supplierPayout', 'سداد الموردين من صندوق الوردية'],
  ] as const).map(([key, label]) => <label key={key} className={styles.check}><input type="checkbox" name={`permission_${key}`} defaultChecked={value[key] === true} />{label}</label>)}</div></section>;
}
export function readCashierPermissions(data: FormData): CashierPermissions {
  return { createItem: data.get('permission_createItem') === 'on', createSupplier: data.get('permission_createSupplier') === 'on', credit: data.get('permission_credit') === 'on', supplierPayout: data.get('permission_supplierPayout') === 'on' };
}
