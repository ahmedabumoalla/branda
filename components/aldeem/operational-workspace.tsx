'use client';

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { RefreshCw, ArrowRight } from 'lucide-react';
import { readAldeemOperationalPage, type AldeemOperationalPage } from '@/app/actions/aldeem-operations';
import { ALDEEM_OPERATIONAL_SECTIONS, aldeemOperationalRoute } from '@/lib/aldeem/operational-sections';
import { ErpEmbeddedNavigationProvider, ErpNavigationProvider } from '@/components/erp/navigation';
import { branchScopeOf } from '@/lib/erp/branches';
import type { OverviewSnapshot } from '@/lib/erp/overview';
import s from './operational-workspace.module.css';
import { readAldeemLocation, writeAldeemLocation } from '@/lib/aldeem/location';

export { ALDEEM_OPERATIONAL_SECTIONS } from '@/lib/aldeem/operational-sections';
import { InventoryWorkspace as Inventory } from '@/components/erp/inventory/workspace';
import { AldeemItemCardWorkspace } from '@/components/aldeem/item-card-workspace';
import { AccountingWorkspace as Accounting } from '@/components/erp/accounting/workspace';
import { FinanceWorkspace as Finance } from '@/components/erp/finance/workspace';
import { ErpTreasury as Treasury } from '@/components/erp/finance/treasury';
import { HrWorkspace as Employees } from '@/components/erp/hr/hr-workspace';
import { PayrollWorkspace as Payroll } from '@/components/erp/payroll/payroll-workspace';
import { OrganizationWorkspace as Organization } from '@/components/erp/organization/organization-workspace';
import { RolesWorkspace as Roles } from '@/components/erp/roles/workspace';
import { AttendanceWorkspace as Attendance } from '@/components/erp/attendance/workspace';
import { SystemSettingsWorkspace as Settings } from '@/components/erp/settings/workspace';
export function AldeemOperationalWorkspace({ section }: { section: string }) {
  const config = ALDEEM_OPERATIONAL_SECTIONS[section];
  const [page, setPage] = useState<AldeemOperationalPage | null>(null);
  const [route, setRoute] = useState(config?.route ?? '');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const pendingRoute = useRef('');
  const routeRef = useRef(route);
  const serial = useRef(0);
  const initialRequest = useRef<{ route: string; promise: ReturnType<typeof readAldeemOperationalPage> } | null>(null);
  useEffect(() => () => { serial.current++; }, []);
  useEffect(() => {
    if (!config?.route) return;
    const savedRoute = readAldeemLocation('route');
    const initialRoute = savedRoute && aldeemOperationalRoute(savedRoute) || config.route;
    let active = true;
    const request = ++serial.current;
    // Reuse the initial request when development Strict Mode replays effects.
    if (initialRequest.current?.route !== initialRoute) initialRequest.current = { route: initialRoute, promise: readAldeemOperationalPage(initialRoute) };
    setBusy(true); setError('');
    void initialRequest.current.promise.then(result => {
      if (!active || request !== serial.current) return;
      if (result.ok) { setPage(result.data); setRoute(initialRoute); routeRef.current = initialRoute; setRevision(value => value + 1); }
      else setError(result.message);
    }).catch(() => {
      if (active && request === serial.current) setError('تعذر تحميل البيانات حاول مجددًا');
    }).finally(() => {
      if (active && request === serial.current) setBusy(false);
    });
    return () => { active = false; };
  }, [section, config?.route]);

  async function load(href: string) {
    const next = aldeemOperationalRoute(href);
    if (!next) { setError('هذا الإجراء يتطلب فتح القسم المختص من القائمة الجانبية'); return; }
    if (pendingRoute.current === next) return;
    const request = ++serial.current;
    routeRef.current = next;
    pendingRoute.current = next;
    setBusy(true); setError('');
    try {
      const result = await readAldeemOperationalPage(next);
      if (request !== serial.current) return;
      if (!result.ok) { setError(result.message); routeRef.current = route; return; }
      setPage(result.data); setRoute(next); setRevision(value => value + 1);
      writeAldeemLocation('route', next);
    } catch { if (request === serial.current) setError('تعذر الاتصال حاول مجددًا'); }
    finally { if (request === serial.current) { setBusy(false); pendingRoute.current = ''; } }
  }
  function submit(event: FormEvent<HTMLDivElement>) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('action') || form.method.toLowerCase() === 'post') return;
    const action = form.getAttribute('action');
    if (!action || !aldeemOperationalRoute(action)) return;
    event.preventDefault();
    const url = new URL(action, window.location.origin);
    new FormData(form).forEach((value, key) => { if (typeof value === 'string') url.searchParams.set(key, value); });
    void load(`${url.pathname}${url.search}`);
  }
  function click(event: MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target.closest('a') : null;
    if (!target || event.button !== 0 || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || target.target === '_blank' || target.hasAttribute('download')) return;
    const href = target.getAttribute('href');
    if (href && aldeemOperationalRoute(href)) { event.preventDefault(); void load(href); }
  }
  if (!config) return null;
  return <section className={s.workspace} dir="rtl">
    <header className={s.toolbar}><div><h2>{config.title}</h2><p>{config.description}</p></div><div className={s.actions}>
      {page && route !== config.route && <button type="button" disabled={busy} onClick={() => void load(config.route)}><ArrowRight size={16} />العودة للسجل</button>}
      <button type="button" className={s.primary} disabled={busy} onClick={() => void load(page ? route : config.route)}><RefreshCw size={16} />{busy ? 'جار تحميل البيانات' : error ? 'إعادة المحاولة' : 'تحديث'}</button>
    </div></header>
    {error && <p role="alert" className={s.error}>{error}</p>}
    {!page && busy && <div className={s.open} role="status" aria-live="polite"><p>جار تحميل {config.title}</p></div>}
    {page && <ErpNavigationProvider slug="khayal-aldeem"><ErpEmbeddedNavigationProvider navigation={{ navigate: href => { void load(href); }, refresh: () => { void load(routeRef.current); } }}>
      <div className={s.surface} onClickCapture={click} onSubmitCapture={submit} aria-busy={busy} inert={busy || undefined} key={revision}>
        <OperationalPage page={page} load={load} disposal={section === 'inventory-disposal-orders'}/>
      </div>
    </ErpEmbeddedNavigationProvider></ErpNavigationProvider>}
  </section>;
}

function OperationalPage({ page, load, disposal }: { page: AldeemOperationalPage; load: (href: string) => Promise<void>; disposal: boolean }) {
  switch (page.kind) {
    case 'inventory-item-card': return <AldeemItemCardWorkspace itemId={page.itemId}/>;
    case 'inventory': return <Inventory {...page.props} disposal={disposal && page.props.module === 'requisitions'} kind={disposal && page.props.module === 'requisitions' ? 'issue' : page.props.kind} snapshot={disposal && page.props.module === 'requisitions' && page.props.mode === 'list' ? { ...page.props.snapshot, documents: page.props.snapshot.documents.filter(row => row.payload.purpose === 'disposal') } : page.props.snapshot}/>;
    case 'accounting': return <Accounting {...page.props}/>;
    case 'finance': return <Finance {...page.props}>{page.treasury && <Treasury snapshot={page.treasury} canApprove={page.props.initial.canApprove} scope={branchScopeOf(page.props.initial)}/>}</Finance>;
    case 'employees': return <Employees {...page.props}/>;
    case 'payroll': return <Payroll {...page.props}/>;
    case 'organization': return <Organization {...page.props}/>;
    case 'roles': return <Roles {...page.props}/>;
    case 'attendance': return <Attendance {...page.props}/>;
    case 'settings': return <Settings {...page.props}/>;
    case 'overview': return <Overview snapshot={page.snapshot} load={load}/>;
  }
}

const amount = (value: number) => new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
function Overview({ snapshot: data, load }: { snapshot: OverviewSnapshot; load: (href: string) => Promise<void> }) {
  const [from, setFrom] = useState(data.from), [to, setTo] = useState(data.to);
  const sales = data.salesByDay.reduce((sum, row) => sum + row.total - row.refunds, 0);
  const payments = data.paymentsByDay.reduce((sum, row) => sum + row.cash + row.bank + row.pos, 0);
  return <div className={s.overview}>
    <div className={s.stats}>{[['مبيعات اليوم', `${amount(data.today.sales)} ر س`], ['فواتير اليوم', data.today.invoices], ['الورديات المفتوحة', data.today.openShifts], ['طلبات المعمل قيد العمل', data.today.labPending]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <form className={s.range} onSubmit={event => { event.preventDefault(); void load(`/dashboard/system/overview?from=${from}&to=${to}`); }}><label>من تاريخ<input type="date" required value={from} max={to} onChange={event => setFrom(event.target.value)}/></label><label>إلى تاريخ<input type="date" required value={to} min={from} onChange={event => setTo(event.target.value)}/></label><button className={s.primary}>عرض الفترة</button></form>
    <div className={s.stats}><article><span>صافي مبيعات الفترة</span><strong>{amount(sales)} ر س</strong></article><article><span>التحصيل في الفترة</span><strong>{amount(payments)} ر س</strong></article>{data.showMoney && <article><span>مجمل الربح في الفترة</span><strong>{amount(data.salesByDay.reduce((sum, row) => sum + (row.profit ?? 0), 0))} ر س</strong></article>}</div>
    <section className={s.panel}><h3>أحدث الفواتير</h3><div className={s.table}><table><thead><tr><th>الفاتورة</th><th>العميل</th><th>التاريخ</th><th>الإجمالي</th><th>المتبقي</th></tr></thead><tbody>{data.latestInvoices.map(row => <tr key={row.id}><td>#{row.number}</td><td>{row.customer}</td><td>{new Intl.DateTimeFormat('ar-SA', { dateStyle: 'short', timeZone: 'Asia/Riyadh', calendar: 'gregory' }).format(new Date(row.createdAt))}</td><td>{amount(row.total)}</td><td>{amount(row.outstanding)}</td></tr>)}</tbody></table>{!data.latestInvoices.length && <p>لا توجد فواتير في الفترة</p>}</div></section>
    <section className={s.panel}><h3>الأصناف تحت الحد الأدنى</h3><div className={s.table}><table><thead><tr><th>الصنف</th><th>الكود</th><th>الرصيد</th><th>الحد الأدنى</th></tr></thead><tbody>{data.lowStock.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.code}</td><td>{row.quantity} {row.unit}</td><td>{row.minQuantity}</td></tr>)}</tbody></table>{!data.lowStock.length && <p>لا توجد أصناف تحت الحد الأدنى</p>}</div></section>
  </div>;
}
