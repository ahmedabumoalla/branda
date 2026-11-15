'use client';
import { FileText, Plus, Search, ArrowUpLeft } from 'lucide-react';
import Link from '@/components/erp/navigation';
import { displayRecordNumber } from '@/lib/erp/settings-numbering';
import { purchaseTotals, type PurchaseRecord, type SupplierInput } from '@/lib/erp/purchases';
import type { FinanceDocument } from '@/lib/finance/brand-finance';
import s from './workspace.module.css';

const statuses: Record<string, string> = { draft: 'مسودة', pending: 'بانتظار الاعتماد', approved: 'معتمد', rejected: 'مرفوض', converted: 'محول', posted: 'صادرة', cancelled: 'ملغاة' };
export function PurchaseInvoiceList({ records, financial, allFinancial, suppliers, customStatuses = [], canCreate, filtered, onReset, onExport, section = 'invoices', title = 'فواتير المشتريات', createLabel = 'فاتورة مشتريات جديدة' }: {
  records: PurchaseRecord[]; financial: FinanceDocument[]; allFinancial: FinanceDocument[]; suppliers: SupplierInput[];
  customStatuses?: { id: string; name: string }[]; canCreate: boolean; filtered: boolean; onReset: () => void; onExport: () => void;
  section?: string; title?: string; createLabel?: string;
}) {
  const invoiceList = section === 'invoices';
  const basePath = `/dashboard/system/purchases/${section}`;
  const linked = new Set(records.map(row => row.financeId).filter(Boolean));
  const rows = [
    ...records.map(row => {
      const invoice = allFinancial.find(doc => doc.id === row.financeId);
      return { id: row.id, number: displayRecordNumber(row), supplier: row.supplierId, date: row.date, status: row.status, customStatus: customStatuses.find(status => status.id === row.customStatus)?.name || row.customStatus, total: purchaseTotals(row).total, currency: row.currency, remaining: invoice?.outstanding, title: row.title };
    }),
    ...financial.filter(row => !linked.has(row.id)).map(row => ({ id: row.id, number: displayRecordNumber(row), supplier: row.party_id, date: row.created_at.slice(0, 10), status: 'posted', customStatus: '', total: row.total, currency: 'SAR', remaining: row.outstanding, title: '' })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const money = (value: number, currency = 'SAR') => new Intl.NumberFormat('ar-SA', { style: 'currency', currency }).format(value);
  return <section className={s.invoiceList} aria-label={`سجل ${title}`}>
    <div className={s.listHeading}><div><h2>{invoiceList ? 'سجل الفواتير' : title} <span>{rows.length}</span></h2><p>{filtered ? 'النتائج المطابقة للبحث والتصفية' : 'المستندات والمسودات مرتبة من الأحدث'}</p></div><button type="button" onClick={onExport} disabled={!rows.length}>تصدير القائمة</button></div>
    {rows.length ? <div className={s.listScroll} tabIndex={0} role="region" aria-label={`جدول ${title}`}><table><thead><tr><th>{invoiceList ? 'الفاتورة' : 'المستند'}</th><th>المورد</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th>{invoiceList && <th>المتبقي للسداد</th>}<th><span className={s.srOnly}>فتح المستند</span></th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>
      <td><Link className={s.invoiceLink} href={`${basePath}/${row.id}`}><FileText size={17} aria-hidden="true" />{row.number}</Link>{row.title && <small>{row.title}</small>}</td>
      <td>{suppliers.find(supplier => supplier.id === row.supplier)?.name || 'لم يحدد المورد'}</td><td><bdi>{row.date}</bdi></td><td className={s.money}>{money(row.total, row.currency)}</td>
      <td><span className={s.status} data-status={row.status}>{statuses[row.status] || row.status}</span>{row.customStatus && <small>{row.customStatus}</small>}</td>{invoiceList && <td>{row.remaining == null ? '—' : money(row.remaining)}</td>}
      <td><Link className={s.openLink} href={`${basePath}/${row.id}`} aria-label={`فتح المستند ${row.number}`}><ArrowUpLeft size={18} aria-hidden="true" /></Link></td>
    </tr>)}</tbody></table></div> : <div className={s.emptyState}><span className={s.emptyIcon}>{filtered ? <Search size={29} aria-hidden="true" /> : <FileText size={29} aria-hidden="true" />}</span><h3>{filtered ? 'لا توجد مستندات تطابق البحث' : invoiceList ? 'ابدأ بأول فاتورة مشتريات' : `لا توجد مستندات في ${title}`}</h3><p>{filtered ? 'جرّب تغيير المورد أو الحالة أو الفترة المحددة' : 'حدد المورد وأضف الأصناف لتتابع مشترياتك ومبالغها من هنا'}</p>{filtered ? <button type="button" onClick={onReset}>مسح التصفية</button> : canCreate && <Link className={s.createButton} href={`${basePath}/new`}><Plus size={18} aria-hidden="true" />{createLabel}</Link>}</div>}
  </section>;
}
