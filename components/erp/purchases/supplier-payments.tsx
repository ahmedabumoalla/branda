'use client';
import { useState } from 'react';
import { ArrowUpLeft, FileCheck2, Plus, WalletCards } from 'lucide-react';
import Link from '@/components/erp/navigation';
import { supplierPayments } from '@/lib/erp/supplier-account';
import { statementMoney as money } from '@/lib/finance/party-statement';
import type { PurchaseSnapshot } from '@/lib/erp/purchases';
import s from './supplier-ledger.module.css';

export function SupplierPayments({ snapshot, supplierId = '', query = '', from = '', to = '', onAdd }: {
  snapshot: PurchaseSnapshot; supplierId?: string; query?: string; from?: string; to?: string; onAdd?: () => void;
}) {
  const [page, setPage] = useState(1);
  const names = new Map(snapshot.suppliers.map(row => [row.id, row.name]));
  const rows = supplierPayments(snapshot).filter(row => (!supplierId || row.supplierId === supplierId)
    && (!query || `${row.number} ${row.note} ${names.get(row.supplierId) || ''}`.toLowerCase().includes(query.toLowerCase()))
    && (!from || row.date.slice(0, 10) >= from) && (!to || row.date.slice(0, 10) <= to));
  const initial = rows.filter(row => row.initial).reduce((sum, row) => sum + row.amount, 0);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const pages = Math.max(1, Math.ceil(rows.length / 50)), current = Math.min(page, pages);
  return <section className={s.root}>
    <dl className={s.summary}><div className={s.highlight}><dt><WalletCards size={18} />إجمالي المدفوعات</dt><dd><bdi>{money(total)}</bdi><small>ر س</small></dd></div><div><dt>السداد عند إصدار الفواتير</dt><dd><bdi>{money(initial)}</bdi><small>ر س</small></dd></div><div><dt>الدفعات المستقلة والمقدمة</dt><dd><bdi>{money(total - initial)}</bdi><small>ر س</small></dd></div><div><dt>عمليات السداد</dt><dd>{rows.length}<small>عملية</small></dd></div></dl>
    <div className={s.card}><header className={s.heading}><div><h3>سجل مدفوعات الموردين</h3><p>يشمل السداد النقدي عند إصدار الفاتورة والدفعات اللاحقة</p></div>{onAdd && snapshot.canApprove && <button type="button" className={s.primary} onClick={onAdd}><Plus size={17} />إضافة دفعة</button>}</header>
      <div className={s.tableWrap} role="region" aria-label="مدفوعات الموردين" tabIndex={0}><table><thead><tr><th>عملية السداد</th><th>المورد</th><th>التاريخ</th><th>حساب الدفع</th><th>الفاتورة</th><th>المبلغ</th><th>السجل</th></tr></thead><tbody>{rows.slice((current - 1) * 50, current * 50).map(row => <tr key={row.id}>
        <td><Link href={row.href}>#{row.number}</Link><small className={s.kind}>{row.initial ? 'سداد مع الفاتورة' : 'دفعة مستقلة'}</small>{row.note && !row.initial && <small className={s.note}>{row.note}</small>}</td>
        <td><Link href={`/dashboard/system/purchases/suppliers/${row.supplierId}`}>{names.get(row.supplierId) || 'المورد'}</Link></td><td><bdi>{row.date.slice(0, 10)}</bdi></td><td>{snapshot.finance.accounts.find(account => account.id === row.accountId)?.name || 'حسب القيد المحاسبي'}</td>
        <td>{row.invoiceId ? <Link href={`/dashboard/system/purchases/invoices/${row.invoiceId}`}>عرض الفاتورة <ArrowUpLeft size={14} /></Link> : <span>دفعة على الحساب</span>}</td><td className={s.amount}><bdi>{money(row.amount)}</bdi><small>ر س</small></td><td><Link href={`/dashboard/finance?section=reports&view=journal&entry=${row.documentId}`} aria-label={`القيد المحاسبي ${row.number}`}><FileCheck2 size={18} /></Link></td>
      </tr>)}</tbody></table></div>{!rows.length && <div className={s.empty}><WalletCards size={29} /><strong>لا توجد مدفوعات مطابقة</strong><p>سداد فاتورة الشراء يظهر هنا تلقائيًا ضمن مدفوعات المورد</p></div>}
      {pages > 1 && <nav className={s.pagination} aria-label="صفحات المدفوعات"><button type="button" disabled={current === 1} onClick={() => setPage(current - 1)}>السابق</button><span>{current} / {pages}</span><button type="button" disabled={current === pages} onClick={() => setPage(current + 1)}>التالي</button></nav>}
    </div>
  </section>;
}
