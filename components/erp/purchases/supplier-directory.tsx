'use client';
import { ArrowUpLeft, Building2 } from 'lucide-react';
import Link from '@/components/erp/navigation';
import { supplierAccountBalance } from '@/lib/erp/supplier-account';
import { statementMoney as money } from '@/lib/finance/party-statement';
import type { PurchaseSnapshot } from '@/lib/erp/purchases';
import s from './supplier-ledger.module.css';

export function SupplierDirectory({ snapshot, query, supplierId, status }: { snapshot: PurchaseSnapshot; query: string; supplierId: string; status: string }) {
  const all = snapshot.suppliers.map(row => ({ ...row, balance: supplierAccountBalance(snapshot, row.id) }));
  const rows = all.filter(row => (!query || `${row.name} ${row.phone} ${row.mobile} ${row.email}`.toLowerCase().includes(query.toLowerCase())) && (!supplierId || row.id === supplierId) && (!status || (status === 'active' ? row.active : !row.active)));
  const debt = rows.reduce((sum, row) => sum + Math.max(0, row.balance), 0), credit = rows.reduce((sum, row) => sum + Math.max(0, -row.balance), 0);
  function exportRows() {
    const cell = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`;
    const csv = [['المورد', 'الجوال', 'البريد', 'مديونية للمورد', 'رصيد لصالح المنشأة'], ...rows.map(row => [row.name, row.mobile || row.phone, row.email, money(Math.max(0, row.balance)), money(Math.max(0, -row.balance))])].map(row => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'suppliers.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className={s.root}><dl className={s.summary}><div className={s.highlight}><dt>إجمالي مديونية الموردين</dt><dd><bdi>{money(debt)}</bdi><small>ر س</small></dd></div><div><dt>رصيد لصالح المنشأة</dt><dd><bdi>{money(credit)}</bdi><small>ر س</small></dd></div><div><dt>موردون لهم مستحقات</dt><dd>{rows.filter(row => row.balance > 0).length}<small>مورد</small></dd></div><div><dt>الموردون</dt><dd>{rows.length}<small>مورد</small></dd></div></dl>
    <section className={s.card}><header className={s.heading}><div><h3>حسابات الموردين</h3><p>المديونية والرصيد بعد المدفوعات والمرتجعات والتسويات</p></div><button type="button" onClick={exportRows}>تصدير الموردين</button>{snapshot.canCreate && <Link href="/dashboard/system/purchases/suppliers/import">استيراد الموردين</Link>}</header>
      <div className={s.tableWrap} role="region" aria-label="أرصدة الموردين" tabIndex={0}><table><thead><tr><th>المورد</th><th>التواصل</th><th>الحالة</th><th>مديونية للمورد</th><th>رصيد لصالح المنشأة</th><th>كشف الحساب</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><Link href={`/dashboard/system/purchases/suppliers/${row.id}`}><Building2 size={17} />{row.name}</Link>{row.number && <small className={s.note}>{row.number}</small>}</td><td><bdi>{row.mobile || row.phone || '—'}</bdi><small className={s.note}>{row.email}</small></td><td><span className={s.status} data-active={row.active}>{row.active ? 'نشط' : 'متوقف'}</span></td><td className={s.amount}><bdi>{money(Math.max(0, row.balance))}</bdi><small>ر س</small></td><td><bdi>{money(Math.max(0, -row.balance))}</bdi></td><td><Link href={`/dashboard/system/purchases/suppliers/${row.id}?tab=statement`}>كشف الحساب <ArrowUpLeft size={15} /></Link></td></tr>)}</tbody></table></div>{!rows.length && <p className={s.empty}>لا يوجد موردون مطابقون للبحث</p>}
    </section></section>;
}
