"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, ClipboardList, Snowflake, Trash2, Truck, Warehouse as WarehouseIcon } from "lucide-react";
import { money, sum, type DemoData, type Lot, type Row, type WarehouseInfo } from "./data";
import { cell, Kpis, RecordPage, Register, type Col, type Def } from "./kit";
import { ItemPage } from "./item";
import { useDemo } from "./store";
import s from "./demo.module.css";

const n = (value: number) => value.toLocaleString("en-US");

export function DemoOverview({ d, go }: { d: DemoData; go: (section: string) => void }) {
  const today = d.invoices.filter(row => row.date === d.day(0));
  const peak = Math.max(...d.daily.map(point => point.total));
  const byBranch = d.branches.map(branch => ({ name: branch.name, total: sum(d.invoices.filter(row => row.branch === branch.name), "total") * 9 })).sort((a, b) => b.total - a.total);
  const top = [...d.products].sort((a, b) => b.sold * b.price - a.sold * a.price).slice(0, 6);
  const near = d.lots.filter(lot => lot.state === "قريب الانتهاء").length;
  const damaged = d.lots.filter(lot => lot.state === "تالف" || lot.state === "منتهي").length;
  const { orders } = useDemo();
  const pending = orders.filter(order => order.status === "جديد" || order.status === "قيد التجهيز").length;
  const delivered = orders.filter(order => order.status === "تم التسليم للفرع").length;
  return <>
    <section className={s.hero} style={{ marginTop: "clamp(20px,4vw,40px)" }}>
      <div><h2>مرحبًا بك في مساحة عمل الديم</h2><p>كل الفروع والمصنع والمستودعات والعملاء في شاشة واحدة</p></div>
      <div className={s.heroStats}>
        <div><span>مبيعات اليوم</span><strong><bdi>{money(d.daily[13].total)}</bdi></strong></div>
        <div><span>فواتير اليوم</span><strong><bdi>{n(today.length * 21)}</bdi></strong></div>
        <div><span>ورديات مفتوحة</span><strong><bdi>{d.shifts.length}</bdi></strong></div>
        <div><span>أوامر إنتاج جارية</span><strong><bdi>{d.mfgOrders.filter(row => row.status === "قيد الإنتاج").length}</bdi></strong></div>
      </div>
    </section>
    <Kpis items={[
      { label: "مبيعات آخر 14 يومًا", value: money(d.daily.reduce((total, point) => total + point.total, 0)), note: "أعلى من الفترة السابقة بنسبة 12%", tone: "good" },
      { label: "متوسط الفاتورة", value: money(sum(d.invoices, "total") / d.invoices.length) },
      { label: "عملاء الولاء", value: n(sum(d.loyaltyBranches, "cards")), note: `${n(sum(d.loyaltyBranches, "pointsMonth"))} نقطة هذا الشهر` },
      { label: "قيمة المخزون", value: money(d.lots.reduce((total, lot) => total + lot.qty * lot.cost, 0)) },
      { label: "النقد والبنوك", value: money(sum(d.treasuries, "balance")), tone: "good" },
      { label: "الموظفون على رأس العمل", value: n(d.employees.filter(row => row.status === "على رأس العمل").length) },
    ]} />
    <div className={s.grid2}>
      <section className={s.panel}><div className={s.panelHead}><h2>المبيعات اليومية</h2><span>آخر 14 يومًا</span></div><div className={s.panelBody}><div className={s.chart} role="img" aria-label="رسم المبيعات اليومية لآخر 14 يومًا">{d.daily.map((point, index) => <div className={s.col} key={point.day} title={`${point.day} ${money(point.total)}`}><i style={{ height: `${Math.round(point.total / peak * 100)}%`, animationDelay: `${index * 30}ms` }} /><small><bdi>{point.day.slice(8)}</bdi></small></div>)}</div></div></section>
      <section className={s.panel}><div className={s.panelHead}><h2>ترتيب الفروع</h2><span>مبيعات الشهر</span></div><div className={s.panelBody}><div className={s.bars}>{byBranch.map(branch => <div className={s.barRow} key={branch.name}><span>{branch.name}</span><div className={s.track}><span className={s.fill} style={{ width: `${Math.round(branch.total / byBranch[0].total * 100)}%` }} /></div><bdi className={s.num}>{money(branch.total)}</bdi></div>)}</div></div></section>
    </div>
    <div className={s.grid2} style={{ marginTop: 20 }}>
      <section className={s.panel}><div className={s.panelHead}><h2>الأصناف الأعلى مبيعًا</h2><span>هذا الشهر</span></div><div className={s.panelBody}><div className={s.bars}>{top.map(product => <div className={s.barRow} key={product.id}><span>{product.name}</span><div className={s.track}><span className={s.fill} style={{ width: `${Math.round(product.sold * product.price / (top[0].sold * top[0].price) * 100)}%` }} /></div><bdi className={s.num}>{money(product.sold * product.price)}</bdi></div>)}</div></div></section>
      <section className={s.panel}><div className={s.panelHead}><h2>يحتاج انتباهك</h2><span>اضغط للانتقال</span></div><div className={s.panelBody}><div className={s.alerts}>
        <button type="button" className={s.alert} onClick={() => go("inventory-warehouses")}><span className={s.warn}><CalendarClock size={18} aria-hidden="true" /></span><div><strong>{near} تشغيلة قريبة الانتهاء</strong><small>راجعها في المستودعات قبل انتهاء صلاحيتها</small></div></button>
        <button type="button" className={s.alert} onClick={() => go("inventory-disposal-orders")}><span className={s.bad}><Trash2 size={18} aria-hidden="true" /></span><div><strong>{damaged} تشغيلة تالفة أو منتهية</strong><small>تنتظر أوامر الإتلاف واعتمادها</small></div></button>
        <button type="button" className={s.alert} onClick={() => go("workshop-branch-requests")}><span className={s.warn}><ClipboardList size={18} aria-hidden="true" /></span><div><strong>{pending} طلب فرع لدى المعمل</strong><small>جديدة وقيد التجهيز</small></div></button>
        <button type="button" className={s.alert} onClick={() => go("workshop-deliveries")}><span className={s.good}><Truck size={18} aria-hidden="true" /></span><div><strong>{delivered} طلب سلّمه المعمل وينتظر استلام الفرع</strong><small>الفرع يستلم ثم يصدر الفاتورة</small></div></button>
        <button type="button" className={s.alert} onClick={() => go("customer-balances")}><span className={s.warn}><AlertTriangle size={18} aria-hidden="true" /></span><div><strong>{money(sum(d.customers, "balance"))} أرصدة آجلة على العملاء</strong><small>تابع التحصيل من أرصدة العملاء</small></div></button>
      </div></div></section>
    </div>
  </>;
}

const STATES: Lot["state"][] = ["صالح", "قريب الانتهاء", "منتهي", "تالف"];
const HEALTH = { "صالح": s.hGood, "قريب الانتهاء": s.hNear, "منتهي": s.hExp, "تالف": s.hDmg };
const lotCols: Col[] = [["code", "التشغيلة", "code"], ["item", "الصنف", "strong"], ["category", "التصنيف"], ["qty", "الكمية", "num"], ["unit", "الوحدة"], ["produced", "تاريخ الإنتاج", "date"], ["expiry", "تاريخ الانتهاء", "date"], ["days", "المتبقي"], ["value", "القيمة", "money"], ["state", "الحالة", "status"]];
const lotRow = (lot: Lot): Row => ({ ...lot, days: lot.daysLeft < 0 ? `منتهي منذ ${-lot.daysLeft} يوم` : lot.daysLeft === 0 ? "ينتهي اليوم" : `${lot.daysLeft} يوم`, value: lot.qty * lot.cost });
const stats = (lots: Lot[]) => STATES.map(state => { const list = lots.filter(lot => lot.state === state); return { state, lots: list.length, qty: list.reduce((total, lot) => total + lot.qty, 0), value: list.reduce((total, lot) => total + lot.qty * lot.cost, 0) }; });

function Health({ lots }: { lots: Lot[] }) {
  const parts = stats(lots); const total = parts.reduce((sumQty, part) => sumQty + part.qty, 0) || 1;
  return <><div className={s.health} role="img" aria-label="توزيع حالة المخزون">{parts.map(part => <i key={part.state} className={HEALTH[part.state]} style={{ width: `${part.qty / total * 100}%` }} />)}</div><div className={s.legend}>{parts.map(part => <span key={part.state}><i className={HEALTH[part.state]} />{part.state} <bdi>{Math.round(part.qty / total * 100)}%</bdi></span>)}</div></>;
}

export function DemoWarehouses({ d }: { d: DemoData }) {
  const [openId, setOpenId] = useState("");
  const warehouse = d.warehouses.find(item => item.id === openId);
  if (warehouse) return <WarehouseDetail d={d} warehouse={warehouse} back={() => setOpenId("")} />;
  const all = stats(d.lots);
  return <>
    <Kpis items={[
      { label: "المستودعات", value: n(d.warehouses.length) },
      { label: "قيمة المخزون", value: money(d.lots.reduce((total, lot) => total + lot.qty * lot.cost, 0)) },
      { label: "مخزون صالح", value: money(all[0].value), note: `${all[0].lots} تشغيلة`, tone: "good" },
      { label: "قريب الانتهاء", value: money(all[1].value), note: `${all[1].lots} تشغيلة`, tone: "warn" },
      { label: "منتهي الصلاحية", value: money(all[2].value), note: `${all[2].lots} تشغيلة`, tone: "bad" },
      { label: "تالف", value: money(all[3].value), note: `${all[3].lots} تشغيلة`, tone: "bad" },
    ]} />
    <div className={s.whGrid}>{d.warehouses.map(item => { const lots = d.lots.filter(lot => lot.warehouse === item.id); const Icon = item.kind === "تبريد" ? Snowflake : item.kind === "عزل وإتلاف" ? Trash2 : WarehouseIcon; return <button type="button" key={item.id} className={s.whCard} onClick={() => setOpenId(item.id)} aria-label={`فتح ${item.name}`}>
      <div className={s.whTop}><span className={s.whIcon}><Icon size={22} aria-hidden="true" /></span><div><strong>{item.name}</strong><small>{item.kind} · {item.city}</small></div></div>
      <div className={s.whMeta}>
        <div><span>الأصناف</span><b><bdi>{new Set(lots.map(lot => lot.item)).size}</bdi></b></div>
        <div><span>التشغيلات</span><b><bdi>{lots.length}</bdi></b></div>
        <div><span>قيمة المخزون</span><b><bdi>{money(lots.reduce((total, lot) => total + lot.qty * lot.cost, 0))}</bdi></b></div>
        <div><span>الإشغال</span><b><bdi>{item.capacity}%</bdi></b></div>
        <div><span>أمين المستودع</span><b>{item.manager}</b></div>
        <div><span>درجة الحرارة</span><b>{item.temperature}</b></div>
      </div>
      <Health lots={lots} />
    </button>; })}</div>
  </>;
}

type View = "balances" | "lots" | "near" | "expired" | "damaged" | "moves";
function WarehouseDetail({ d, warehouse, back }: { d: DemoData; warehouse: WarehouseInfo; back: () => void }) {
  const [view, setView] = useState<View>("balances");
  const [item, setItem] = useState<Row | null>(null);
  const lots = useMemo(() => d.lots.filter(lot => lot.warehouse === warehouse.id), [d, warehouse.id]);
  const parts = stats(lots);
  const balances = useMemo(() => [...new Set(lots.map(lot => lot.item))].map((name, index): Row => {
    const list = lots.filter(lot => lot.item === name); const qty = (state: Lot["state"]) => list.filter(lot => lot.state === state).reduce((total, lot) => total + lot.qty, 0);
    const good = qty("صالح"), near = qty("قريب الانتهاء"), expired = qty("منتهي"), damaged = qty("تالف"); const minimum = 20 + (index * 7) % 30;
    return { id: `bal${index}`, item: name, category: list[0].category, unit: list[0].unit, good, near, expired, damaged, total: good + near + expired + damaged, minimum, value: list.reduce((total, lot) => total + lot.qty * lot.cost, 0), lotsCount: list.length, nextExpiry: [...list].sort((a, b) => a.daysLeft - b.daysLeft)[0].expiry, status: good + near === 0 ? "غير متاح للبيع" : good + near < minimum ? "تحت حد الطلب" : near > good ? "قريب الانتهاء" : "صالح" };
  }), [lots]);
  const balanceCols: Col[] = [["item", "الصنف", "strong"], ["category", "التصنيف"], ["unit", "الوحدة"], ["good", "صالح", "num"], ["near", "قريب الانتهاء", "num"], ["expired", "منتهي", "num"], ["damaged", "تالف", "num"], ["total", "الإجمالي", "num"], ["minimum", "حد الطلب", "num"], ["nextExpiry", "أقرب انتهاء", "date"], ["value", "القيمة", "money"], ["status", "الحالة", "status"]];
  const moveCols: Col[] = [["no", "رقم الحركة", "code"], ["date", "التاريخ", "date"], ["kind", "نوع الحركة", "strong"], ["item", "الصنف"], ["lot", "التشغيلة", "code"], ["qty", "الكمية", "num"], ["unit", "الوحدة"], ["by", "المنفذ"], ["status", "الحالة", "status"]];
  const of = (states: Lot["state"][]) => lots.filter(lot => states.includes(lot.state)).map(lotRow);
  const kpis = [
    { label: "الأصناف", value: n(balances.length), note: `${lots.length} تشغيلة` },
    { label: "قيمة المخزون", value: money(lots.reduce((total, lot) => total + lot.qty * lot.cost, 0)) },
    { label: "صالح", value: n(parts[0].qty), note: money(parts[0].value), tone: "good" as const },
    { label: "قريب الانتهاء", value: n(parts[1].qty), note: money(parts[1].value), tone: "warn" as const },
    { label: "منتهي", value: n(parts[2].qty), note: money(parts[2].value), tone: "bad" as const },
    { label: "تالف", value: n(parts[3].qty), note: money(parts[3].value), tone: "bad" as const },
  ];
  const defs: Record<View, Def> = {
    balances: { kpis, rows: balances, cols: balanceCols, tabKey: "status", action: "تحويل مخزني", hint: "اضغط أي صنف لعرض تشغيلاته وتواريخ صلاحيتها في هذا المستودع" },
    lots: { kpis, rows: lots.map(lotRow), cols: lotCols, tabKey: "state", action: "استلام تشغيلة" },
    near: { kpis, rows: of(["قريب الانتهاء"]), cols: lotCols, tabKey: "category", action: "عرض ترويجي للتصريف", hint: "تشغيلات تقترب من نهاية صلاحيتها ويفضل تصريفها أولًا" },
    expired: { kpis, rows: of(["منتهي"]), cols: [...lotCols.slice(0, 9), ["reason", "السبب"], ["state", "الحالة", "status"]], tabKey: "category", action: "أمر إتلاف" },
    damaged: { kpis, rows: of(["تالف"]), cols: [...lotCols.slice(0, 5), ["reason", "سبب التلف"], ["value", "القيمة", "money"], ["state", "الحالة", "status"]], tabKey: "reason", action: "أمر إتلاف" },
    moves: { kpis, rows: d.movements.filter(row => row.warehouse === warehouse.id), cols: moveCols, tabKey: "kind", action: "حركة مخزنية" },
  };
  const labels: [View, string, number][] = [["balances", "أرصدة الأصناف", balances.length], ["lots", "التشغيلات والصلاحية", lots.length], ["near", "قريب الانتهاء", parts[1].lots], ["expired", "منتهي الصلاحية", parts[2].lots], ["damaged", "التالف", parts[3].lots], ["moves", "حركات المستودع", defs.moves.rows.length]];
  if (item) return d.products.some(product => product.name === item.item)
    ? <ItemPage name={String(item.item)} back={() => setItem(null)} backLabel={`العودة إلى ${warehouse.name}`} />
    : <RecordPage row={item} cols={balanceCols} title={warehouse.name} back={() => setItem(null)} />;
  return <>
    <button type="button" className={s.back} onClick={back}><ArrowRight size={16} aria-hidden="true" />كل المستودعات</button>
    <section className={s.whHero}>
      <div><h2>{warehouse.name}</h2><p>{warehouse.kind} · {warehouse.city}</p></div>
      <dl><div><dt>أمين المستودع</dt><dd>{warehouse.manager}</dd></div><div><dt>درجة الحرارة</dt><dd>{warehouse.temperature}</dd></div><div><dt>الإشغال</dt><dd><bdi>{warehouse.capacity}%</bdi></dd></div></dl>
    </section>
    <section className={s.panel} style={{ marginBottom: 20 }}><div className={s.panelBody}><Health lots={lots} /></div></section>
    <div className={s.chips} role="tablist" aria-label="أقسام المستودع" style={{ marginBottom: 18 }}>{labels.map(([id, label, total]) => <button type="button" role="tab" key={id} aria-selected={view === id} aria-pressed={view === id} onClick={() => setView(id)}>{label} <bdi>{total}</bdi></button>)}</div>
    {view === "balances" ? <BalanceRegister def={defs.balances} onOpen={setItem} /> : <Register key={view} def={defs[view]} title={labels.find(([id]) => id === view)![1]} />}
  </>;
}

/** Balances open a per-item lot breakdown instead of the generic record drawer. */
function BalanceRegister({ def, onOpen }: { def: Def; onOpen: (row: Row) => void }) {
  const [tab, setTab] = useState("");
  const tabs = [...new Set(def.rows.map(row => String(row.status)))];
  const rows = def.rows.filter(row => !tab || row.status === tab);
  return <>
    <Kpis items={def.kpis} />
    <section className={s.panel}>
      <div className={s.tabs} role="tablist" aria-label="تصفية الأرصدة"><button type="button" role="tab" aria-selected={!tab} className={!tab ? s.tabOn : ""} onClick={() => setTab("")}>الكل<b>{def.rows.length}</b></button>{tabs.map(value => <button type="button" role="tab" key={value} aria-selected={tab === value} className={tab === value ? s.tabOn : ""} onClick={() => setTab(value)}>{value}<b>{def.rows.filter(row => row.status === value).length}</b></button>)}</div>
      {def.hint && <p className={s.hint}>{def.hint}</p>}
      <div className={s.tableWrap}><table className={s.table}><thead><tr>{def.cols.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} tabIndex={0} className={s.rowLink} onClick={() => onOpen(row)} onKeyDown={event => { if (event.key === "Enter") onOpen(row); }}>{def.cols.map(col => <td key={col[0]}>{cell(row, col)}</td>)}</tr>)}</tbody></table></div>
    </section>
  </>;
}
