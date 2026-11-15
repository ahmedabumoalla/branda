"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Banknote, PackageSearch, Radio, RefreshCw, ScanBarcode } from "lucide-react";
import { getBranchMonitor, getCashTrail, traceItem } from "@/app/actions/erp-tracking";
import { Action, Help, LinkAction, aldeem as s, day, dayTime, money, quantity } from "./aldeem-ui";
import { trackingModes, type BranchMonitor, type CashTrail, type ItemTrace, type MonitorShift } from "@/lib/erp/tracking";

function Sections({ current }: { current: "monitor" | "items" | "cash" }) {
  return <div className={s.heroActions}>
    <LinkAction tone={current === "monitor" ? "primary" : undefined} side="end" href="/dashboard/system/tracking" help="حالة كل فرع الآن: مبيعات اليوم والورديات المفتوحة وصناديقها"><Radio aria-hidden="true" />متابعة الفروع</LinkAction>
    <LinkAction tone={current === "items" ? "primary" : undefined} side="end" href="/dashboard/system/tracking/items" help="مسار الصنف: كيف دخل المخزون وأين ذهب وأين بيع"><PackageSearch aria-hidden="true" />تتبع الأصناف</LinkAction>
    <LinkAction tone={current === "cash" ? "primary" : undefined} side="end" href="/dashboard/system/tracking/cash" help="كل ريال دخل أو خرج: من أي حساب ومن سجله ومقابل ماذا"><Banknote aria-hidden="true" />تتبع النقد</LinkAction>
  </div>;
}

export function BranchMonitorView({ initialSnapshot }: { initialSnapshot: BranchMonitor }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [live, setLive] = useState(true);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  async function refresh() {
    if (busy.current) return;
    busy.current = true;
    try { const result = await getBranchMonitor(snapshot.slug); if (result.ok) { setSnapshot(result.data); setFailed(false); } else setFailed(true); }
    catch { setFailed(true); }
    finally { busy.current = false; }
  }
  useEffect(() => {
    if (!live) return;
    // The view stays current on its own; a hidden tab does not poll
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 20000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, snapshot.slug]);
  const branchName = new Map(snapshot.branches.map(row => [row.id, row.name]));
  const total = snapshot.branches.reduce((sum, row) => ({ sales: sum.sales + row.sales, invoices: sum.invoices + row.invoices, shifts: sum.shifts + row.openShifts.length }), { sales: 0, invoices: 0, shifts: snapshot.unassignedShifts.length });
  return <main className={s.page} dir="rtl">
    <header className={s.hero}>
      <div><span className={s.eyebrow}>{snapshot.brand}</span><h1>متابعة الفروع المباشرة</h1><p>آخر تحديث {dayTime(snapshot.at)} ويتجدد كل عشرين ثانية ما دامت الصفحة مفتوحة</p></div>
      <Sections current="monitor" />
    </header>
    <div className={s.body}>
      {failed && <p className={s.notice} role="status">تعذر التحديث الآن والأرقام المعروضة من آخر قراءة ناجحة</p>}
      <div className={s.toolbar}>
        <Action small side="start" help="يقرأ أرقام الفروع الآن دون انتظار التحديث التلقائي" onClick={() => void refresh()}><RefreshCw aria-hidden="true" />تحديث الآن</Action>
        <Action small side="start" help={live ? "يوقف التحديث التلقائي ويثبت الأرقام الحالية" : "يعيد التحديث التلقائي كل عشرين ثانية"} onClick={() => setLive(value => !value)}>{live ? "إيقاف التحديث التلقائي" : "تشغيل التحديث التلقائي"}</Action>
      </div>
      <section className={s.stats} aria-label="إجمالي اليوم">
        <div className={s.stat} data-tone="good"><span>مبيعات اليوم لكل الفروع</span><strong>{money(total.sales)}</strong><small>ريال</small></div>
        <div className={s.stat}><span>فواتير اليوم</span><strong>{quantity(total.invoices)}</strong></div>
        <div className={s.stat}><span>ورديات مفتوحة الآن</span><strong>{quantity(total.shifts)}</strong></div>
        <div className={s.stat}><span>فروع عاملة<Help side="start" text="الفروع الفعالة في الحساب" /></span><strong>{quantity(snapshot.branches.filter(row => row.active).length)}</strong></div>
      </section>
      <section className={s.cards}>
        {snapshot.branches.map(row => <article key={row.id} className={s.card}>
          <div className={s.cardHead}><div><h3>{row.name}</h3><span className={s.rowSub}>{row.city ?? ""}{row.lastSaleAt ? ` · آخر بيع ${dayTime(row.lastSaleAt)}` : " · لا مبيعات اليوم"}</span></div>
            <span className={s.badge} data-tone={row.openShifts.length ? "good" : "mute"}>{row.openShifts.length ? `${quantity(row.openShifts.length)} وردية مفتوحة` : "لا وردية مفتوحة"}</span></div>
          <div className={s.cardGrid}><div><span>مبيعات اليوم</span><b>{money(row.sales)}</b></div><div><span>فواتير</span><b>{quantity(row.invoices)}</b></div><div><span>مرتجعات</span><b>{money(row.refunds)}</b></div></div>
          <div className={s.cardGrid}><div><span>مشتريات اليوم</span><b>{money(row.purchases)}</b></div><div><span>مصروفات اليوم</span><b>{money(row.expenses)}</b></div><div><span>قيمة المخزون</span><b>{money(row.stockValue)}</b></div></div>
          <div className={s.places}>
            <span className={s.place}>موظفون<b>{quantity(row.employees)}</b></span>
            <span className={s.place}>أصناف تحت الحد<b>{quantity(row.lowStock)}</b></span>
            <span className={s.place}>طلبات معمل قيد العمل<b>{quantity(row.labPending)}</b></span>
          </div>
          {row.openShifts.map(shift => <ShiftLine key={shift.id} shift={shift} />)}
        </article>)}
      </section>
      {snapshot.unassignedShifts.length > 0 && <section className={s.panel}><div className={s.panelHead}><div><h2>ورديات مفتوحة لم يحدد فرعها بعد</h2><p>يتحدد فرع الوردية من أول فاتورة فيها أو من فرع الموظف في ملفه</p></div></div><div className={s.panelBody}>{snapshot.unassignedShifts.map(shift => <ShiftLine key={shift.id} shift={shift} />)}</div></section>}
      <section className={s.panel}>
        <div className={s.panelHead}><div><h2>آخر العمليات اليوم</h2><p>كل مستند لحظة تسجيله مع الفرع ومن سجله</p></div></div>
        {snapshot.feed.length ? <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>الوقت</th><th>العملية</th><th>الفرع</th><th>بواسطة</th><th data-num>المبلغ</th></tr></thead>
          <tbody>{snapshot.feed.map(row => <tr key={row.id}><td>{dayTime(row.at)}</td><td>{row.label} رقم {row.number}</td><td>{row.branchId ? branchName.get(row.branchId) ?? "" : "بدون فرع"}</td><td>{row.actor}</td><td data-num>{money(row.total)}</td></tr>)}</tbody>
        </table></div> : <div className={s.empty}><strong>لا توجد عمليات اليوم بعد</strong></div>}
      </section>
    </div>
  </main>;
}

function ShiftLine({ shift }: { shift: MonitorShift }) {
  return <div className={s.notice} data-tone={shift.paused ? "bad" : "good"} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
    <span>وردية {shift.number} · {shift.cashier || "كاشير"} · منذ {dayTime(shift.openedAt)}{shift.paused ? " · موقوفة إداريًا" : ""}</span>
    <span>{quantity(shift.sales)} فاتورة بقيمة {money(shift.salesTotal)} · في الصندوق {money(shift.drawer)}</span>
  </div>;
}

export function ItemTraceView() {
  const [query, setQuery] = useState("");
  const [trace, setTrace] = useState<ItemTrace | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  function search(text: string) {
    const value = text.trim();
    if (!value) return setError("اكتب اسم الصنف أو امسح الباركود");
    setError("");
    start(async () => { const result = await traceItem(value); if (result.ok) setTrace(result.data); else { setTrace(null); setError(result.message); } });
  }
  const item = trace?.item, branchName = new Map((trace?.branches ?? []).map(row => [row.id, row.name]));
  return <main className={s.page} dir="rtl">
    <header className={s.hero}>
      <div><span className={s.eyebrow}>التتبع</span><h1>تتبع الأصناف</h1><p>امسح باركود الصنف أو اكتب اسمه لترى كيف دخل المخزون وأين ذهب وأين بيع</p></div>
      <Sections current="items" />
    </header>
    <div className={s.body}>
      <form className={s.toolbar} onSubmit={event => { event.preventDefault(); search(query); }}>
        <ScanBarcode size={18} aria-hidden="true" />
        <input className={s.search} style={{ minWidth: 280, flex: 1, maxWidth: 520 }} type="search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="باركود الصنف أو رمزه أو اسمه" aria-label="بحث عن صنف للتتبع" />
        <Action type="submit" tone="primary" side="start" help="يعرض بطاقة الصنف ومساره الكامل في المخزون والمبيعات" disabled={pending}>{pending ? "جار التتبع" : "تتبع"}</Action>
      </form>
      {error && <p role="alert" className={s.error}>{error}</p>}
      {trace && !item && (trace.matches.length ? <section className={s.panel}><div className={s.panelHead}><h2>اختر الصنف المقصود</h2></div><div className={s.panelBody}><div className={s.places}>{trace.matches.map(match => <Action key={match.id} small help="يعرض مسار هذا الصنف" onClick={() => { setQuery(match.code); search(match.id); }}>{match.name} · {match.code}</Action>)}</div></div></section>
        : <div className={s.panel}><div className={s.empty}><strong>لا يوجد صنف بهذا الاسم أو الباركود</strong></div></div>)}
      {item && trace.totals && <>
        <section className={s.panel}>
          <div className={s.panelHead}><div><h2>{item.name}</h2><p><bdi dir="ltr">{item.barcode ?? item.sku}</bdi>{item.flavor ? ` · ${item.flavor}` : ""}{item.category ? ` · ${item.category}` : ""}</p></div><span className={s.badge} data-tone={item.active ? "good" : "mute"}>{item.active ? "فعال" : "موقوف"}</span></div>
          <div className={s.panelBody} style={{ display: "grid", gap: 12 }}>
            <div className={s.places}>
              <span className={s.place}>الوحدة<b>{item.unit}</b></span>
              <span className={s.place}>التتبع<b>{trackingModes[item.trackingMode] ?? item.trackingMode}</b></span>
              {item.family ? <span className={s.place}>أسرة منتجة<b>{item.family}</b></span> : item.seller ? <span className={s.place}>المورد<b>{item.seller}</b></span> : null}
              {item.brand && item.brand !== item.family && <span className={s.place}>الماركة<b>{item.brand}</b></span>}
              <span className={s.place}>سعر الشراء<b>{money(item.buyPrice)}</b></span>
              <span className={s.place}>سعر البيع<b>{money(item.salePrice)}</b></span>
              {item.soldAs.map(product => <span key={product.name} className={s.place}>يباع في الكاشير باسم<b>{product.name}</b></span>)}
            </div>
            <div className={s.stats}>
              <div className={s.stat}><span>دخل بالشراء<Help side="start" text="الكميات التي دخلت المخزون من فواتير الشراء واستلامات الأسر" /></span><strong>{quantity(trace.totals.purchased)}</strong></div>
              <div className={s.stat}><span>دخل بطرق أخرى<Help side="start" text="إنتاج المعمل وأذون الإضافة والتحويلات الواردة وتسويات الجرد" /></span><strong>{quantity(trace.totals.otherIn)}</strong></div>
              <div className={s.stat} data-tone="good"><span>بيع للعملاء</span><strong>{quantity(trace.totals.sold - trace.totals.returnedByCustomers)}</strong><small>مرتجع عملاء {quantity(trace.totals.returnedByCustomers)}</small></div>
              <div className={s.stat}><span>أعيد للمورد</span><strong>{quantity(trace.totals.returnedToSupplier)}</strong></div>
              <div className={s.stat}><span>خرج بطرق أخرى<Help side="start" text="صرف للتصنيع وأذون الصرف والتحويلات الصادرة وتسويات الجرد" /></span><strong>{quantity(trace.totals.otherOut)}</strong></div>
              <div className={s.stat} data-tone="due"><span>الموجود الآن</span><strong>{quantity((trace.stock ?? []).reduce((sum, row) => sum + row.quantity, 0))}</strong></div>
            </div>
            <div><h3 style={{ fontSize: 13, marginBottom: 6 }}>أين يوجد الآن</h3><div className={s.places}>{trace.stock?.length ? trace.stock.map(row => <span key={row.warehouseId} className={s.place}>{row.branchId && branchName.get(row.branchId) ? `${branchName.get(row.branchId)} · ` : ""}{row.warehouse}<b>{quantity(row.quantity)}</b></span>) : <span className={s.rowSub}>لا يوجد رصيد في أي مستودع</span>}</div></div>
            {!!trace.lots?.length && <div><h3 style={{ fontSize: 13, marginBottom: 6 }}>التشغيلات وتواريخ الانتهاء</h3><div className={s.places}>{trace.lots.map(lot => <span key={lot.id} className={s.place}>{lot.lot || lot.serial}{lot.expiresOn ? ` · ينتهي ${day(lot.expiresOn)}` : ""}<b>{quantity(lot.quantity)}</b></span>)}</div></div>}
          </div>
        </section>
        <section className={s.panel}>
          <div className={s.panelHead}><div><h2>مسار الصنف</h2><p>كل حركة من الأحدث إلى الأقدم مع المستند والفرع والطرف ومن سجلها</p></div></div>
          {trace.movements?.length ? <div className={s.tableWrap}><table className={s.table}>
            <thead><tr><th>الوقت</th><th>الحركة</th><th>المستودع والفرع</th><th>الطرف</th><th>التشغيلة</th><th data-num>دخل</th><th data-num>خرج</th><th data-num>تكلفة الوحدة</th><th>بواسطة</th></tr></thead>
            <tbody>{trace.movements.map(row => <tr key={row.id}>
              <td>{dayTime(row.at)}</td>
              <td><span className={s.rowTitle}>{row.label} رقم {row.number}</span>{row.voucher && <span className={s.rowSub}>إذن مخزني {row.voucher}</span>}</td>
              <td><span className={s.rowTitle}>{row.warehouse}</span>{row.branchId && <span className={s.rowSub}>{branchName.get(row.branchId) ?? ""}</span>}</td>
              <td>{row.party}</td><td>{row.lots ?? ""}</td>
              <td data-num>{row.quantity > 0 ? quantity(row.quantity) : ""}</td><td data-num>{row.quantity < 0 ? quantity(-row.quantity) : ""}</td><td data-num>{money(row.unitCost)}</td><td>{row.actor}</td>
            </tr>)}</tbody>
          </table></div> : <div className={s.empty}><strong>لا توجد حركات على هذا الصنف بعد</strong></div>}
        </section>
      </>}
    </div>
  </main>;
}

export function CashTrailView({ initialSnapshot }: { initialSnapshot: CashTrail }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [filter, setFilter] = useState({ from: initialSnapshot.from, to: initialSnapshot.to, accountId: initialSnapshot.accountId, branchId: initialSnapshot.filterBranchId });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const branchName = new Map(snapshot.branches.map(row => [row.id, row.name])), accountName = new Map(snapshot.accounts.map(row => [row.id, row.name]));
  function apply() {
    if (filter.to < filter.from) return setError("تاريخ البداية يجب أن يسبق تاريخ النهاية");
    setError("");
    start(async () => { const result = await getCashTrail(filter, snapshot.slug); if (result.ok) setSnapshot(result.data); else setError(result.message); });
  }
  return <main className={s.page} dir="rtl">
    <header className={s.hero}>
      <div><span className={s.eyebrow}>{snapshot.brand}</span><h1>تتبع النقد</h1><p>كل ريال دخل أو خرج من الخزائن والصناديق والبنوك: أين ذهب ومن سجله ومن استلمه ومقابل أي مستند</p></div>
      <Sections current="cash" />
    </header>
    <div className={s.body}>
      <div className={s.toolbar}>
        <label className={s.field}><span>من</span><input type="date" value={filter.from} max={filter.to} onChange={event => setFilter({ ...filter, from: event.target.value })} /></label>
        <label className={s.field}><span>إلى</span><input type="date" value={filter.to} min={filter.from} onChange={event => setFilter({ ...filter, to: event.target.value })} /></label>
        <label className={s.field}><span>الحساب</span><select value={filter.accountId} onChange={event => setFilter({ ...filter, accountId: event.target.value })}><option value="">كل الخزائن والبنوك</option>{snapshot.accounts.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        {!snapshot.branchId && <label className={s.field}><span>الفرع</span><select value={filter.branchId} onChange={event => setFilter({ ...filter, branchId: event.target.value })}><option value="">كل الفروع</option>{snapshot.branches.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
        <Action tone="primary" side="start" help="يعرض حركة النقد للفترة والحساب والفرع المختارة" disabled={pending} onClick={apply}>{pending ? "جار العرض" : "عرض"}</Action>
      </div>
      {error && <p role="alert" className={s.error}>{error}</p>}
      <section className={s.stats} aria-label="ملخص النقد">
        <div className={s.stat} data-tone="good"><span>إجمالي الداخل</span><strong>{money(snapshot.totals.in)}</strong><small>ريال في الفترة</small></div>
        <div className={s.stat} data-tone="due"><span>إجمالي الخارج</span><strong>{money(snapshot.totals.out)}</strong><small>ريال في الفترة</small></div>
        <div className={s.stat}><span>صافي الحركة</span><strong>{money(snapshot.totals.in - snapshot.totals.out)}</strong></div>
        <div className={s.stat}><span>عدد الحركات</span><strong>{quantity(snapshot.totals.count)}</strong></div>
      </section>
      <section className={s.panel}>
        <div className={s.panelHead}><div><h2>الحسابات النقدية</h2><p>الرصيد الحالي لكل خزينة وصندوق وحساب بنكي مع حركة الفترة</p></div></div>
        <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>الحساب</th><th>النوع</th><th data-num>داخل في الفترة</th><th data-num>خارج في الفترة</th><th data-num>الرصيد الحالي</th></tr></thead>
          <tbody>{snapshot.accounts.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.drawer ? "صندوق كاشير" : row.kind === "cash" ? "خزينة" : row.kind === "bank" ? "حساب بنكي" : "شبكة"}</td><td data-num>{money(row.in)}</td><td data-num>{money(row.out)}</td><td data-num>{money(row.balance)}</td></tr>)}</tbody>
        </table></div>
      </section>
      <section className={s.panel}>
        <div className={s.panelHead}><div><h2>حركة النقد</h2><p>من الأحدث إلى الأقدم وتعرض آخر أربعمئة حركة في الفترة</p></div></div>
        {snapshot.rows.length ? <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>الوقت</th><th>الحساب</th><th>المستند</th><th>الطرف</th><th>الفرع</th><th>سجله</th><th>الكاشير والوردية</th><th data-num>داخل</th><th data-num>خارج</th></tr></thead>
          <tbody>{snapshot.rows.map(row => <tr key={row.id}>
            <td>{dayTime(row.at)}</td><td>{accountName.get(row.accountId) ?? ""}</td>
            <td><span className={s.rowTitle}>{row.label} رقم {row.number}</span>{row.originNumber ? <span className={s.rowSub}>عن المستند رقم {row.originNumber}</span> : row.note ? <span className={s.rowSub}>{row.note}</span> : null}</td>
            <td>{row.party}</td><td>{row.branchId ? branchName.get(row.branchId) ?? "" : ""}</td><td>{row.actor}</td>
            <td>{row.shiftNumber ? `${row.cashier ?? ""} · وردية ${row.shiftNumber}` : ""}</td>
            <td data-num>{row.in > 0 ? money(row.in) : ""}</td><td data-num>{row.out > 0 ? money(row.out) : ""}</td>
          </tr>)}</tbody>
        </table></div> : <div className={s.empty}><strong>لا توجد حركة نقد في هذه الفترة</strong></div>}
      </section>
    </div>
  </main>;
}
