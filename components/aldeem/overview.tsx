"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { BadgeDollarSign, ClipboardList, FilePlus2, FlaskConical, MonitorSmartphone, ReceiptText, Search, UserPlus, Users } from "lucide-react";
import { getOverview, searchOverview } from "@/app/actions/erp-overview";
import { Action, Help, LinkAction, aldeem as s, day, dayTime, money, quantity } from "./aldeem-ui";
import o from "./overview.module.css";
import { customerHref, invoiceHref, overviewDocumentLabel, type OverviewSearchResult, type OverviewSnapshot } from "@/lib/erp/overview";

const labStatus: Record<string, string> = { requested: "طلب جديد", preparing: "قيد التجهيز", on_hold: "موقوف مؤقتًا", prepared: "تم التجهيز", out_for_delivery: "خرج للتسليم" };

export function AldeemOverview({ initialSnapshot }: { initialSnapshot: OverviewSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [range, setRange] = useState({ from: initialSnapshot.from, to: initialSnapshot.to });
  const [salesTab, setSalesTab] = useState<"invoices" | "profit" | "latest" | "unpaid">("invoices");
  const [paymentsTab, setPaymentsTab] = useState<"stats" | "methods">("stats");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const branchName = new Map(snapshot.branches.map(row => [row.id, row.name]));
  const pos = `/finance/${encodeURIComponent(snapshot.slug)}/pos`;

  function apply() {
    if (range.to < range.from) return setError("تاريخ البداية يجب أن يسبق تاريخ النهاية");
    setError("");
    start(async () => {
      const result = await getOverview(range, snapshot.slug);
      if (result.ok) setSnapshot(result.data); else setError(result.message);
    });
  }
  const salesTotal = snapshot.salesByDay.reduce((sum, row) => sum + row.total - row.refunds, 0);
  const profitTotal = snapshot.salesByDay.reduce((sum, row) => sum + (row.profit ?? 0), 0);
  const paid = snapshot.paymentsByDay.reduce((sum, row) => ({ cash: sum.cash + row.cash, bank: sum.bank + row.bank, pos: sum.pos + row.pos }), { cash: 0, bank: 0, pos: 0 });

  return <main className={s.page} dir="rtl">
    <header className={s.hero}>
      <div><span className={s.eyebrow}>{snapshot.brand}</span><h1>نظرة عامة</h1><p>{snapshot.branchId ? `فرع العمل الحالي ${branchName.get(snapshot.branchId) ?? ""}` : "كل الفروع في صفحة واحدة مبيعات اليوم والتحصيل والمخزون وطلبات المعمل"}</p></div>
      <div className={o.todayRow}>
        <div><span>مبيعات اليوم</span><b>{money(snapshot.today.sales)}</b></div>
        <div><span>فواتير اليوم</span><b>{quantity(snapshot.today.invoices)}</b></div>
        <div><span>ورديات مفتوحة</span><b>{quantity(snapshot.today.openShifts)}</b></div>
        <div><span>طلبات معمل قيد العمل</span><b>{quantity(snapshot.today.labPending)}</b></div>
      </div>
    </header>

    <div className={s.body}>
      <section className={o.searchRow} aria-label="بحث سريع">
        <SearchBox kind="invoice" slug={snapshot.slug} placeholder="ابحث عن فاتورة برقمها أو اسم العميل أو جواله" help="يبحث في فواتير المبيعات ويفتح الفاتورة المختارة" />
        <SearchBox kind="customer" slug={snapshot.slug} placeholder="ابحث عن عميل بالاسم أو الجوال" help="يبحث في العملاء ويفتح ملف العميل وكشف حسابه" />
      </section>

      <nav className={o.tiles} aria-label="الوصول السريع">
        <Tile href={pos} icon={<MonitorSmartphone aria-hidden="true" />} label="ابدأ البيع" help="يفتح شاشة الكاشير لبدء وردية وبيع مباشر" external />
        <Tile href="/dashboard/finance?section=sales&view=create" icon={<FilePlus2 aria-hidden="true" />} label="إنشاء فاتورة" help="ينشئ فاتورة مبيعات لعميل مع بنودها وطريقة الدفع" />
        <Tile href="/dashboard/finance?section=shifts" icon={<ClipboardList aria-hidden="true" />} label="الجلسات" help="ورديات الكاشير المفتوحة والمغلقة وتسليم الصناديق" />
        <Tile href="/dashboard/finance?section=sales" icon={<ReceiptText aria-hidden="true" />} label="الفواتير" help="كل فواتير المبيعات مع حالات السداد" />
        <Tile href="/dashboard/system/customers" icon={<Users aria-hidden="true" />} label="العملاء" help="قائمة العملاء وبياناتهم وأرصدتهم" />
        <Tile href="/dashboard/system/customers/new" icon={<UserPlus aria-hidden="true" />} label="عميل جديد" help="يضيف عميلًا جديدًا إلى الحساب" />
      </nav>

      <section className={s.panel}>
        <div className={s.panelHead}>
          <div><h2>المبيعات</h2><p>صافي المبيعات في الفترة {money(salesTotal)} ريال{snapshot.showMoney ? ` ومجمل الربح ${money(profitTotal)} ريال` : ""}</p></div>
          <div className={s.tabs} role="tablist" aria-label="عرض المبيعات">
            <button type="button" role="tab" className={s.tab} aria-selected={salesTab === "invoices"} onClick={() => setSalesTab("invoices")}>الفواتير</button>
            {snapshot.showMoney && <button type="button" role="tab" className={s.tab} aria-selected={salesTab === "profit"} onClick={() => setSalesTab("profit")}>الربح والخسارة</button>}
            <button type="button" role="tab" className={s.tab} aria-selected={salesTab === "latest"} onClick={() => setSalesTab("latest")}>أحدث الفواتير</button>
            <button type="button" role="tab" className={s.tab} aria-selected={salesTab === "unpaid"} onClick={() => setSalesTab("unpaid")}>فواتير متأخرة عن الدفع</button>
          </div>
        </div>
        <div className={s.panelBody}>
          {(salesTab === "invoices" || salesTab === "profit") && <>
            <RangeBar range={range} setRange={setRange} pending={pending} apply={apply} />
            {error && <p role="alert" className={s.error} style={{ marginTop: 10 }}>{error}</p>}
            <Bars rows={snapshot.salesByDay.map(row => ({ day: row.day, value: salesTab === "invoices" ? row.total - row.refunds : row.profit ?? 0, note: salesTab === "invoices" ? `${quantity(row.invoices)} فاتورة` : "" }))} empty="لا توجد مبيعات في هذه الفترة" tone="purple" />
          </>}
          {salesTab === "latest" && <InvoiceList rows={snapshot.latestInvoices} branchName={branchName} empty="لا توجد فواتير بعد" />}
          {salesTab === "unpaid" && <InvoiceList rows={snapshot.unpaidInvoices} branchName={branchName} empty="لا توجد فواتير غير مسددة" unpaid />}
        </div>
      </section>

      <section className={s.panel}>
        <div className={s.panelHead}>
          <div><h2>المدفوعات</h2><p>المحصل في الفترة {money(paid.cash + paid.bank + paid.pos)} ريال</p></div>
          <div className={s.tabs} role="tablist" aria-label="عرض المدفوعات">
            <button type="button" role="tab" className={s.tab} aria-selected={paymentsTab === "stats"} onClick={() => setPaymentsTab("stats")}>إحصائيات</button>
            <button type="button" role="tab" className={s.tab} aria-selected={paymentsTab === "methods"} onClick={() => setPaymentsTab("methods")}>طرق الدفع</button>
          </div>
        </div>
        <div className={s.panelBody}>
          {paymentsTab === "stats" ? <>
            <RangeBar range={range} setRange={setRange} pending={pending} apply={apply} />
            <Bars rows={snapshot.paymentsByDay.map(row => ({ day: row.day, value: row.cash + row.bank + row.pos, note: "" }))} empty="لا توجد مدفوعات في هذه الفترة" tone="green" />
          </> : <div className={s.stats}>
            <div className={s.stat}><span>نقدًا<Help side="start" text="ما دخل الخزائن وصناديق الكاشير نقدًا" /></span><strong>{money(paid.cash)}</strong><small>ريال</small></div>
            <div className={s.stat}><span>شبكة<Help side="start" text="ما حصل عبر أجهزة نقاط البيع والبطاقات" /></span><strong>{money(paid.pos)}</strong><small>ريال</small></div>
            <div className={s.stat}><span>تحويل بنكي<Help side="start" text="ما دخل الحسابات البنكية مباشرة" /></span><strong>{money(paid.bank)}</strong><small>ريال</small></div>
          </div>}
        </div>
      </section>

      <div className={o.split}>
        <section className={s.panel}>
          <div className={s.panelHead}><h2>المنتجات منخفضة المخزون</h2><LinkAction small side="end" href="/dashboard/system/inventory/items" help="يفتح قائمة أصناف المخزون كاملة مع أرصدتها">عرض الجميع</LinkAction></div>
          {snapshot.lowStock.length ? <ul className={o.list}>{snapshot.lowStock.map(item => <li key={item.id}>
            <div><span className={s.rowTitle}>{item.name}</span><span className={s.rowSub}><bdi dir="ltr">{item.code}</bdi></span></div>
            <span className={s.badge} data-tone={item.quantity <= 0 ? "bad" : "warn"}>{item.quantity <= 0 ? "غير متوفر" : `متبقي ${quantity(item.quantity)} ${item.unit}`}</span>
          </li>)}</ul> : <div className={s.empty}><strong>لا توجد أصناف تحت حد التنبيه</strong></div>}
        </section>
        <section className={s.panel}>
          <div className={s.panelHead}><h2>أحدث المواعيد</h2><LinkAction small side="end" href="/dashboard/system/lab" help="يفتح شاشة طلبات المعمل بكل حالاتها">عرض الجميع</LinkAction></div>
          {snapshot.labOrders.length ? <ul className={o.list}>{snapshot.labOrders.map(order => <li key={order.id}>
            <div><span className={s.rowTitle}><FlaskConical size={13} aria-hidden="true" /> طلب معمل {order.number} · {order.customer}</span><span className={s.rowSub}>التسليم {dayTime(order.requiredAt)} · {branchName.get(order.branchId) ?? ""} · {quantity(order.items)} صنف</span></div>
            <span className={s.badge} data-tone={order.status === "prepared" || order.status === "out_for_delivery" ? "good" : order.status === "on_hold" ? "bad" : "warn"}>{labStatus[order.status] ?? order.status}</span>
          </li>)}</ul> : <div className={s.empty}><strong>لا توجد مواعيد تسليم قادمة</strong></div>}
        </section>
      </div>

      <section className={s.panel}>
        <div className={s.panelHead}><h2>الأنشطة الحالية</h2><LinkAction small side="end" href="/dashboard/system/reports/activity" help="يفتح سجل نشاط الحساب الكامل مع من نفذ كل عملية">عرض الجميع</LinkAction></div>
        {snapshot.activity.length ? <ol className={o.timeline}>{snapshot.activity.map(row => <li key={row.id}>
          <span className={o.dot} aria-hidden="true"><BadgeDollarSign size={13} /></span>
          <div><span className={s.rowTitle}>{overviewDocumentLabel(row.kind, row.origin)} رقم {row.number}{row.party ? ` · ${row.party}` : ""}</span>
            <span className={s.rowSub}>{dayTime(row.at)}{row.actor ? ` · ${row.actor}` : ""}{row.branchId ? ` · ${branchName.get(row.branchId) ?? ""}` : ""}</span></div>
          <b>{money(row.total)}</b>
        </li>)}</ol> : <div className={s.empty}><strong>لا توجد عمليات مسجلة بعد</strong><span>تظهر هنا كل فاتورة ودفعة ومصروف لحظة تسجيلها</span></div>}
      </section>
    </div>
  </main>;
}

function Tile({ href, icon, label, help, external }: { href: string; icon: React.ReactNode; label: string; help: string; external?: boolean }) {
  return <div className={o.tile}>
    {external ? <a href={href} className={o.tileLink}>{icon}<span>{label}</span></a> : <Link href={href} className={o.tileLink}>{icon}<span>{label}</span></Link>}
    <span className={o.tileHelp}><Help text={help} side="start" /></span>
  </div>;
}

function RangeBar({ range, setRange, pending, apply }: { range: { from: string; to: string }; setRange: (value: { from: string; to: string }) => void; pending: boolean; apply: () => void }) {
  return <div className={o.range}>
    <label>من<input type="date" value={range.from} max={range.to} onChange={event => setRange({ ...range, from: event.target.value })} /></label>
    <label>إلى<input type="date" value={range.to} min={range.from} onChange={event => setRange({ ...range, to: event.target.value })} /></label>
    <Action small tone="primary" side="start" help="يعيد حساب المبيعات والمدفوعات للفترة المختارة" disabled={pending || !range.from || !range.to} onClick={apply}>{pending ? "جار التطبيق" : "تطبيق"}</Action>
  </div>;
}

function Bars({ rows, empty, tone }: { rows: { day: string; value: number; note: string }[]; empty: string; tone: "purple" | "green" }) {
  if (!rows.length) return <div className={s.empty}><strong>{empty}</strong></div>;
  const max = Math.max(...rows.map(row => Math.abs(row.value)), 1);
  return <div className={o.chart} role="img" aria-label={`رسم بياني يومي لعدد ${rows.length} يوم`}>
    {rows.map(row => <div key={row.day} className={o.bar} data-tone={row.value < 0 ? "bad" : tone} title={`${day(row.day)} · ${money(row.value)} ريال${row.note ? ` · ${row.note}` : ""}`}>
      <i style={{ height: `${Math.max(3, Math.abs(row.value) / max * 100)}%` }} />
      <span>{row.day.slice(8)}</span>
    </div>)}
  </div>;
}

function InvoiceList({ rows, branchName, empty, unpaid }: { rows: { id: string; number: number; createdAt: string; customer: string; total: number; outstanding: number; branchId?: string | null }[]; branchName: Map<string, string>; empty: string; unpaid?: boolean }) {
  if (!rows.length) return <div className={s.empty}><strong>{empty}</strong></div>;
  return <div className={s.tableWrap}><table className={s.table}>
    <thead><tr><th>الفاتورة</th><th>العميل</th><th>التاريخ</th><th data-num>الإجمالي</th><th data-num>{unpaid ? "المتبقي" : "الحالة"}</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.id}>
      <td><Link href={invoiceHref(row.id)} className={s.rowTitle}>فاتورة {row.number}</Link>{row.branchId && <span className={s.rowSub}>{branchName.get(row.branchId) ?? ""}</span>}</td>
      <td>{row.customer || "عميل نقدي"}</td><td>{dayTime(row.createdAt)}</td><td data-num>{money(row.total)}</td>
      <td data-num>{unpaid ? money(row.outstanding) : <span className={s.badge} data-tone={row.outstanding > 0 ? "warn" : "good"}>{row.outstanding > 0 ? `متبقي ${money(row.outstanding)}` : "مدفوعة"}</span>}</td>
    </tr>)}</tbody>
  </table></div>;
}

function SearchBox({ kind, slug, placeholder, help }: { kind: "invoice" | "customer"; slug: string; placeholder: string; help: string }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<OverviewSearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const latest = useRef(0);
  useEffect(() => {
    const text = query.trim();
    if (!text) { latest.current++; return; }
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      setBusy(true);
      void searchOverview(kind, text, slug).then(response => {
        if (ticket !== latest.current) return;
        if (response.ok) { setResult(response.data); setMessage(""); } else { setResult(null); setMessage(response.message); }
      }).catch(() => { if (ticket === latest.current) setMessage("تعذر الاتصال حاول مرة أخرى"); }).finally(() => { if (ticket === latest.current) setBusy(false); });
    }, 280);
    return () => clearTimeout(timer);
  }, [query, kind, slug]);
  const open = query.trim().length > 0;
  return <div className={o.search}>
    <Search size={16} aria-hidden="true" />
    <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
    <Help text={help} side="end" />
    {open && <div className={o.results} role="listbox" aria-label="نتائج البحث">
      {busy && !result && <p className={s.rowSub}>يبحث الآن</p>}
      {message && <p role="alert" className={s.error}>{message}</p>}
      {result?.kind === "invoice" && result.rows.map(row => <Link key={row.id} href={invoiceHref(row.id)} role="option" aria-selected="false"><span className={s.rowTitle}>فاتورة {row.number} · {row.customer || "عميل نقدي"}</span><span className={s.rowSub}>{day(row.createdAt)} · {money(row.total)} ريال</span></Link>)}
      {result?.kind === "customer" && result.rows.map(row => <Link key={row.id} href={customerHref(row.id)} role="option" aria-selected="false"><span className={s.rowTitle}>{row.name}</span><span className={s.rowSub}><bdi dir="ltr">{row.phone}</bdi></span></Link>)}
      {result && !result.rows.length && !message && <p className={s.rowSub}>لا توجد نتائج مطابقة</p>}
    </div>}
  </div>;
}
