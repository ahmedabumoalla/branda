"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ClipboardList, Factory, Minus, PackageCheck, Plus, ReceiptText, Search, Send, Store } from "lucide-react";
import { money, type WLine, type WOrder, type WStatus } from "./data";
import { Kpis, useToast, Thumb } from "./kit";
import { FullScreen, orderTotal, useDemo } from "./store";
import s from "./demo.module.css";
import w from "./workshop.module.css";

const FLOW: WStatus[] = ["جديد", "قيد التجهيز", "تم التسليم للفرع", "مستلم في الفرع", "صدرت الفاتورة"];
const STEPS = ["رفع الطلب", "استلام المعمل والتجهيز", "التسليم للفرع", "استلام الفرع", "إصدار الفاتورة"];
const TRACE = ["رفع موظف الفرع الطلب", "استلم المعمل الطلب وبدأ التجهيز", "سلّم المعمل الطلب للفرع", "استلم الفرع الأصناف", "أصدر الفرع فاتورة الطلب"];
type Mode = "employee" | "workshop" | "branch";
const n = (value: number) => value.toLocaleString("en-US");
const units = (order: WOrder) => order.lines.reduce((sum, line) => sum + line.qty, 0);

/** Seeded orders carry one log line, so earlier steps are rebuilt from the status; steps done in this session keep their clock time. */
function traceOf(order: WOrder) {
  const reached = FLOW.indexOf(order.status);
  const rebuilt = TRACE.slice(1, reached + 2 - order.log.length).map(text => `${order.date} ${text}`);
  return [order.log[0], ...rebuilt, ...order.log.slice(1)];
}

function Pill({ status }: { status: WStatus }) {
  return <span className={`${w.pill} ${w[`st${FLOW.indexOf(status)}`]}`}>{status}</span>;
}

function Rail({ status }: { status: WStatus }) {
  const reached = FLOW.indexOf(status);
  return <ol className={w.rail} aria-label="مراحل الطلب">{STEPS.map((label, index) => <li key={label} className={index <= reached ? w.railDone : index === reached + 1 ? w.railNow : ""} aria-current={index === reached ? "step" : undefined}><i><bdi>{index + 1}</bdi></i><span>{label}</span></li>)}</ol>;
}

function Lines({ order }: { order: WOrder }) {
  const subtotal = order.lines.reduce((sum, line) => sum + line.qty * line.price, 0);
  const total = orderTotal(order);
  return <div className={`${s.tableWrap} ${w.lines}`}><table className={s.table}>
    <thead><tr><th>الصورة</th><th>الباركود</th><th>رقم الصنف</th><th>المنتج</th><th>النوع</th><th>الكمية</th><th>الوحدة</th><th>السعر</th><th>الإجمالي</th></tr></thead>
    <tbody>{order.lines.map(line => <tr key={line.sku}><td><Thumb name={line.name} size={56} /></td><td><bdi className={s.code}>{line.barcode}</bdi></td><td><bdi className={s.code}>{line.sku}</bdi></td><td><strong>{line.name}</strong></td><td>{line.category}</td><td><bdi className={s.num}>{n(line.qty)}</bdi></td><td>{line.unit}</td><td><bdi className={s.num}>{money(line.price)}</bdi></td><td><bdi className={s.num}>{money(line.qty * line.price)}</bdi></td></tr>)}</tbody>
    <tfoot>
      <tr><td colSpan={8}>المجموع قبل الضريبة</td><td><bdi className={s.num}>{money(subtotal)}</bdi></td></tr>
      <tr><td colSpan={8}>ضريبة القيمة المضافة 15%</td><td><bdi className={s.num}>{money(total - subtotal)}</bdi></td></tr>
      <tr className={w.grand}><td colSpan={8}>الإجمالي</td><td><bdi className={s.num}>{money(total)}</bdi></td></tr>
    </tfoot>
  </table></div>;
}

function Trace({ order }: { order: WOrder }) {
  return <ol className={w.trace} aria-label="سجل تتبع الطلب">{traceOf(order).map((entry, index) => <li key={index}><bdi>{entry}</bdi></li>)}</ol>;
}

function Facts({ order }: { order: WOrder }) {
  return <dl className={s.fields}>
    <div><dt>الفرع الطالب</dt><dd>{order.branch}</dd></div>
    <div><dt>مقدم الطلب</dt><dd>{order.by}</dd></div>
    <div><dt>تاريخ الطلب</dt><dd><bdi className={s.num}>{order.date}</bdi></dd></div>
    <div><dt>مطلوب في</dt><dd><bdi className={s.num}>{order.needed}</bdi></dd></div>
    <div><dt>الأولوية</dt><dd>{order.priority}</dd></div>
    <div><dt>الأصناف والوحدات</dt><dd><bdi>{order.lines.length}</bdi> صنف و<bdi>{n(units(order))}</bdi> وحدة</dd></div>
    {order.invoice && <div><dt>رقم الفاتورة</dt><dd><bdi className={s.code}>{order.invoice}</bdi></dd></div>}
  </dl>;
}

/** Full in-page order record with its status rail, lines and trace. */
function OrderRecord({ order, back }: { order: WOrder; back: () => void }) {
  return <>
    <button type="button" className={s.back} onClick={back}><ArrowRight size={16} aria-hidden="true" />كل طلبات المعمل</button>
    <section className={w.hero}>
      <div><span>طلب معمل</span><h2><bdi>{order.no}</bdi></h2><p>{order.branch} · {order.by}</p></div>
      <div className={w.heroSide}><Pill status={order.status} /><strong><bdi>{money(orderTotal(order))}</bdi></strong></div>
    </section>
    <section className={s.panel}><div className={s.panelHead}><h2>مراحل الطلب</h2><span>من رفع الطلب حتى الفاتورة</span></div><div className={s.panelBody}><Rail status={order.status} /></div></section>
    <div className={s.grid2} style={{ marginTop: 20 }}>
      <section className={s.panel}><div className={s.panelHead}><h2>بيانات الطلب</h2></div><div className={s.panelBody}><Facts order={order} /></div></section>
      <section className={s.panel}><div className={s.panelHead}><h2>سجل التتبع</h2><span>كل حركة باسمها ووقتها</span></div><div className={s.panelBody}><Trace order={order} /></div></section>
    </div>
    <section className={s.panel} style={{ marginTop: 20 }}><div className={s.panelHead}><h2>الأصناف المطلوبة</h2><span><bdi>{order.lines.length}</bdi> صنف</span></div><Lines order={order} /></section>
  </>;
}

export function DemoWorkshop({ section }: { section: string }) {
  const { orders } = useDemo();
  const [mode, setMode] = useState<Mode | null>(null);
  const [openId, setOpenId] = useState("");
  const open = orders.find(order => order.id === openId);
  const countOf = (status: WStatus) => orders.filter(order => order.status === status).length;
  const active: Mode = section === "workshop-product-order" ? "employee" : section === "workshop-deliveries" ? "branch" : "workshop";
  const cards: { id: Mode; title: string; text: string; icon: typeof Store; count: number; countLabel: string }[] = [
    { id: "employee", title: "واجهة موظف الفرع", text: "يبحث عن الصنف بالاسم أو الباركود ويرفع طلبه للمعمل", icon: Store, count: orders.length, countLabel: "طلب مرفوع" },
    { id: "workshop", title: "واجهة المعمل", text: "يستلم الطلب بكامل تفاصيله ويجهزه ثم يسلمه للفرع", icon: Factory, count: countOf("جديد") + countOf("قيد التجهيز"), countLabel: "طلب ينتظر المعمل" },
    { id: "branch", title: "واجهة استلام الفرع", text: "يستلم الأصناف الجاهزة ثم يصدر فاتورتها", icon: PackageCheck, count: countOf("تم التسليم للفرع") + countOf("مستلم في الفرع"), countLabel: "طلب ينتظر الفرع" },
  ];
  return <>
    {open ? <OrderRecord order={open} back={() => setOpenId("")} /> : <>
      <Kpis items={[
        { label: "طلبات جديدة", value: n(countOf("جديد")), note: "بانتظار استلام المعمل", tone: "warn" },
        { label: "قيد التجهيز", value: n(countOf("قيد التجهيز")), note: "يجهزها المعمل الآن" },
        { label: "سُلمت للفروع", value: n(countOf("تم التسليم للفرع")), note: "بانتظار استلام الفرع", tone: "warn" },
        { label: "استلمها الفرع", value: n(countOf("مستلم في الفرع")), note: "بانتظار إصدار الفاتورة" },
        { label: "صدرت فاتورتها", value: n(countOf("صدرت الفاتورة")), note: "تظهر في فواتير المبيعات", tone: "good" },
      ]} />
      <div className={w.launch}>{cards.map(card => <button type="button" key={card.id} className={`${w.launchCard} ${active === card.id ? w.launchOn : ""}`} onClick={() => setMode(card.id)}>
        <span className={w.launchIcon}><card.icon size={26} aria-hidden="true" /></span>
        <strong>{card.title}</strong><small>{card.text}</small>
        <em><bdi>{card.count}</bdi> {card.countLabel}</em>
        <b>فتح الواجهة</b>
      </button>)}</div>
      <section className={s.panel} style={{ marginTop: 20 }}>
        <div className={s.panelHead}><h2>سجل طلبات المعمل</h2><span>اضغط أي طلب لفتح سجله الكامل وتتبعه</span></div>
        <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>رقم الطلب</th><th>الفرع</th><th>مقدم الطلب</th><th>التاريخ</th><th>الأصناف</th><th>الإجمالي</th><th>الفاتورة</th><th>الحالة</th></tr></thead>
          <tbody>{orders.map(order => <tr key={order.id} tabIndex={0} className={s.rowLink} onClick={() => setOpenId(order.id)} onKeyDown={event => { if (event.key === "Enter") setOpenId(order.id); }}>
            <td><bdi className={s.code}>{order.no}</bdi></td><td><strong>{order.branch}</strong></td><td>{order.by}</td><td><bdi className={s.num}>{order.date}</bdi></td><td><bdi className={s.num}>{order.lines.length}</bdi></td><td><bdi className={s.num}>{money(orderTotal(order))}</bdi></td><td>{order.invoice ? <bdi className={s.code}>{order.invoice}</bdi> : "—"}</td><td><Pill status={order.status} /></td>
          </tr>)}</tbody>
        </table></div>
      </section>
    </>}
    {mode === "employee" && <EmployeeStation onClose={() => setMode(null)} />}
    {mode === "workshop" && <WorkshopStation onClose={() => setMode(null)} />}
    {mode === "branch" && <BranchStation onClose={() => setMode(null)} />}
  </>;
}

/** Branch employee: build a basket from the catalogue and send it to the workshop. */
function EmployeeStation({ onClose }: { onClose: () => void }) {
  const { d, orders, submitOrder } = useDemo();
  const toast = useToast();
  const [branch, setBranch] = useState(d.branches[0].name);
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("عادي");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [sentId, setSentId] = useState("");
  const employee = String(d.employees.find(row => row.branch === branch)?.name ?? "موظف الفرع");
  const products = useMemo(() => { const needle = query.trim().toLowerCase(); return d.products.filter(product => !needle || product.name.includes(needle) || product.sku.toLowerCase().includes(needle) || product.barcode.includes(needle)); }, [d, query]);
  const lines: WLine[] = d.products.filter(product => cart[product.sku] > 0).map(product => ({ sku: product.sku, barcode: product.barcode, name: product.name, category: product.category, unit: product.unit, qty: cart[product.sku], price: product.price }));
  const subtotal = lines.reduce((sum, line) => sum + line.qty * line.price, 0);
  const sent = orders.find(order => order.id === sentId);
  const change = (sku: string, delta: number) => setCart(current => ({ ...current, [sku]: Math.max(0, (current[sku] ?? 0) + delta) }));
  const send = () => {
    if (lines.length === 0) { toast("أضف صنفًا واحدًا على الأقل قبل الإرسال"); return; }
    const order = submitOrder(branch, employee, lines, priority);
    setSentId(order.id); setCart({}); toast(`أُرسل الطلب ${order.no} للمعمل`);
  };
  return <FullScreen title="واجهة موظف الفرع" subtitle={`${branch} · ${employee}`} onClose={onClose}>
    <div className={w.stationGrid}>
      <div>
        <div className={w.bar}>
          <label className={w.pick}>الفرع<select value={branch} onChange={event => setBranch(event.target.value)}>{d.branches.map(item => <option key={item.id}>{item.name}</option>)}</select></label>
          <label className={s.search}><Search size={16} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث بالاسم أو رقم الصنف أو الباركود" aria-label="بحث في الأصناف" /></label>
        </div>
        <div className={w.products}>{products.map(product => { const qty = cart[product.sku] ?? 0; return <article key={product.sku} className={`${w.product} ${qty > 0 ? w.productOn : ""}`}><Thumb name={product.name} size={96} />
          <header><strong>{product.name}</strong><small>{product.category}</small></header>
          <dl><div><dt>رقم الصنف</dt><dd><bdi>{product.sku}</bdi></dd></div><div><dt>الباركود</dt><dd><bdi>{product.barcode}</bdi></dd></div></dl>
          <footer><span><bdi>{money(product.price)}</bdi> / {product.unit}</span><div className={w.qty}><button type="button" onClick={() => change(product.sku, -1)} disabled={qty === 0} aria-label={`إنقاص ${product.name}`}><Minus size={15} aria-hidden="true" /></button><bdi>{qty}</bdi><button type="button" onClick={() => change(product.sku, 1)} aria-label={`زيادة ${product.name}`}><Plus size={15} aria-hidden="true" /></button></div></footer>
        </article>; })}{products.length === 0 && <p className={s.empty}>لا يوجد صنف مطابق للبحث</p>}</div>
      </div>
      <aside className={w.cart} aria-label="سلة الطلب">
        <h2>سلة الطلب</h2>
        {sent && <div className={w.banner} role="status"><strong>تم رفع الطلب <bdi>{sent.no}</bdi></strong><span>حالته الآن</span><Pill status={sent.status} /></div>}
        {lines.length === 0 ? <p className={w.cartEmpty}>اضغط علامة الزائد على أي صنف لإضافته</p> : <ul>{lines.map(line => <li key={line.sku}><div><strong>{line.name}</strong><small><bdi>{line.qty}</bdi> {line.unit} × <bdi>{money(line.price)}</bdi></small></div><bdi>{money(line.qty * line.price)}</bdi></li>)}</ul>}
        <div className={w.sum}><span>قبل الضريبة</span><bdi>{money(subtotal)}</bdi></div>
        <div className={w.sum}><span>ضريبة القيمة المضافة 15%</span><bdi>{money(Math.round(subtotal * 0.15))}</bdi></div>
        <div className={`${w.sum} ${w.sumTotal}`}><span>الإجمالي</span><bdi>{money(Math.round(subtotal * 1.15))}</bdi></div>
        <div className={s.chips} role="group" aria-label="الأولوية">{["عادي", "عاجل"].map(value => <button type="button" key={value} aria-pressed={priority === value} onClick={() => setPriority(value)}>{value}</button>)}</div>
        <button type="button" className={`${s.primary} ${w.wide}`} onClick={send}><Send size={16} aria-hidden="true" />إرسال الطلب للمعمل</button>
      </aside>
    </div>
  </FullScreen>;
}

function OrderCard({ order, on, select }: { order: WOrder; on: boolean; select: () => void }) {
  return <button type="button" className={`${w.card} ${on ? w.cardOn : ""}`} aria-pressed={on} onClick={select}>
    <div><bdi className={s.code}>{order.no}</bdi>{order.priority === "عاجل" && <span className={w.urgent}>عاجل</span>}</div>
    <strong>{order.branch}</strong>
    <small><bdi>{order.lines.length}</bdi> صنف · <bdi>{n(units(order))}</bdi> وحدة · <bdi>{money(orderTotal(order))}</bdi></small>
    <Pill status={order.status} />
  </button>;
}

/** Workshop: receive the order, prepare it, then hand it to the requesting branch. */
function WorkshopStation({ onClose }: { onClose: () => void }) {
  const { orders, advanceOrder } = useDemo();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState(() => orders.find(order => order.status === "جديد")?.id ?? orders[0]?.id ?? "");
  const selected = orders.find(order => order.id === selectedId);
  const columns: [string, WStatus[]][] = [["طلبات جديدة", ["جديد"]], ["قيد التجهيز", ["قيد التجهيز"]], ["تم التسليم للفروع", ["تم التسليم للفرع", "مستلم في الفرع", "صدرت الفاتورة"]]];
  const act = (order: WOrder) => { advanceOrder(order.id); toast(order.status === "جديد" ? `استلم المعمل الطلب ${order.no} وبدأ تجهيزه` : `سُلّم الطلب ${order.no} إلى ${order.branch}`); };
  return <FullScreen title="واجهة المعمل" subtitle="استلام طلبات الفروع وتجهيزها وتسليمها" onClose={onClose}>
    <div className={w.split}>
      <div className={w.board}>{columns.map(([title, statuses]) => { const list = orders.filter(order => statuses.includes(order.status)); return <section key={title} className={w.column}>
        <h2>{title}<b><bdi>{list.length}</bdi></b></h2>
        {list.map(order => <OrderCard key={order.id} order={order} on={order.id === selectedId} select={() => setSelectedId(order.id)} />)}
        {list.length === 0 && <p className={w.cartEmpty}>لا توجد طلبات هنا</p>}
      </section>; })}</div>
      <section className={w.detail} aria-label="تفاصيل الطلب">{selected ? <>
        <header><div><span>طلب معمل</span><h2><bdi>{selected.no}</bdi></h2></div><Pill status={selected.status} /></header>
        <Rail status={selected.status} />
        <Facts order={selected} />
        <Lines order={selected} />
        {selected.status === "جديد" ? <button type="button" className={`${s.primary} ${w.wide}`} onClick={() => act(selected)}><ClipboardList size={17} aria-hidden="true" />استلام</button>
          : selected.status === "قيد التجهيز" ? <button type="button" className={`${s.primary} ${w.wide} ${w.deliver}`} onClick={() => act(selected)}><PackageCheck size={17} aria-hidden="true" />تم التسليم</button>
          : <button type="button" className={`${s.ghost} ${w.wide}`} disabled>{selected.status === "تم التسليم للفرع" ? "سُلّم للفرع وبانتظار استلامه" : selected.status}</button>}
        <h3 className={w.sub}>سجل التتبع</h3><Trace order={selected} />
      </> : <p className={s.empty}>اختر طلبًا لعرض تفاصيله</p>}</section>
    </div>
  </FullScreen>;
}

/** Branch: receive what the workshop delivered, then issue its invoice. */
function BranchStation({ onClose }: { onClose: () => void }) {
  const { d, go, orders, advanceOrder } = useDemo();
  const toast = useToast();
  const [branch, setBranch] = useState(() => orders.find(order => order.status === "تم التسليم للفرع")?.branch ?? d.branches[0].name);
  const [selectedId, setSelectedId] = useState("");
  const list = orders.filter(order => order.branch === branch);
  const selected = list.find(order => order.id === selectedId) ?? list.find(order => order.status === "تم التسليم للفرع") ?? list[0];
  const act = (order: WOrder) => { advanceOrder(order.id); toast(order.status === "تم التسليم للفرع" ? `استلم الفرع أصناف الطلب ${order.no}` : `صدرت فاتورة الطلب ${order.no} وأضيفت لفواتير المبيعات`); };
  const waiting = (status: WStatus) => list.filter(order => order.status === status).length;
  return <FullScreen title="واجهة استلام الفرع" subtitle={`طلبات المعمل الخاصة بـ ${branch}`} onClose={onClose}>
    <div className={w.bar}>
      <label className={w.pick}>الفرع<select value={branch} onChange={event => { setBranch(event.target.value); setSelectedId(""); }}>{d.branches.map(item => <option key={item.id}>{item.name}</option>)}</select></label>
      <span className={w.count}>جاهزة للاستلام <bdi>{waiting("تم التسليم للفرع")}</bdi></span>
      <span className={w.count}>بانتظار الفاتورة <bdi>{waiting("مستلم في الفرع")}</bdi></span>
      <span className={w.count}>صدرت فاتورتها <bdi>{waiting("صدرت الفاتورة")}</bdi></span>
    </div>
    <div className={w.split}>
      <section className={w.column}>
        <h2>طلبات الفرع<b><bdi>{list.length}</bdi></b></h2>
        {list.map(order => <OrderCard key={order.id} order={order} on={order.id === selected?.id} select={() => setSelectedId(order.id)} />)}
        {list.length === 0 && <p className={w.cartEmpty}>لا توجد طلبات معمل لهذا الفرع</p>}
      </section>
      <section className={w.detail} aria-label="تفاصيل الطلب">{selected ? <>
        <header><div><span>طلب معمل</span><h2><bdi>{selected.no}</bdi></h2></div><Pill status={selected.status} /></header>
        <Rail status={selected.status} />
        <Facts order={selected} />
        <Lines order={selected} />
        {selected.status === "تم التسليم للفرع" ? <button type="button" className={`${s.primary} ${w.wide}`} onClick={() => act(selected)}><PackageCheck size={17} aria-hidden="true" />استلام</button>
          : selected.status === "مستلم في الفرع" ? <button type="button" className={`${s.primary} ${w.wide} ${w.deliver}`} onClick={() => act(selected)}><ReceiptText size={17} aria-hidden="true" />إصدار الفاتورة</button>
          : selected.status === "صدرت الفاتورة" ? <div className={w.banner} role="status"><strong>صدرت الفاتورة <bdi>{selected.invoice}</bdi></strong><span>مصنفة ضمن طلبات المعمل</span><button type="button" className={s.ghost} onClick={() => { onClose(); go("sales-invoices"); }}><ReceiptText size={15} aria-hidden="true" />عرض في فواتير المبيعات</button></div>
          : <button type="button" className={`${s.ghost} ${w.wide}`} disabled>{selected.status === "جديد" ? "بانتظار استلام المعمل" : "المعمل يجهز الطلب"}</button>}
        <h3 className={w.sub}>سجل التتبع</h3><Trace order={selected} />
      </> : <p className={s.empty}>اختر طلبًا لعرض تفاصيله</p>}</section>
    </div>
  </FullScreen>;
}
