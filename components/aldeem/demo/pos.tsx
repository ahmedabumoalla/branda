"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Monitor, Search, Store } from "lucide-react";
import { money, sum, type Row } from "./data";
import { Badge, Kpis, Register, useToast } from "./kit";
import { useDemo } from "./store";
import { Cashier } from "./cashier";
import s from "./demo.module.css";
import x from "./pospoints.module.css";

const n = (value: number) => value.toLocaleString("en-US");
const pct = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;

/** One editable branch price: the same barcode keeps its own price in every branch. */
function PriceInput({ branch, sku, name, base }: { branch: string; sku: string; name: string; base: number }) {
  const { prices, setPrice } = useDemo();
  const toast = useToast();
  const current = prices[branch]?.[sku] ?? base;
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);
  const commit = () => {
    if (draft === null) return;
    const value = Math.round(Number(draft) * 100) / 100;
    setDraft(null);
    if (!Number.isFinite(value) || value <= 0 || value === current) return;
    setPrice(branch, sku, value); setSaved(count => count + 1);
    toast(`حُفظ سعر ${name} في ${branch} بمبلغ ${value} ر.س`);
  };
  const diff = (current - base) / base * 100;
  return <span className={x.cellPrice}>
    <input key={saved} type="text" inputMode="decimal" dir="ltr" aria-label={`سعر ${name} في ${branch}`} className={`${x.price} ${current !== base ? x.priceSpecial : ""} ${saved ? x.saved : ""}`} value={draft ?? String(current)} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setDraft(null); }} />
    <bdi className={`${x.diff} ${diff > 0 ? x.up : diff < 0 ? x.down : x.same}`}>{diff === 0 ? "السعر الأساسي" : pct(diff)}</bdi>
  </span>;
}

function Filters({ query, setQuery, category, setCategory, categories }: { query: string; setQuery: (value: string) => void; category: string; setCategory: (value: string) => void; categories: string[] }) {
  return <>
    <div className={x.filters}><label className={`${s.search} ${x.grow}`}><Search size={16} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث بالاسم أو رقم الصنف أو الباركود" aria-label="بحث في الأصناف" /></label></div>
    <div className={`${s.chips} ${x.chipsRow}`} role="group" aria-label="تصنيف الأصناف"><button type="button" aria-pressed={!category} onClick={() => setCategory("")}>كل التصنيفات</button>{categories.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
  </>;
}

function useProductFilter() {
  const { d } = useDemo();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const categories = useMemo(() => [...new Set(d.products.map(product => product.category))], [d]);
  const products = useMemo(() => { const needle = query.trim().toLowerCase(); return d.products.filter(product => (!category || product.category === category) && (!needle || product.name.toLowerCase().includes(needle) || product.sku.toLowerCase().includes(needle) || product.barcode.includes(needle))); }, [d, query, category]);
  return { query, setQuery, category, setCategory, categories, products };
}

function PriceLog({ branch }: { branch?: string }) {
  const { activity } = useDemo();
  const changes = activity.filter(item => item.text.startsWith("تعديل سعر") && (!branch || item.text.includes(branch)));
  return changes.length ? <ul className={x.log}>{changes.slice(0, 8).map((item, index) => <li key={`${item.at}-${index}`}><bdi>{item.at}</bdi><span>{item.text}</span></li>)}</ul> : <p className={x.emptyLog}>لم يُعدّل أي سعر في هذه الجلسة وكل تعديل تحفظه يظهر هنا بوقته</p>;
}

function PosPage({ point, back }: { point: Row; back: () => void }) {
  const { d, prices, go } = useDemo();
  const [cashier, setCashier] = useState(false);
  const filter = useProductFilter();
  const branch = String(point.branch);
  const stock = d.branchStock[branch] ?? {};
  const branchPrices = prices[branch] ?? {};
  const invoices = d.invoices.filter(row => row.branch === branch).slice(0, 8);
  const siblings = d.posPoints.filter(row => row.branch === branch);
  const special = d.products.filter(product => (branchPrices[product.sku] ?? product.price) !== product.price).length;
  const low = d.products.filter(product => { const qty = stock[product.sku] ?? 0; return qty > 0 && qty < 10; }).length;
  const out = d.products.filter(product => (stock[product.sku] ?? 0) === 0).length;
  const value = d.products.reduce((total, product) => total + (stock[product.sku] ?? 0) * (branchPrices[product.sku] ?? product.price), 0);
  const working = point.status === "تعمل الآن";
  return <>
    <button type="button" className={s.back} onClick={back}><ArrowRight size={16} aria-hidden="true" />كل نقاط البيع</button>
    <section className={s.whHero}>
      <div><h2>{branch} · {String(point.name)}</h2><p><bdi>{String(point.code)}</bdi> · {String(point.city)} · {String(point.device)}</p></div>
      <dl><div><dt>مخزن الصرف</dt><dd>{String(point.warehouse)}</dd></div><div><dt>آخر مزامنة</dt><dd>{String(point.lastSync)}</dd></div><div><dt>الحالة</dt><dd>{String(point.status)}</dd></div><div><dt>نقاط الفرع</dt><dd><bdi>{siblings.length}</bdi></dd></div></dl>
    </section>
    <div className={s.actions}><button type="button" className={s.primary} onClick={() => setCashier(true)}>فتح الكاشير</button></div>
    {cashier && <Cashier point={point} onClose={() => setCashier(false)} />}
    <Kpis items={[
      { label: "مبيعات اليوم", value: money(Number(point.today)), note: `${n(Number(point.invoices))} فاتورة`, tone: working ? "good" : undefined },
      { label: "أصناف المخزن", value: n(d.products.length), note: `${n(d.products.length - out)} صنف متاح للبيع` },
      { label: "قيمة المخزون بسعر الفرع", value: money(value) },
      { label: "أسعار خاصة بالفرع", value: n(special), tone: special ? "warn" : undefined },
      { label: "أصناف منخفضة", value: n(low), tone: low ? "warn" : undefined },
      { label: "أصناف نافدة", value: n(out), tone: out ? "bad" : undefined },
    ]} />
    <section className={s.panel}>
      <div className={s.panelHead}><h2>سجل أصناف {String(point.warehouse)} وأسعار البيع</h2><span><bdi>{filter.products.length}</bdi> صنف</span></div>
      <p className={s.hint}>الصنف يباع بالباركود نفسه في كل الفروع وسعره هنا خاص بهذا الفرع وكل نقاط بيع {branch} تصرف من المخزن نفسه وتبيع بالسعر نفسه</p>
      <Filters {...filter} />
      <div className={s.tableWrap}><table className={s.table}>
        <thead><tr><th>الباركود</th><th>رقم الصنف</th><th>الصنف</th><th>التصنيف</th><th>الوحدة</th><th>رصيد الفرع</th><th>السعر الأساسي</th><th>سعر الفرع</th><th>هامش الربح</th><th>الحالة</th></tr></thead>
        <tbody>{filter.products.map(product => { const qty = stock[product.sku] ?? 0; const price = branchPrices[product.sku] ?? product.price; return <tr key={product.id}>
          <td><bdi className={s.code}>{product.barcode}</bdi></td><td><bdi className={s.code}>{product.sku}</bdi></td><td><strong>{product.name}</strong></td><td>{product.category}</td><td>{product.unit}</td>
          <td><bdi className={s.num}>{n(qty)}</bdi></td><td><bdi className={s.num}>{money(product.price)}</bdi></td>
          <td><PriceInput branch={branch} sku={product.sku} name={product.name} base={product.price} /></td>
          <td><bdi className={s.num}>{Math.round((price - product.cost) / price * 100)}%</bdi></td>
          <td><span className={`${s.badge} ${qty === 0 ? s.bad : qty < 10 ? s.warn : s.good}`}>{qty === 0 ? "نافد" : qty < 10 ? "منخفض" : "متاح"}</span></td>
        </tr>; })}</tbody>
      </table>{filter.products.length === 0 && <p className={s.empty}>لا توجد أصناف مطابقة للبحث</p>}</div>
    </section>
    <div className={x.two}>
      <section className={s.panel}><div className={s.panelHead}><h2>آخر فواتير {branch}</h2><button type="button" className={s.ghost} onClick={() => go("sales-invoices")}>كل الفواتير</button></div>
        <div className={s.tableWrap}><table className={s.table}><thead><tr><th>الفاتورة</th><th>التاريخ</th><th>العميل</th><th>الدفع</th><th>الإجمالي</th><th>الحالة</th></tr></thead><tbody>{invoices.map(row => <tr key={row.id}><td><bdi className={s.code}>{String(row.no)}</bdi></td><td><bdi className={s.num}>{String(row.date)}</bdi></td><td>{String(row.customer)}</td><td>{String(row.method)}</td><td><bdi className={s.num}>{money(Number(row.total))}</bdi></td><td><Badge>{String(row.status)}</Badge></td></tr>)}</tbody></table>{invoices.length === 0 && <p className={s.empty}>لا توجد فواتير لهذا الفرع</p>}</div>
      </section>
      <section className={s.panel}><div className={s.panelHead}><h2>سجل تعديل الأسعار</h2><span>هذه الجلسة</span></div><div className={s.panelBody}><PriceLog branch={branch} /></div></section>
    </div>
  </>;
}

function PosPoints() {
  const { d, prices } = useDemo();
  const [openId, setOpenId] = useState("");
  const point = d.posPoints.find(row => row.id === openId);
  if (point) return <PosPage point={point} back={() => setOpenId("")} />;
  const working = d.posPoints.filter(row => row.status === "تعمل الآن").length;
  return <>
    <Kpis items={[
      { label: "نقاط البيع", value: n(d.posPoints.length), note: `في ${n(d.branches.length)} فروع` },
      { label: "تعمل الآن", value: n(working), tone: "good" },
      { label: "متوقفة", value: n(d.posPoints.length - working), tone: d.posPoints.length - working ? "bad" : undefined },
      { label: "مبيعات اليوم", value: money(sum(d.posPoints, "today")) },
      { label: "فواتير اليوم", value: n(sum(d.posPoints, "invoices")) },
    ]} />
    <p className={s.note} style={{ margin: "0 0 18px" }}>افتح أي نقطة بيع لعرض سجل أصناف مخزن فرعها كاملًا وتحديد سعر كل صنف في ذلك الفرع</p>
    <div className={s.whGrid}>{d.posPoints.map(row => { const branch = String(row.branch); const on = row.status === "تعمل الآن"; const stock = d.branchStock[branch] ?? {}; const special = d.products.filter(product => (prices[branch]?.[product.sku] ?? product.price) !== product.price).length; return <button type="button" key={row.id} className={s.whCard} onClick={() => setOpenId(row.id)} aria-label={`فتح ${branch} ${String(row.name)}`}>
      <div className={s.whTop}><span className={s.whIcon}><Monitor size={22} aria-hidden="true" /></span><div><strong>{branch} · {String(row.name)}</strong><small><bdi>{String(row.code)}</bdi> · {String(row.city)}</small></div></div>
      <span className={`${x.posStatus} ${on ? x.live : x.posOff}`}>{String(row.status)} · آخر مزامنة {String(row.lastSync)}</span>
      <div className={s.whMeta}>
        <div><span>مبيعات اليوم</span><b className={x.big}><bdi>{money(Number(row.today))}</bdi></b></div>
        <div><span>الفواتير</span><b className={x.big}><bdi>{n(Number(row.invoices))}</bdi></b></div>
        <div><span>مخزن الصرف</span><b>{String(row.warehouse)}</b></div>
        <div><span>الجهاز</span><b>{String(row.device)}</b></div>
        <div><span>أصناف متاحة</span><b><bdi>{n(d.products.filter(product => (stock[product.sku] ?? 0) > 0).length)}</bdi></b></div>
        <div><span>أسعار خاصة</span><b><bdi>{n(special)}</bdi></b></div>
      </div>
    </button>; })}</div>
  </>;
}

function PriceMatrix() {
  const { d, prices } = useDemo();
  const filter = useProductFilter();
  const price = (branch: string, sku: string, base: number) => prices[branch]?.[sku] ?? base;
  const special = d.branches.reduce((total, branch) => total + d.products.filter(product => price(branch.name, product.sku, product.price) !== product.price).length, 0);
  const levels = d.branches.map(branch => ({ name: branch.name, level: d.products.reduce((total, product) => total + price(branch.name, product.sku, product.price) / product.price, 0) / d.products.length })).sort((a, b) => b.level - a.level);
  return <>
    <Kpis items={[
      { label: "الأصناف المسعرة", value: n(d.products.length), note: `في ${n(d.branches.length)} فروع` },
      { label: "أسعار خاصة بالفروع", value: n(special), tone: "warn" },
      { label: "الفرع الأعلى سعرًا", value: levels[0].name, note: `${pct((levels[0].level - 1) * 100)} عن الأساسي` },
      { label: "الفرع الأقل سعرًا", value: levels[levels.length - 1].name, note: `${pct((levels[levels.length - 1].level - 1) * 100)} عن الأساسي` },
    ]} />
    <section className={s.panel}>
      <div className={s.panelHead}><h2>سعر كل صنف في كل فرع</h2><span><bdi>{filter.products.length}</bdi> صنف</span></div>
      <p className={s.hint}>الباركود واحد في كل الفروع والسعر يتغير حسب الفرع وعدّل أي خانة ثم اضغط Enter ليحفظ السعر ويسجل في سجل التعديلات</p>
      <Filters {...filter} />
      <div className={s.tableWrap}><table className={`${s.table} ${x.sticky}`}>
        <thead><tr><th>الصنف</th><th>الباركود</th><th>السعر الأساسي</th>{d.branches.map(branch => <th key={branch.id}><Store size={13} aria-hidden="true" /> {branch.name}</th>)}</tr></thead>
        <tbody>{filter.products.map(product => <tr key={product.id}>
          <td><strong>{product.name}</strong><br /><bdi className={s.code}>{product.sku}</bdi></td><td><bdi className={s.code}>{product.barcode}</bdi></td><td><bdi className={s.num}>{money(product.price)}</bdi></td>
          {d.branches.map(branch => <td key={branch.id}><PriceInput branch={branch.name} sku={product.sku} name={product.name} base={product.price} /></td>)}
        </tr>)}</tbody>
      </table>{filter.products.length === 0 && <p className={s.empty}>لا توجد أصناف مطابقة للبحث</p>}</div>
    </section>
    <section className={s.panel}><div className={s.panelHead}><h2>سجل تعديل الأسعار</h2><span>هذه الجلسة</span></div><div className={s.panelBody}><PriceLog /></div></section>
  </>;
}

/** POS pages of the presentation: points with their branch stock, the branch price matrix and open shifts. */
export function DemoPos({ section }: { section: string }) {
  const { d } = useDemo();
  if (section === "pos-price-management") return <PriceMatrix />;
  if (section === "pos-active-shifts") return <Register title="الورديات النشطة" def={{
    kpis: [{ label: "ورديات مفتوحة", value: n(d.shifts.length), tone: "good" }, { label: "مبيعات الورديات", value: money(sum(d.shifts, "sales")) }, { label: "نقد في الأدراج", value: money(sum(d.shifts, "cash") + sum(d.shifts, "openingCash")) }, { label: "شبكة وبطاقات", value: money(sum(d.shifts, "card")) }],
    rows: d.shifts,
    cols: [["no", "رقم الوردية", "code"], ["cashier", "الكاشير", "strong"], ["point", "نقطة البيع"], ["opened", "وقت الفتح", "date"], ["openingCash", "رصيد الافتتاح", "money"], ["sales", "المبيعات", "money"], ["cash", "نقدي", "money"], ["card", "شبكة", "money"], ["invoices", "الفواتير", "num"], ["returns", "مرتجعات", "num"], ["status", "الحالة", "status"]],
  }} />;
  return <PosPoints />;
}
