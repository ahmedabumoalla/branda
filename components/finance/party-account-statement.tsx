'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, RefreshCw, Search, ArrowUpLeft } from 'lucide-react';
import Link from '@/components/erp/navigation';
import { fetchPartyStatement, printPartyStatement } from '@/app/actions/finance-party-statement';
import { selectStatement, statementKinds, statementMoney as money, statementHead, statementTable, type PartyStatement } from '@/lib/finance/party-statement';
import { defaultDocumentTemplate } from '@/lib/erp/templates';
import { DocumentTemplatePrint } from '@/components/erp/templates/document-template-print';
import s from './party-account-statement.module.css';

export function PartyAccountStatement({ slug, partyId, kind, contextKey = '', onJournal }: {
  slug: string; partyId: string; kind: 'customer' | 'supplier'; contextKey?: string; onJournal?: (id: string) => void;
}) {
  const [result, setResult] = useState<{ key: string; data: PartyStatement } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [page, setPage] = useState(1);
  const key = `${slug}:${partyId}:${contextKey}`;
  const request = useRef<{ key: string; revision: number; promise: ReturnType<typeof fetchPartyStatement> } | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    if (request.current?.key !== key || request.current.revision !== revision) request.current = { key, revision, promise: fetchPartyStatement(slug, partyId) };
    request.current.promise.then(response => {
      if (!active) return;
      if (response.ok) setResult({ key, data: response.data }); else setError(response.message);
      setLoading(false);
    }).catch(() => { if (active) { setError('تعذر تحميل كشف الحساب أعد المحاولة'); setLoading(false); } });
    return () => { active = false; };
  }, [key, slug, partyId, revision]);
  const data = result?.key === key ? result.data : null;
  const selected = useMemo(() => data ? selectStatement(data, from, to) : null, [data, from, to]);
  const invalid = !!(from && to && from > to);
  const title = kind === 'supplier' ? 'كشف حساب المورد' : 'كشف حساب العميل';
  const pages = Math.max(1, Math.ceil((selected?.rows.length ?? 0) / 50));
  const currentPage = Math.min(page, pages);
  function csv() {
    if (!selected || !data) return;
    const cell = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`;
    const rows = [[title, data.party.name], statementHead,
      ['', '', 'الرصيد السابق', '', '', '', '', '', money(selected.opening)], ...statementTable(selected.rows),
      ['', '', 'الرصيد الختامي', '', '', '', money(selected.debit), money(selected.credit), money(selected.balance)]];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `account-statement-${partyId}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className={s.root} aria-label={title}>
    <header className={s.heading}><div><span className={s.icon}><FileText size={20} /></span><div><h3>{title}</h3><p>الفواتير والسداد والمرتجعات والقيود في سجل واحد</p></div></div><div className={s.actions}>
      {selected && !invalid && <><DocumentTemplatePrint slug={slug} template={defaultDocumentTemplate('party_statement', title)} values={{}} title="طباعة / حفظ PDF" previewAction={() => printPartyStatement(slug, partyId, from, to)} /><button type="button" onClick={csv}><Download size={16} />تصدير</button></>}
      <button type="button" disabled={loading} aria-label="تحديث كشف الحساب" onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} /></button>
    </div></header>
    <div className={s.filters}><span><Search size={17} />فترة الكشف</span><label>من<input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /></label><label>إلى<input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} /></label><button type="button" onClick={() => { setFrom(''); setTo(''); setPage(1); }}>كل التعاملات</button></div>
    {invalid && <p className={s.error} role="alert">تاريخ البداية يجب أن يسبق تاريخ النهاية</p>}
    {error && <p className={s.error} role="alert">{error}</p>}
    {!data && loading && <p className={s.empty} role="status">جار تجهيز كشف الحساب</p>}
    {selected && !invalid && <>
      <dl className={s.summary}><div><dt>إجمالي الفواتير</dt><dd><bdi>{money(selected.invoiced)}</bdi></dd></div><div><dt>المسدد الصافي</dt><dd><bdi>{money(selected.paid)}</bdi></dd></div><div><dt>قيمة المرتجعات</dt><dd><bdi>{money(selected.refunded)}</bdi></dd></div><div className={s.due}><dt>المتبقي الآجل</dt><dd><bdi>{money(selected.outstanding)}</bdi><small>ر س</small></dd></div></dl>
      <div className={s.balance}><span>الرصيد السابق <bdi>{money(selected.opening)}</bdi></span><span>{selected.rows.length} حركة <small>المبالغ بالريال السعودي</small></span></div>
      <div className={s.tableWrap} tabIndex={0} role="region" aria-label="حركات الحساب"><table><thead><tr>{statementHead.map(label => <th key={label}>{label}</th>)}<th>السجل</th></tr></thead><tbody>{selected.rows.slice((currentPage - 1) * 50, currentPage * 50).map(row => <tr key={row.id}>
        <td><time dateTime={row.date}>{row.day}</time></td><td><strong>{statementKinds[row.kind] || 'مستند'}</strong><bdi>#{row.number}</bdi>{row.initialPaid > 0 && ['purchase', 'sale'].includes(row.kind) && <small>سداد عند الإصدار {money(row.initialPaid)}</small>}</td><td className={s.memo}>{row.memo || '—'}</td>
        <td><bdi>{money(row.amount)}</bdi></td><td><bdi>{['purchase', 'sale'].includes(row.kind) ? money(row.paidToDate) : '—'}</bdi></td><td><bdi>{['purchase', 'sale'].includes(row.kind) ? money(row.outstanding) : '—'}</bdi></td><td><bdi>{money(row.debit)}</bdi></td><td><bdi>{money(row.credit)}</bdi></td><td className={s.running}><bdi>{money(row.balance)}</bdi></td>
        <td>{row.hasJournal ? onJournal ? <button type="button" onClick={() => onJournal(row.id)}><ArrowUpLeft size={14} />القيد</button> : <Link href={`/dashboard/finance?section=reports&view=journal&entry=${row.id}`}><ArrowUpLeft size={14} />القيد</Link> : <small>غير مرحل</small>}</td>
      </tr>)}</tbody><tfoot><tr><th colSpan={6}>إجمالي حركة الفترة والرصيد الختامي</th><td><bdi>{money(selected.debit)}</bdi></td><td><bdi>{money(selected.credit)}</bdi></td><td><bdi>{money(selected.balance)}</bdi></td><td /></tr></tfoot></table>{!selected.rows.length && <p className={s.empty}>لا توجد تعاملات خلال هذه الفترة</p>}</div>
      <footer className={s.footer}><p>المدين والدائن من القيود المحاسبية ولا تُحتسب قيمة الفاتورة المسددة مباشرة كمديونية<br />المسدد والمتبقي يعكسان حالة الفواتير الحالية{kind === 'supplier' ? ' والرصيد الموجب مستحق للمورد والسالب لصالح المنشأة' : ' والرصيد الموجب مستحق على العميل والسالب لصالحه'}</p>{pages > 1 && <nav aria-label="صفحات كشف الحساب"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>السابق</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>التالي</button></nav>}</footer>
    </>}
  </section>;
}
