'use client';

import { useState } from 'react';
import { Building2, FileText, WalletCards, Pencil, Plus, MoreHorizontal, MapPin, Phone, Mail, Paperclip, CirclePause, CirclePlay, Trash2, ArrowUpLeft } from 'lucide-react';
import Link from '@/components/erp/navigation';
import { ErpFiles } from '@/components/erp/files';
import { DocumentTemplatePrint } from '@/components/erp/templates/document-template-print';
import { displayRecordNumber } from '@/lib/erp/settings-numbering';
import type { PurchaseSnapshot, SupplierInput } from '@/lib/erp/purchases';
import type { DocumentTemplate } from '@/lib/erp/templates';
import { SupplierStatement } from './statement';
import { SupplierPayments } from './supplier-payments';
import { supplierAccountBalance, supplierPayments } from '@/lib/erp/supplier-account';
import s from './supplier-detail.module.css';

const root = '/dashboard/system/purchases';
const tabs = [['details', 'بيانات المورد', Building2], ['statement', 'كشف الحساب', FileText], ['invoices', 'الفواتير', FileText], ['payments', 'المدفوعات', WalletCards], ['files', 'المرفقات', Paperclip]] as const;
const money = (amount: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

export function SupplierDetail({ snapshot, supplier, tab, onTab, busy, onPayment, onToggle, onDelete, template }: {
  snapshot: PurchaseSnapshot; supplier: SupplierInput; tab: string; onTab: (tab: string) => void; busy: boolean;
  onPayment: () => void; onToggle: () => void; onDelete: () => void; template: DocumentTemplate;
}) {
  const [statementVisited, setStatementVisited] = useState(tab === 'statement');
  const selectTab = (next: string) => { if (next === 'statement') setStatementVisited(true); onTab(next); };
  const invoices = snapshot.invoices.filter(row => row.party_id === supplier.id && ['purchase', 'refund'].includes(row.kind));
  const payments = snapshot.payments.filter(row => row.party_id === supplier.id && !['purchase', 'refund'].includes(row.kind));
  const rows = [...(tab === 'payments' ? payments : invoices)].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const balance = supplierAccountBalance(snapshot, supplier.id);
  const credit = snapshot.credits.filter(row => row.supplierId === supplier.id).reduce((sum, row) => sum + row.amount - row.used, 0);
  const addressLabels: Record<string, string> = { building: 'رقم المبنى', street: 'الشارع', additional: 'الرقم الإضافي', district: 'الحي', city: 'المدينة', postal: 'الرمز البريدي', short: 'العنوان المختصر', country: 'الدولة' };
  const hasAddress = Object.values(supplier.address).some(Boolean);
  return <section className={s.root} aria-label="ملف المورد">
    <header className={s.header}>
      <div className={s.identity}><span className={s.avatar}><Building2 size={27} aria-hidden="true" /></span><div><span className={s.eyebrow}>ملف المورد{supplier.number && <> / <bdi>{supplier.number}</bdi></>}</span><h2>{supplier.name}</h2><div className={s.identityMeta}><span className={s.status} data-active={supplier.active}>{supplier.active ? 'نشط' : 'متوقف'}</span><span>{supplier.currency || 'SAR'}</span>{supplier.mobile && <bdi>{supplier.mobile}</bdi>}</div></div></div>
      <div className={s.actions}>
        {snapshot.canCreate && <Link className={s.primary} href={`${root}/invoices/new?supplier=${supplier.id}`}><Plus size={17} aria-hidden="true" />فاتورة شراء جديدة</Link>}
        {snapshot.canApprove && <button type="button" disabled={busy} onClick={onPayment}><WalletCards size={17} aria-hidden="true" />إضافة دفعة</button>}
        {snapshot.canUpdate && <Link href={`${root}/suppliers/${supplier.id}/edit`}><Pencil size={16} aria-hidden="true" />تعديل</Link>}
        {(snapshot.canUpdate || snapshot.canDelete) && <details className={s.menu}><summary aria-label="إجراءات المورد"><MoreHorizontal size={21} aria-hidden="true" /></summary><div>
          {snapshot.canUpdate && <button type="button" disabled={busy} onClick={onToggle}>{supplier.active ? <CirclePause size={16} /> : <CirclePlay size={16} />}{supplier.active ? 'إيقاف المورد' : 'تنشيط المورد'}</button>}
          {snapshot.canDelete && <button type="button" className={s.danger} disabled={busy} onClick={onDelete}><Trash2 size={16} aria-hidden="true" />حذف المورد</button>}
        </div></details>}
      </div>
    </header>
    <dl className={s.summary}>
      <div className={s.balance}><dt>رصيد حساب المورد <WalletCards size={18} aria-hidden="true" /></dt><dd><bdi>{money(balance)}</bdi><small>ر س</small></dd></div>
      <div><dt>الرصيد المتاح للشراء</dt><dd><bdi>{money(credit)}</bdi><small>ر س</small></dd></div>
      <div><dt>الفواتير المسجلة</dt><dd><bdi>{invoices.length}</bdi><small>مستند</small></dd></div>
      <div><dt>المدفوعات المسجلة</dt><dd><bdi>{supplierPayments(snapshot).filter(row => row.supplierId === supplier.id).length}</bdi><small>عملية</small></dd></div>
    </dl>
    <div className={s.content}>
      <nav className={s.tabs} aria-label="تفاصيل المورد">{tabs.map(([id, label, Icon]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => selectTab(id)}><Icon size={16} aria-hidden="true" />{label}{id === 'invoices' && <span>{invoices.length}</span>}{id === 'payments' && <span>{supplierPayments(snapshot).filter(row => row.supplierId === supplier.id).length}</span>}</button>)}</nav>
      <div className={s.body}>
        {statementVisited && <div hidden={tab !== 'statement'}><SupplierStatement snapshot={snapshot} supplier={supplier} template={template} /></div>}
        {tab === 'details' ? <>
          <div className={s.grid}>
            <section className={s.card}><h3><Phone size={18} aria-hidden="true" />التواصل وبيانات المنشأة</h3><dl className={s.facts}>
              <div><dt>الجوال</dt><dd>{supplier.mobile ? <a href={`tel:${supplier.mobile}`}><bdi>{supplier.mobile}</bdi></a> : 'غير مسجل'}</dd></div>
              <div><dt>الهاتف</dt><dd>{supplier.phone ? <a href={`tel:${supplier.phone}`}><bdi>{supplier.phone}</bdi></a> : 'غير مسجل'}</dd></div>
              <div><dt>البريد الإلكتروني</dt><dd>{supplier.email ? <a href={`mailto:${supplier.email}`}><Mail size={14} aria-hidden="true" /><bdi>{supplier.email}</bdi></a> : 'غير مسجل'}</dd></div>
              <div><dt>الرقم الضريبي</dt><dd><bdi>{supplier.taxNumber || 'غير مسجل'}</bdi></dd></div>
              <div><dt>السجل التجاري</dt><dd><bdi>{supplier.commercialRegistration || 'غير مسجل'}</bdi></dd></div>
            </dl></section>
            <section className={s.card}><h3><MapPin size={18} aria-hidden="true" />العنوان الوطني</h3>{hasAddress ? <dl className={`${s.facts} ${s.address}`}>{Object.entries(supplier.address).filter(([, v]) => v).map(([key, v]) => <div key={key}><dt>{addressLabels[key] ?? key}</dt><dd>{key === 'country' && v === 'SA' ? 'المملكة العربية السعودية' : v}</dd></div>)}</dl> : <p className={s.emptyText}>لم تُضف بيانات العنوان بعد</p>}</section>
          </div>
          {!!supplier.contacts.length && <section className={s.card}><h3><Phone size={18} aria-hidden="true" />جهات الاتصال</h3><div className={s.grid}>{supplier.contacts.map((contact, index) => <div className={s.contact} key={index}><strong>{contact.name || 'جهة اتصال'}</strong><bdi>{contact.phone}</bdi><bdi>{contact.email}</bdi></div>)}</div></section>}
          {!!supplier.addresses.length && <section className={s.card}><h3><MapPin size={18} aria-hidden="true" />عناوين إضافية</h3>{supplier.addresses.map((address, index) => <p key={index}><strong>{address.label}</strong> {address.address}</p>)}</section>}
          {supplier.note && <section className={s.card}><h3><FileText size={18} aria-hidden="true" />ملاحظات المورد</h3><p className={s.note}>{supplier.note}</p></section>}
        </> : tab === 'statement' ? null
          : tab === 'payments' ? <SupplierPayments snapshot={snapshot} supplierId={supplier.id} onAdd={onPayment} />
          : tab === 'files' ? <ErpFiles entityType="supplier_profile" recordId={supplier.id} slug={snapshot.slug} canWrite={snapshot.canFiles} />
            : <><div className={s.sectionHeading}><h3>{tab === 'payments' ? 'مدفوعات المورد' : 'فواتير المورد'}</h3><span>{rows.length} مستند</span></div>{rows.length ? <div className={s.tableWrap}><table><thead><tr><th>المستند</th><th>التاريخ</th><th>النوع</th><th>الإجمالي</th><th>المتبقي</th><th><span className={s.srOnly}>عرض المستند</span></th></tr></thead><tbody>{rows.map(row => {
              const href = `${root}/${row.kind === 'purchase' ? 'invoices' : row.kind === 'refund' ? 'returns' : 'payments'}/${row.id}`;
              return <tr key={row.id}><td><Link href={href}>#{displayRecordNumber(row)}</Link></td><td><bdi>{row.created_at.slice(0, 10)}</bdi></td><td>{{ purchase: 'فاتورة شراء', refund: 'مرتجع أو إشعار', settlement: 'دفعة', journal: 'دفعة مقدمة', opening: 'رصيد افتتاحي' }[row.kind] ?? row.kind}</td><td><bdi>{money(row.total)}</bdi> <small>ر س</small></td><td>{row.outstanding == null ? '—' : <bdi>{money(row.outstanding)}</bdi>}</td><td><Link href={href} aria-label={`عرض المستند ${displayRecordNumber(row)}`}><ArrowUpLeft size={17} aria-hidden="true" /></Link></td></tr>;
            })}</tbody></table></div> : <div className={s.empty}><FileText size={30} aria-hidden="true" /><h3>{tab === 'payments' ? 'لا توجد مدفوعات مسجلة' : 'لا توجد فواتير مسجلة'}</h3><p>{tab === 'payments' ? 'ستظهر هنا الدفعات المرتبطة بهذا المورد' : 'ستظهر هنا فواتير الشراء والمرتجعات المرتبطة بهذا المورد'}</p></div>}
            {!!rows.length && <DocumentTemplatePrint template={template} slug={snapshot.slug} values={{ العلامة: snapshot.brand, العميل: supplier.name, العنوان: tab === 'payments' ? 'مدفوعات المورد' : 'فواتير المورد', المبلغ: balance }} table={{ head: ['المستند', 'التاريخ', 'القيمة', 'المتبقي'], rows: rows.map(row => [String(displayRecordNumber(row)), row.created_at.slice(0, 10), money(row.total), row.outstanding == null ? '—' : money(row.outstanding)]) }} />}</>}
      </div>
    </div>
  </section>;
}
