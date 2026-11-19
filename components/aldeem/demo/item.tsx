"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { money } from "./data";
import { Badge, Kpis, Thumb, Trace } from "./kit";
import { useDemo } from "./store";
import s from "./demo.module.css";

const n = (value: number) => Math.round(value).toLocaleString("en-US");
type Bar = { label: string; value: number; text: string; alt?: boolean };
function Bars({ items }: { items: Bar[] }) {
  const peak = Math.max(1, ...items.map(item => item.value));
  return <div className={s.bars}>{items.map(item => <div className={s.barRow} key={item.label}><span>{item.label}</span><div className={s.track}><span className={`${s.fill} ${item.alt ? s.fillAlt : ""}`} style={{ width: `${Math.max(3, Math.round(item.value / peak * 100))}%` }} /></div><bdi className={s.num}>{item.text}</bdi></div>)}</div>;
}
const TABS = [["sales", "أين بيع"], ["how", "كيف بيع"], ["stock", "أين خُزن"], ["turn", "مدة الدوران"], ["prices", "أسعار الفروع"], ["trace", "تتبع الصنف"]] as const;

/** Item record: where it sold, how it sold, where it is stored, how fast it turns and where each batch went. */
export function ItemPage({ name, back, backLabel }: { name: string; back: () => void; backLabel: string }) {
  const { d, prices } = useDemo();
  const [tab, setTab] = useState<typeof TABS[number][0]>("sales");
  const index = Math.max(0, d.products.findIndex(product => product.name === name));
  const p = d.products[index];
  // Deterministic figures per item so the record reads the same every time it is opened.
  const rnd = (k: number) => { const x = Math.sin((index + 1) * 97.13 + k * 13.7) * 43758.5453; return x - Math.floor(x); };
  const lots = d.lots.filter(lot => lot.item === p.name);
  const sellable = lots.filter(lot => lot.state === "صالح" || lot.state === "قريب الانتهاء").reduce((total, lot) => total + lot.qty, 0);
  const shelves = d.branches.reduce((total, branch) => total + (d.branchStock[branch.name]?.[p.sku] ?? 0), 0);
  const daily = p.sold / 30;
  const cover = (sellable + shelves) / Math.max(0.1, daily);
  const weights = d.branches.map((_, i) => 0.5 + rnd(i));
  const weightSum = weights.reduce((total, weight) => total + weight, 0);
  const own = d.branches.map((branch, i) => ({ branch: branch.name, units: Math.round(p.sold * 0.82 * weights[i] / weightSum) }));
  const partners = d.partners.slice(0, 3).map((partner, i) => ({ name: String(partner.name), units: Math.round(p.sold * [0.06, 0.04, 0.02][i]) }));
  const events = Math.round(p.sold * 0.06);
  const posUnits = own.reduce((total, item) => total + item.units, 0);
  const companions = [1, 2, 3].map(step => d.products[(index + step * 5) % d.products.length]);
  const recent = Array.from({ length: 10 }, (_, i) => { const invoice = d.invoices[(index * 7 + i * 5) % d.invoices.length]; return { no: String(invoice.no), date: String(invoice.date), branch: String(invoice.branch), cashier: String(invoice.cashier), method: String(invoice.method), qty: 1 + Math.floor(rnd(40 + i) * 5), price: prices[String(invoice.branch)]?.[p.sku] ?? p.price }; });
  const months = Array.from({ length: 6 }, (_, i) => ({ label: d.day(-(5 - i) * 30).slice(0, 7), value: Math.round(p.sold * (0.72 + rnd(60 + i) * 0.4)) }));
  months[5].value = p.sold;
  const batch = d.batches.find(item => item.product === p.name);
  const batchCode = batch ? String(batch.batch) : lots[0]?.code ?? "LOT";
  const produced = lots[0]?.produced ?? d.day(-2);
  const turnover = Math.max(1, Math.round(Math.min(p.shelf * 0.7, cover * 0.55 + 1)));
  return <>
    <button type="button" className={s.back} onClick={back}><ArrowRight size={16} aria-hidden="true" />{backLabel}</button>
    <section className={s.whHero}>
      <Thumb name={p.name} size={96} />
      <div style={{ flex: 1 }}><p>{p.category} · يباع بوحدة {p.unit}</p><h2>{p.name}</h2><p style={{ marginTop: 6 }}>رقم الصنف <bdi>{p.sku}</bdi> · الباركود <bdi>{p.barcode}</bdi></p></div>
      <dl><div><dt>سعر البيع الأساسي</dt><dd><bdi>{money(p.price)}</bdi></dd></div><div><dt>التكلفة</dt><dd><bdi>{money(p.cost)}</bdi></dd></div><div><dt>الهامش</dt><dd><bdi>{Math.round((p.price - p.cost) / p.price * 100)}%</bdi></dd></div><div><dt>مدة الصلاحية</dt><dd><bdi>{p.shelf}</bdi> يوم</dd></div></dl>
    </section>
    <Kpis items={[
      { label: "مباع هذا الشهر", value: `${n(p.sold)} ${p.unit}`, note: `بمعدل ${daily.toFixed(1)} يوميًا` },
      { label: "إيراد الشهر", value: money(p.sold * p.price), tone: "good" },
      { label: "المتاح للبيع", value: n(sellable + shelves), note: `${n(sellable)} في المستودعات و ${n(shelves)} في الفروع` },
      { label: "مدة الدوران", value: `${turnover} يوم`, note: "من الإنتاج حتى البيع", tone: turnover > p.shelf * 0.6 ? "warn" : "good" },
      { label: "تغطية المخزون", value: `${Math.round(cover)} يوم`, tone: cover < 3 ? "bad" : cover > p.shelf ? "warn" : "good", note: cover < 3 ? "يحتاج إنتاجًا عاجلًا" : cover > p.shelf ? "أكثر من مدة الصلاحية" : "ضمن الحد الآمن" },
      { label: "تالف ومنتهي", value: n(lots.filter(lot => lot.state === "تالف" || lot.state === "منتهي").reduce((total, lot) => total + lot.qty, 0)), tone: "bad" },
    ]} />
    <div className={s.chips} role="tablist" aria-label="سجل الصنف" style={{ marginBottom: 18 }}>{TABS.map(([id, label]) => <button type="button" role="tab" key={id} aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>

    {tab === "sales" && <><div className={s.grid2}>
      <section className={s.panel}><div className={s.panelHead}><h2>المبيعات حسب الفرع</h2><span>وحدات هذا الشهر</span></div><div className={s.panelBody}><Bars items={own.map(item => ({ label: item.branch, value: item.units, text: `${n(item.units)} ${p.unit}` }))} /></div></section>
      <section className={s.panel}><div className={s.panelHead}><h2>المبيعات حسب القناة</h2><span>فروعنا والفرنشايز والمناسبات</span></div><div className={s.panelBody}><Bars items={[{ label: "نقاط بيع فروعنا", value: posUnits, text: n(posUnits) }, ...partners.map(partner => ({ label: partner.name, value: partner.units, text: n(partner.units), alt: true })), { label: "مناسبات وشركات", value: events, text: n(events) }]} /><p className={s.note}>اللون البرتقالي مبيعات شركاء الفرنشايز والبنفسجي مبيعات فروع الديم</p></div></section>
    </div>
    <section className={s.panel} style={{ marginTop: 20 }}><div className={s.panelHead}><h2>آخر عمليات البيع</h2><span>كل عملية برقم فاتورتها وفرعها وكاشيرها</span></div><div className={s.tableWrap}><table className={s.table}><thead><tr><th>الفاتورة</th><th>التاريخ</th><th>الفرع</th><th>الكاشير</th><th>الكمية</th><th>سعر البيع</th><th>طريقة الدفع</th></tr></thead><tbody>{recent.map((sale, i) => <tr key={i}><td><bdi className={s.code}>{sale.no}</bdi></td><td><bdi className={s.num}>{sale.date}</bdi></td><td>{sale.branch}</td><td>{sale.cashier}</td><td><bdi className={s.num}>{sale.qty}</bdi> {p.unit}</td><td><bdi className={s.num}>{money(sale.price)}</bdi></td><td>{sale.method}</td></tr>)}</tbody></table></div></section></>}

    {tab === "how" && <div className={s.grid2}>
      <section className={s.panel}><div className={s.panelHead}><h2>طريقة الدفع</h2></div><div className={s.panelBody}><Bars items={[["مدى", 46], ["Apple Pay", 21], ["نقدي", 17], ["فيزا", 11], ["آجل", 5]].map(([label, share]) => ({ label: String(label), value: Number(share), text: `${share}%` }))} /></div></section>
      <section className={s.panel}><div className={s.panelHead}><h2>وقت البيع</h2><span>متى يطلبه العملاء</span></div><div className={s.panelBody}><Bars items={[["الصباح 6 إلى 12", 12 + Math.round(rnd(20) * 10)], ["الظهيرة 12 إلى 4", 18 + Math.round(rnd(21) * 10)], ["المساء 4 إلى 9", 38 + Math.round(rnd(22) * 10)], ["الليل 9 إلى 1", 14 + Math.round(rnd(23) * 8)]].map(([label, share]) => ({ label: String(label), value: Number(share), text: `${share}%` }))} /></div></section>
      <section className={s.panel}><div className={s.panelHead}><h2>يباع غالبًا مع</h2><span>أصناف تظهر معه في نفس الفاتورة</span></div><div className={s.panelBody}><Bars items={companions.map((other, i) => ({ label: other.name, value: 34 - i * 9, text: `${34 - i * 9}% من فواتيره` }))} /></div></section>
      <section className={s.panel}><div className={s.panelHead}><h2>طبيعة البيع</h2></div><div className={s.panelBody}><dl className={s.fields}><div><dt>متوسط الكمية في الفاتورة</dt><dd><bdi>{(1.4 + rnd(30) * 2).toFixed(1)}</bdi> {p.unit}</dd></div><div><dt>بيع بسعر مخفض</dt><dd><bdi>{Math.round(4 + rnd(31) * 9)}%</bdi></dd></div><div><dt>بيع مع استبدال نقاط</dt><dd><bdi>{Math.round(6 + rnd(32) * 10)}%</bdi></dd></div><div><dt>نسبة المرتجع</dt><dd><bdi>{(0.4 + rnd(33) * 1.6).toFixed(1)}%</bdi></dd></div><div><dt>عملاء مسجلون في الولاء</dt><dd><bdi>{Math.round(52 + rnd(34) * 30)}%</bdi></dd></div><div><dt>أفضل يوم بيع</dt><dd>{["الخميس", "الجمعة", "السبت"][index % 3]}</dd></div></dl></div></section>
    </div>}

    {tab === "stock" && <><section className={s.panel}><div className={s.panelHead}><h2>تشغيلات الصنف في المستودعات</h2><span>كل تشغيلة بتاريخ إنتاجها وانتهائها وحالتها</span></div><div className={s.tableWrap}><table className={s.table}><thead><tr><th>المستودع</th><th>التشغيلة</th><th>الكمية</th><th>الإنتاج</th><th>الانتهاء</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>{lots.map(lot => <tr key={lot.id}><td><strong>{d.warehouses.find(w => w.id === lot.warehouse)?.name}</strong></td><td><bdi className={s.code}>{lot.code}</bdi></td><td><bdi className={s.num}>{lot.qty}</bdi> {lot.unit}</td><td><bdi className={s.num}>{lot.produced}</bdi></td><td><bdi className={s.num}>{lot.expiry}</bdi></td><td>{lot.daysLeft < 0 ? `منتهي منذ ${-lot.daysLeft} يوم` : `${lot.daysLeft} يوم`}</td><td><Badge>{lot.state}</Badge></td></tr>)}</tbody></table></div></section>
    <section className={s.panel} style={{ marginTop: 20 }}><div className={s.panelHead}><h2>رصيد الصنف في مخازن الفروع</h2><span>الكمية المعروضة للبيع في كل فرع</span></div><div className={s.panelBody}><Bars items={d.branches.map(branch => ({ label: branch.name, value: d.branchStock[branch.name]?.[p.sku] ?? 0, text: `${d.branchStock[branch.name]?.[p.sku] ?? 0} ${p.unit}` }))} /></div></section></>}

    {tab === "turn" && <div className={s.grid2}>
      <section className={s.panel}><div className={s.panelHead}><h2>دوران الصنف في كل فرع</h2><span>كم يومًا يكفي رصيد الفرع</span></div><div className={s.panelBody}><Bars items={own.map(item => { const days = (d.branchStock[item.branch]?.[p.sku] ?? 0) / Math.max(0.1, item.units / 30); return { label: item.branch, value: days, text: `${days.toFixed(1)} يوم` }; })} /><p className={s.note}>الفرع الذي تتجاوز تغطيته مدة الصلاحية <bdi>{p.shelf}</bdi> يوم يحتاج تحويل جزء من رصيده لفرع أسرع بيعًا</p></div></section>
      <section className={s.panel}><div className={s.panelHead}><h2>اتجاه المبيعات</h2><span>آخر 6 أشهر</span></div><div className={s.panelBody}><div className={s.chart} role="img" aria-label="مبيعات الصنف لآخر 6 أشهر">{months.map((month, i) => <div className={s.col} key={month.label} title={`${month.label} ${n(month.value)}`}><i style={{ height: `${Math.round(month.value / Math.max(...months.map(item => item.value)) * 100)}%`, animationDelay: `${i * 40}ms` }} /><small><bdi>{month.label.slice(5)}</bdi></small></div>)}</div></div></section>
      <section className={s.panel}><div className={s.panelHead}><h2>مؤشرات الدوران</h2></div><div className={s.panelBody}><dl className={s.fields}><div><dt>متوسط البقاء في المستودع</dt><dd><bdi>{Math.max(1, Math.round(turnover * 0.45))}</bdi> يوم</dd></div><div><dt>متوسط البقاء في الفرع</dt><dd><bdi>{Math.max(1, Math.round(turnover * 0.55))}</bdi> يوم</dd></div><div><dt>معدل الدوران الشهري</dt><dd><bdi>{(30 / turnover).toFixed(1)}</bdi> مرة</dd></div><div><dt>الالتزام بصرف الأقرب انتهاءً</dt><dd><bdi>{Math.round(91 + rnd(50) * 8)}%</bdi></dd></div><div><dt>هدر الصنف من إنتاجه</dt><dd><bdi>{(0.8 + rnd(51) * 2.4).toFixed(1)}%</bdi></dd></div><div><dt>توصية الإنتاج القادم</dt><dd><bdi>{n(Math.max(0, daily * 7 - sellable))}</bdi> {p.unit}</dd></div></dl></div></section>
    </div>}

    {tab === "prices" && <section className={s.panel}><div className={s.panelHead}><h2>سعر الصنف في كل فرع</h2><span>نفس الباركود <bdi>{p.barcode}</bdi> وسعر يحدده كل فرع</span></div><div className={s.tableWrap}><table className={s.table}><thead><tr><th>الفرع</th><th>المدينة</th><th>سعر الفرع</th><th>الفرق عن الأساسي</th><th>الهامش</th><th>رصيد الفرع</th></tr></thead><tbody>{d.branches.map(branch => { const price = prices[branch.name]?.[p.sku] ?? p.price; const diff = Math.round((price - p.price) / p.price * 100); return <tr key={branch.id}><td><strong>{branch.name}</strong></td><td>{branch.city}</td><td><bdi className={s.num}>{money(price)}</bdi></td><td><Badge>{diff === 0 ? "السعر الأساسي" : `${diff > 0 ? "+" : ""}${diff}%`}</Badge></td><td><bdi className={s.num}>{Math.round((price - p.cost) / price * 100)}%</bdi></td><td><bdi className={s.num}>{d.branchStock[branch.name]?.[p.sku] ?? 0}</bdi> {p.unit}</td></tr>; })}</tbody></table></div><p className={s.hint}>تعديل السعر يتم من نقاط البيع ثم إدارة الأسعار لكل نقطة ويظهر هنا مباشرة</p></section>}

    {tab === "trace" && <div className={s.grid2}>
      <section className={s.panel}><div className={s.panelHead}><h2>رحلة آخر تشغيلة</h2><span><bdi>{batchCode}</bdi></span></div><div className={s.panelBody}><Trace steps={[
        { title: "استلام المواد الخام وفحصها", meta: `${d.day(-Math.min(p.shelf, 4))} · مستودع المواد الخام` },
        { title: "التصنيع في المصنع المركزي", meta: `${produced} · ${batch ? String(batch.product) : p.name}` },
        { title: "فحص الجودة والإفراج عن التشغيلة", meta: `${produced} · مركز الجودة` },
        { title: "الاستلام في المستودع الرئيسي", meta: `${produced} · ${n(sellable)} ${p.unit}` },
        { title: "التحويل إلى مخازن الفروع", meta: `${d.day(0)} · ${d.branches.length} فروع` },
        { title: "البيع للعملاء", meta: `${n(p.sold)} ${p.unit} هذا الشهر`, done: true },
      ]} /></div></section>
      <section className={s.panel}><div className={s.panelHead}><h2>أين ذهبت الكمية المنتجة</h2><span>توزيع إنتاج الشهر</span></div><div className={s.panelBody}><Bars items={[{ label: "بيعت في فروعنا", value: posUnits, text: n(posUnits) }, { label: "بيعت عند الفرنشايز", value: partners.reduce((total, partner) => total + partner.units, 0), text: n(partners.reduce((total, partner) => total + partner.units, 0)), alt: true }, { label: "مناسبات وشركات", value: events, text: n(events) }, { label: "باقية في المستودعات", value: sellable, text: n(sellable) }, { label: "باقية في الفروع", value: shelves, text: n(shelves) }]} /></div></section>
    </div>}
  </>;
}
