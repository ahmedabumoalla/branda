"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Banknote, CreditCard, Gift, HandHeart, Minus, PauseCircle, Phone, Plus, Printer, ReceiptText, ScanLine, ShoppingBasket, Smartphone, Star, Trash2, UserPlus, Wallet } from "lucide-react";
import type { Row } from "./data";
import { Badge, Thumb, today, useToast } from "./kit";
import { clock, FullScreen, useDemo } from "./store";
import s from "./demo.module.css";
import c from "./cashier.module.css";

type CartLine = { sku: string; name: string; unit: string; price: number; qty: number };
type Mode = "sale" | "purchase" | "family" | "shift";
type Receipt = { row: Row; net: number; due: number; discount: number; vat: number; redeemed: number; earned: number; balance: number | null; cash: number; change: number; time: string };
const TIER_X: Record<string, number> = { "برونزي": 1, "فضي": 1.25, "ذهبي": 1.5, "بلاتيني": 2 };
// One point is worth 10 halalas at the cashier.
const POINT_VALUE = 0.1;
const METHODS: [string, ReactNode][] = [["مدى", <CreditCard key="m" size={17} aria-hidden="true" />], ["نقدي", <Banknote key="c" size={17} aria-hidden="true" />], ["فيزا", <CreditCard key="v" size={17} aria-hidden="true" />], ["Apple Pay", <Smartphone key="a" size={17} aria-hidden="true" />], ["آجل", <Wallet key="w" size={17} aria-hidden="true" />]];
const SUPPLIERS = ["مطاحن الرياض الحديثة", "شركة ألبان الصافي", "مصنع التغليف الذهبي", "مؤسسة تمور القصيم", "مشتريات نثرية"];
const n = (value: number) => Math.round(value).toLocaleString("en-US");
// The cashier shows halalas because points are worth 10 halalas each.
const sar = (value: number) => `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;
const digits = (value: string) => value.replace(/[٠-٩]/g, char => String("٠١٢٣٤٥٦٧٨٩".indexOf(char))).replace(/\D/g, "");
const amount = (value: string) => { const parsed = Number(digits(value.replace(".", "x")).length ? value.replace(/[٠-٩]/g, char => String("٠١٢٣٤٥٦٧٨٩".indexOf(char))) : "0"); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; };

/** Branch cashier: sells from the branch stock at the branch price, redeems and earns points by phone number, and records purchases, family receipts and the shift. */
export function Cashier({ point, onClose }: { point: Row; onClose: () => void }) {
  const { d, prices, records, addRecord, log } = useDemo();
  const toast = useToast();
  const branch = String(point.branch);
  const code = String(point.code);
  const cashierName = String(d.shifts.find(shift => String(shift.point).startsWith(branch))?.cashier ?? "كاشير الوردية");
  const [mode, setMode] = useState<Mode>("sale");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [held, setHeld] = useState<CartLine[][]>([]);
  const [phone, setPhone] = useState("");
  const [customer, setCustomer] = useState<Row | null>(null);
  const [searched, setSearched] = useState(false);
  const [newName, setNewName] = useState("");
  const [usePoints, setUsePoints] = useState(false);
  const [method, setMethod] = useState("مدى");
  const [cash, setCash] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [, refresh] = useState(0);
  const priceOf = (sku: string, base: number) => prices[branch]?.[sku] ?? base;
  const stockOf = (sku: string) => (d.branchStock[branch]?.[sku] ?? 0) - (cart.find(line => line.sku === sku)?.qty ?? 0);
  const categories = useMemo(() => [...new Set(d.products.map(product => product.category))], [d]);
  const needle = query.trim().toLowerCase();
  const products = d.products.filter(product => (!category || product.category === category) && (!needle || product.name.toLowerCase().includes(needle) || product.sku.toLowerCase().includes(needle) || product.barcode.includes(needle)));

  function add(sku: string) {
    const product = d.products.find(item => item.sku === sku); if (!product) return;
    if (stockOf(sku) <= 0) return toast(`${product.name} نافد في مخزن ${branch}`);
    setReceipt(null);
    setCart(current => current.some(line => line.sku === sku) ? current.map(line => line.sku === sku ? { ...line, qty: line.qty + 1 } : line) : [...current, { sku, name: product.name, unit: product.unit, price: priceOf(sku, product.price), qty: 1 }]);
  }
  function scan() {
    const exact = d.products.find(product => product.barcode === needle || product.sku.toLowerCase() === needle);
    if (exact) { add(exact.sku); setQuery(""); } else if (products.length === 1) { add(products[0].sku); setQuery(""); } else toast("لم يطابق الباركود صنفًا واحدًا");
  }
  const change = (sku: string, delta: number) => setCart(current => current.flatMap(line => line.sku !== sku ? [line] : line.qty + delta <= 0 ? [] : delta > 0 && stockOf(sku) <= 0 ? [line] : [{ ...line, qty: line.qty + delta }]));

  const net = cart.reduce((total, line) => total + line.qty * line.price, 0);
  const balance = customer ? Number(customer.points) : 0;
  const vat = net * 0.15;
  const total = Math.round((net + vat) * 100) / 100;
  // Points pay for the invoice in full up to its total; whatever the invoice does not need stays in the customer's balance.
  const pointsWorth = Math.round(balance * POINT_VALUE * 100) / 100;
  const discount = customer && usePoints ? Math.min(pointsWorth, total) : 0;
  const redeemed = Math.min(balance, Math.ceil(discount / POINT_VALUE - 1e-9));
  const due = Math.round((total - discount) * 100) / 100;
  const earned = customer ? Math.floor(due / 1.15 * (TIER_X[String(customer.tier)] ?? 1)) : 0;
  const paidCash = amount(cash);

  function lookup() {
    const value = digits(phone); setPhone(value); setSearched(true); setUsePoints(false);
    const found = d.customers.find(row => row.phone === value) ?? null;
    setCustomer(found);
    toast(found ? `العميل ${String(found.name)} ورصيده ${n(Number(found.points))} نقطة` : /^05\d{8}$/.test(value) ? "الرقم غير مسجل ويمكن تسجيله الآن" : "اكتب رقم جوال صحيحًا يبدأ بـ 05");
  }
  function register() {
    const name = newName.trim(); if (name.length < 2) return toast("اكتب اسم العميل");
    const row: Row = { id: `c-new-${d.customers.length}`, code: `CUS-${String(1200 + d.customers.length).padStart(5, "0")}`, name, phone, tier: "برونزي", branch, visits: 0, spent: 0, balance: 0, points: 0, stamps: 0, lastVisit: today(), status: "نشط", earnedOwn: 0, earnedFranchise: 0, redeemedOwn: 0, redeemedFranchise: 0 };
    d.customers.unshift(row); setCustomer(row); setNewName(""); log(`تسجيل العميل ${name} في الولاء من كاشير ${branch}`); toast("سُجل العميل وأضيفت بطاقته");
  }
  function pay() {
    if (!cart.length) return toast("أضف صنفًا إلى الفاتورة أولًا");
    if (due > 0 && method === "آجل" && !customer) return toast("البيع الآجل يحتاج عميلًا مسجلًا برقم جواله");
    if (due > 0 && method === "نقدي" && paidCash < due) return toast("المبلغ المستلم أقل من المطلوب دفعه");
    const tender = due === 0 ? "نقاط" : method;
    const no = `INV-${String(48211 + records.sale.length).padStart(5, "0")}`;
    const row: Row = { id: `sale-${records.sale.length}`, point: code, type: "نقطة بيع", no, date: today(), customer: customer ? String(customer.name) : "عميل نقدي", branch, cashier: cashierName, method: tender, items: cart.length, total, paid: tender === "آجل" ? discount : total, status: tender === "آجل" ? "آجلة" : "مدفوعة", lines: cart.map(line => ({ name: line.name, qty: line.qty, unit: line.unit, price: line.price })) };
    addRecord("sale", row);
    cart.forEach(line => { d.branchStock[branch][line.sku] = Math.max(0, (d.branchStock[branch][line.sku] ?? 0) - line.qty); });
    let after: number | null = null;
    if (customer) {
      after = balance - redeemed + earned;
      Object.assign(customer, { points: after, earnedOwn: Number(customer.earnedOwn ?? 0) + earned, redeemedOwn: Number(customer.redeemedOwn ?? 0) + redeemed, visits: Number(customer.visits ?? 0) + 1, spent: Number(customer.spent ?? 0) + total, balance: Number(customer.balance ?? 0) + (tender === "آجل" ? due : 0), stamps: (Number(customer.stamps ?? 0) + 1) % 10, lastVisit: today() });
      const base = { date: today(), customer: String(customer.name), customerId: customer.id, tier: String(customer.tier), placeType: "فروعنا", place: branch, invoice: no };
      if (redeemed) d.pointsLedger.unshift({ ...base, id: `pm-r-${no}`, kind: "استبدال", basis: "دفع من الفاتورة", points: -redeemed, status: "مستبدلة" });
      if (earned) d.pointsLedger.unshift({ ...base, id: `pm-e-${no}`, kind: "اكتساب", basis: "قيمة الفاتورة", points: earned, status: "مضافة" });
    }
    log(`فاتورة ${no} من كاشير ${branch} بقيمة ${n(total)} ر.س ${tender}${redeemed ? ` واستخدام ${n(redeemed)} نقطة` : ""}`);
    setReceipt({ row, net, due, discount, vat, redeemed, earned, balance: after, cash: paidCash, change: tender === "نقدي" ? paidCash - due : 0, time: clock() });
    setCart([]); setUsePoints(false); setCash("");
  }
  function hold() { if (!cart.length) return; setHeld(current => [...current, cart]); setCart([]); toast("عُلقت الفاتورة ويمكن استرجاعها"); }
  function reset() { setCustomer(null); setPhone(""); setSearched(false); setReceipt(null); setUsePoints(false); }

  const mine = { sale: records.sale.filter(row => row.point === code), purchase: records.purchase.filter(row => row.point === code), family: records.family.filter(row => row.point === code) };
  const by = (name: string) => mine.sale.filter(row => row.method === name).reduce((sum, row) => sum + Number(row.total), 0);
  const drawerPurchases = mine.purchase.filter(row => row.source === "درج الكاشير").reduce((sum, row) => sum + Number(row.total), 0);

  return <FullScreen title={`كاشير ${branch}`} subtitle={`${String(point.name)} · ${code} · ${cashierName} · يصرف من ${String(point.warehouse)}`} onClose={onClose}>
    <div className={s.chips} role="tablist" aria-label="أقسام الكاشير" style={{ marginBottom: 16 }}>
      {([["sale", "البيع", ShoppingBasket], ["purchase", "إدخال مشتريات", ReceiptText], ["family", "استلام الأسر المنتجة", HandHeart], ["shift", `الوردية والسجل ${mine.sale.length}`, Wallet]] as const).map(([id, label, Icon]) => <button type="button" role="tab" key={id} aria-selected={mode === id} aria-pressed={mode === id} onClick={() => setMode(id)}><Icon size={15} aria-hidden="true" /> {label}</button>)}
    </div>

    {mode === "sale" && <div className={c.wrap}>
      <section className={c.catalog}>
        <form className={c.scan} onSubmit={event => { event.preventDefault(); scan(); }}><ScanLine size={18} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="امسح الباركود أو اكتب اسم الصنف أو رقمه ثم Enter" aria-label="بحث أو مسح باركود" autoFocus /><button type="submit" className={s.ghost}>إضافة</button></form>
        <div className={s.chips} role="group" aria-label="التصنيفات" style={{ margin: "12px 0" }}><button type="button" aria-pressed={!category} onClick={() => setCategory("")}>الكل</button>{categories.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <div className={c.tiles}>{products.map(product => { const left = stockOf(product.sku); const inCart = cart.find(line => line.sku === product.sku)?.qty ?? 0; return <button type="button" key={product.sku} className={`${c.tile} ${left <= 0 ? c.tileOut : ""} ${inCart ? c.tileOn : ""}`} onClick={() => add(product.sku)} aria-label={`إضافة ${product.name}`}>
          {inCart > 0 && <b className={c.count}><bdi>{inCart}</bdi></b>}
          <Thumb name={product.name} size={84} />
          <strong>{product.name}</strong><small>{product.category} · {product.unit}</small>
          <span><bdi>{sar(priceOf(product.sku, product.price))}</bdi><em className={left <= 0 ? s.bad : left < 10 ? s.warn : s.good}>{left <= 0 ? "نافد" : <><bdi>{left}</bdi> متاح</>}</em></span>
        </button>; })}{products.length === 0 && <p className={s.empty}>لا يوجد صنف مطابق</p>}</div>
      </section>

      <aside className={c.side}>
        <section className={c.box}>
          <form className={c.phone} onSubmit={event => { event.preventDefault(); lookup(); }}><Phone size={17} aria-hidden="true" /><input value={phone} onChange={event => { setPhone(digits(event.target.value)); setSearched(false); }} inputMode="numeric" dir="ltr" maxLength={10} placeholder="05XXXXXXXX" aria-label="رقم جوال العميل" /><button type="submit" className={s.primary}>بحث</button></form>
          {customer ? <div className={c.customer}>
            <div><strong>{String(customer.name)}</strong><small><bdi>{String(customer.phone)}</bdi> · فئة {String(customer.tier)} · <bdi>{n(Number(customer.visits))}</bdi> زيارة</small></div>
            <div className={c.points}><span><Star size={14} aria-hidden="true" /> <bdi>{n(balance)}</bdi> نقطة</span><span><Gift size={14} aria-hidden="true" /> <bdi>{Number(customer.stamps)}</bdi> / 10 أختام</span><button type="button" className={c.link} onClick={reset}>تغيير العميل</button></div>
            <div className={c.redeem}>
              <p>رصيد النقاط <bdi>{n(balance)}</bdi> نقطة يساوي <bdi>{sar(pointsWorth)}</bdi> وكل نقطة بعشر هللات</p>
              <div className={c.useRow} role="group" aria-label="استخدام النقاط"><button type="button" aria-pressed={usePoints} disabled={balance <= 0} onClick={() => setUsePoints(true)}><Star size={16} aria-hidden="true" />استخدام النقاط</button><button type="button" aria-pressed={!usePoints} onClick={() => setUsePoints(false)}>بدون نقاط</button></div>
              {usePoints && cart.length > 0 && <p className={c.useNote}>يدفع من النقاط <bdi>{sar(discount)}</bdi> باستخدام <bdi>{n(redeemed)}</bdi> نقطة ويبقى للعميل <bdi>{n(balance - redeemed)}</bdi> نقطة تساوي <bdi>{sar((balance - redeemed) * POINT_VALUE)}</bdi></p>}
              {usePoints && cart.length === 0 && <p className={c.useNote}>أضف الأصناف وستخصم النقاط من الفاتورة بقدر قيمتها</p>}
            </div>
          </div> : searched && /^05\d{8}$/.test(phone) ? <div className={c.register}><UserPlus size={17} aria-hidden="true" /><input value={newName} onChange={event => setNewName(event.target.value)} maxLength={40} placeholder="اسم العميل الجديد" aria-label="اسم العميل الجديد" /><button type="button" className={s.ghost} onClick={register}>تسجيل في الولاء</button></div> : <p className={c.muted}>أدخل رقم الجوال لعرض نقاط العميل وأختامه أو أكمل البيع كعميل نقدي</p>}
        </section>

        {receipt ? <section className={c.receipt}>
          <header><strong>الديم للحلويات</strong><small>{branch} · {String(point.name)}</small><small>فاتورة ضريبية مبسطة</small></header>
          <dl><div><dt>رقم الفاتورة</dt><dd><bdi>{String(receipt.row.no)}</bdi></dd></div><div><dt>التاريخ والوقت</dt><dd><bdi>{today()} {receipt.time}</bdi></dd></div><div><dt>العميل</dt><dd>{String(receipt.row.customer)}</dd></div><div><dt>الكاشير</dt><dd>{cashierName}</dd></div></dl>
          <table><tbody>{(receipt.row.lines ?? []).map((line, index) => <tr key={index}><td>{line.name}<small><bdi>{line.qty}</bdi> × <bdi>{sar(line.price)}</bdi></small></td><td><bdi>{sar(line.qty * line.price)}</bdi></td></tr>)}</tbody></table>
          <dl><div><dt>المجموع</dt><dd><bdi>{sar(receipt.net)}</bdi></dd></div><div><dt>ضريبة القيمة المضافة 15%</dt><dd><bdi>{sar(receipt.vat)}</bdi></dd></div><div className={c.grand}><dt>الإجمالي</dt><dd><bdi>{sar(Number(receipt.row.total))}</bdi></dd></div>{receipt.redeemed > 0 && <div><dt>مدفوع بالنقاط <bdi>{n(receipt.redeemed)}</bdi> نقطة</dt><dd><bdi>- {sar(receipt.discount)}</bdi></dd></div>}{receipt.due > 0 && <div><dt>مدفوع {String(receipt.row.method)}</dt><dd><bdi>{sar(receipt.due)}</bdi></dd></div>}{receipt.change > 0 && <div><dt>الباقي للعميل</dt><dd><bdi>{sar(receipt.change)}</bdi></dd></div>}</dl>
          {receipt.balance !== null && <p className={c.earned}>كسب العميل <bdi>{n(receipt.earned)}</bdi> نقطة وأضيف ختم لبطاقته ورصيده الآن <bdi>{n(receipt.balance)}</bdi> نقطة</p>}
          <div className={c.codeBars} aria-hidden="true">{String(receipt.row.no).split("").map((char, index) => <i key={index} style={{ width: `${1 + (char.charCodeAt(0) + index) % 4}px` }} />)}</div>
          <footer><button type="button" className={s.ghost} onClick={() => toast("أُرسل الإيصال للطابعة وسُجلت العملية")}><Printer size={15} aria-hidden="true" />طباعة</button><button type="button" className={s.primary} onClick={reset}>فاتورة جديدة</button></footer>
        </section> : <section className={c.box}>
          {held.length > 0 && <div className={s.chips} style={{ marginBottom: 10 }} role="group" aria-label="فواتير معلقة">{held.map((lines, index) => <button type="button" key={index} onClick={() => { setHeld(current => current.filter((_, i) => i !== index)); setCart(lines); }}>فاتورة معلقة <bdi>{index + 1}</bdi> · <bdi>{lines.length}</bdi> صنف</button>)}</div>}
          <div className={c.lines}>{cart.map(line => <div key={line.sku} className={c.line}>
            <Thumb name={line.name} size={40} />
            <div><strong>{line.name}</strong><small><bdi>{sar(line.price)}</bdi> لكل {line.unit}</small></div>
            <div className={c.qty}><button type="button" onClick={() => change(line.sku, -1)} aria-label={`إنقاص ${line.name}`}><Minus size={14} aria-hidden="true" /></button><bdi>{line.qty}</bdi><button type="button" onClick={() => change(line.sku, 1)} aria-label={`زيادة ${line.name}`}><Plus size={14} aria-hidden="true" /></button></div>
            <bdi className={c.lineTotal}>{sar(line.qty * line.price)}</bdi>
            <button type="button" className={c.remove} onClick={() => change(line.sku, -line.qty)} aria-label={`حذف ${line.name}`}><Trash2 size={14} aria-hidden="true" /></button>
          </div>)}{cart.length === 0 && <p className={c.emptyCart}><ShoppingBasket size={30} aria-hidden="true" />الفاتورة فارغة اختر الأصناف أو امسح الباركود</p>}</div>
          <dl className={c.totals}><div><dt>المجموع</dt><dd><bdi>{sar(net)}</bdi></dd></div><div><dt>الضريبة 15%</dt><dd><bdi>{sar(vat)}</bdi></dd></div><div className={c.grand}><dt>الإجمالي</dt><dd><bdi>{sar(total)}</bdi></dd></div>{redeemed > 0 && <div className={c.pointsLine}><dt>مدفوع بالنقاط <bdi>{n(redeemed)}</bdi> نقطة</dt><dd><bdi>- {sar(discount)}</bdi></dd></div>}{redeemed > 0 && <div><dt>المطلوب دفعه</dt><dd><bdi>{sar(due)}</bdi></dd></div>}{customer && cart.length > 0 && <div><dt>نقاط تكتسب بهذه الفاتورة</dt><dd><bdi>+ {n(earned)}</bdi></dd></div>}</dl>
          <div className={c.methods} role="group" aria-label="طريقة الدفع">{METHODS.map(([name, icon]) => <button type="button" key={name} aria-pressed={method === name} onClick={() => setMethod(name)}>{icon}{name}</button>)}</div>
          {due === 0 && cart.length > 0 && <p className={c.covered}>النقاط تغطي الفاتورة كاملة ولا يحتاج العميل دفع أي مبلغ</p>}
          {due > 0 && method === "نقدي" && <div className={c.cash}><input value={cash} onChange={event => setCash(event.target.value)} inputMode="decimal" dir="ltr" placeholder="المبلغ المستلم" aria-label="المبلغ المستلم" />{[due, 50, 100, 200, 500].map((value, index) => <button type="button" key={index} className={s.ghost} onClick={() => setCash(String(index === 0 ? due : value))}>{index === 0 ? "المبلغ نفسه" : <bdi>{value}</bdi>}</button>)}{paidCash >= due && cart.length > 0 && <p>الباقي للعميل <bdi>{sar(paidCash - due)}</bdi></p>}</div>}
          <div className={c.payRow}><button type="button" className={s.ghost} onClick={hold}><PauseCircle size={16} aria-hidden="true" />تعليق</button><button type="button" className={s.ghost} onClick={() => setCart([])}>إفراغ</button><button type="button" className={`${s.primary} ${c.pay}`} onClick={pay}>إتمام البيع <bdi>{sar(due)}</bdi></button></div>
        </section>}
      </aside>
    </div>}

    {mode === "purchase" && <PurchaseEntry code={code} branch={branch} cashierName={cashierName} rows={mine.purchase} />}
    {mode === "family" && <FamilyReceipt code={code} branch={branch} cashierName={cashierName} rows={mine.family} done={() => refresh(value => value + 1)} />}

    {mode === "shift" && <>
      <div className={s.kpis}>{([["فواتير الوردية", String(mine.sale.length)], ["مبيعات الوردية", sar(mine.sale.reduce((sum, row) => sum + Number(row.total), 0))], ["نقدي", sar(by("نقدي"))], ["شبكة وبطاقات", sar(by("مدى") + by("فيزا") + by("Apple Pay"))], ["آجل", sar(by("آجل"))], ["مشتريات من الدرج", sar(drawerPurchases)], ["المتوقع في الدرج", sar(500 + by("نقدي") - drawerPurchases)]] as const).map(([label, value]) => <article key={label} className={s.kpi}><span>{label}</span><strong><bdi>{value}</bdi></strong></article>)}</div>
      <div className={s.grid2}>
        <section className={s.panel}><div className={s.panelHead}><h2>فواتير هذه الوردية</h2><span>تظهر أيضًا في فواتير المبيعات</span></div><div className={s.tableWrap}><table className={s.table}><thead><tr><th>الفاتورة</th><th>العميل</th><th>الدفع</th><th>الإجمالي</th><th>الحالة</th></tr></thead><tbody>{mine.sale.map(row => <tr key={row.id}><td><bdi className={s.code}>{String(row.no)}</bdi></td><td>{String(row.customer)}</td><td>{String(row.method)}</td><td><bdi className={s.num}>{sar(Number(row.total))}</bdi></td><td><Badge>{String(row.status)}</Badge></td></tr>)}</tbody></table>{mine.sale.length === 0 && <p className={s.empty}>لم تسجل فواتير في هذه الوردية بعد</p>}</div></section>
        <section className={s.panel}><div className={s.panelHead}><h2>مشتريات واستلامات الوردية</h2></div><div className={s.tableWrap}><table className={s.table}><thead><tr><th>المستند</th><th>الجهة</th><th>القيمة</th><th>الحالة</th></tr></thead><tbody>{[...mine.purchase, ...mine.family].map(row => <tr key={row.id}><td><bdi className={s.code}>{String(row.no)}</bdi></td><td>{String(row.supplier ?? row.family)}</td><td><bdi className={s.num}>{sar(Number(row.total))}</bdi></td><td><Badge>{String(row.status)}</Badge></td></tr>)}</tbody></table>{mine.purchase.length + mine.family.length === 0 && <p className={s.empty}>لا توجد مشتريات أو استلامات في هذه الوردية</p>}</div></section>
      </div>
      <div className={s.actions} style={{ marginTop: 18 }}><button type="button" className={s.primary} onClick={() => { log(`إغلاق وردية ${code} بمبيعات ${n(mine.sale.reduce((sum, row) => sum + Number(row.total), 0))} ر.س`); toast("أُغلقت الوردية وأُرسل تقريرها للإدارة"); }}>إغلاق الوردية وإرسال التقرير</button></div>
    </>}
  </FullScreen>;
}

function PurchaseEntry({ code, branch, cashierName, rows }: { code: string; branch: string; cashierName: string; rows: Row[] }) {
  const { addRecord, log } = useDemo();
  const toast = useToast();
  const [supplier, setSupplier] = useState(SUPPLIERS[0]);
  const [source, setSource] = useState("درج الكاشير");
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");
  const [lines, setLines] = useState<{ name: string; qty: number; unit: string; price: number }[]>([]);
  const total = Math.round(lines.reduce((sum, line) => sum + line.qty * line.price, 0) * 1.15 * 100) / 100;
  function addLine() { const name = item.trim(); if (name.length < 2 || amount(cost) <= 0 || amount(qty) <= 0) return toast("اكتب الصنف والكمية والتكلفة"); setLines(current => [...current, { name, qty: amount(qty), unit: "وحدة", price: amount(cost) }]); setItem(""); setQty("1"); setCost(""); }
  function save() {
    if (!lines.length) return toast("أضف صنفًا واحدًا على الأقل");
    const no = `PPO-${String(701 + rows.length).padStart(5, "0")}`;
    addRecord("purchase", { id: `pp-${code}-${rows.length}`, point: code, no, date: today(), supplier, source, cashier: cashierName, items: lines.length, total, status: source === "درج الكاشير" ? "مدفوعة" : "آجلة", lines });
    log(`مشتريات ${no} من ${supplier} في ${branch} بقيمة ${n(total)} ر.س ${source}`); toast(`سُجلت المشتريات ${no}`); setLines([]);
  }
  return <div className={s.grid2}>
    <section className={s.panel}><div className={s.panelHead}><h2>إدخال مشتريات من الكاشير</h2><span>تسجل على الوردية وتظهر في تقريرها</span></div><div className={s.panelBody}>
      <div className={s.form}><label>المورد<select value={supplier} onChange={event => setSupplier(event.target.value)}>{SUPPLIERS.map(name => <option key={name}>{name}</option>)}</select></label><label>الدفع من<select value={source} onChange={event => setSource(event.target.value)}><option>درج الكاشير</option><option>آجل على المورد</option></select></label></div>
      <div className={s.form} style={{ marginTop: 12 }}><label>الصنف<input value={item} maxLength={50} placeholder="مثال: علب تغليف" onChange={event => setItem(event.target.value)} /></label><label>الكمية<input value={qty} inputMode="decimal" dir="ltr" onChange={event => setQty(event.target.value)} /></label><label>تكلفة الوحدة<input value={cost} inputMode="decimal" dir="ltr" onChange={event => setCost(event.target.value)} /></label></div>
      <div className={s.actions} style={{ marginTop: 14 }}><button type="button" className={s.ghost} onClick={addLine}><Plus size={15} aria-hidden="true" />إضافة الصنف</button><button type="button" className={s.primary} onClick={save}>حفظ المشتريات <bdi>{sar(total)}</bdi></button></div>
      <div className={s.tableWrap} style={{ marginTop: 14 }}><table className={s.table}><thead><tr><th>الصنف</th><th>الكمية</th><th>التكلفة</th><th>الإجمالي</th></tr></thead><tbody>{lines.map((line, index) => <tr key={index}><td><strong>{line.name}</strong></td><td><bdi className={s.num}>{line.qty}</bdi></td><td><bdi className={s.num}>{sar(line.price)}</bdi></td><td><bdi className={s.num}>{sar(line.qty * line.price)}</bdi></td></tr>)}</tbody></table>{lines.length === 0 && <p className={s.empty}>أضف أصناف الفاتورة ثم احفظها</p>}</div>
    </div></section>
    <section className={s.panel}><div className={s.panelHead}><h2>مشتريات هذه الوردية</h2><span><bdi>{rows.length}</bdi> مستند</span></div><div className={s.tableWrap}><table className={s.table}><thead><tr><th>المستند</th><th>المورد</th><th>الدفع</th><th>الإجمالي</th><th>الحالة</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><bdi className={s.code}>{String(row.no)}</bdi></td><td>{String(row.supplier)}</td><td>{String(row.source)}</td><td><bdi className={s.num}>{sar(Number(row.total))}</bdi></td><td><Badge>{String(row.status)}</Badge></td></tr>)}</tbody></table>{rows.length === 0 && <p className={s.empty}>لم تسجل مشتريات بعد</p>}</div></section>
  </div>;
}

function Bars({ value }: { value: string }) {
  return <div className={c.codeBars} aria-hidden="true">{value.split("").map((char, index) => <i key={index} style={{ width: `${1 + (char.charCodeAt(0) + index) % 4}px` }} />)}</div>;
}

/** Family goods are received by barcode or item number; an item without a barcode gets a generated one that can be printed with its dates. */
function FamilyReceipt({ code, branch, cashierName, rows, done }: { code: string; branch: string; cashierName: string; rows: Row[]; done: () => void }) {
  const { d, prices, setPrice, addRecord, log } = useDemo();
  const toast = useToast();
  const [family, setFamily] = useState(String(d.families[0].name));
  const [scan, setScan] = useState("");
  const [sku, setSku] = useState("");
  const [fresh, setFresh] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("علبة");
  const [barcode, setBarcode] = useState("");
  const [qty, setQty] = useState("10");
  const [cost, setCost] = useState("");
  const [sellNew, setSellNew] = useState("");
  const [produced, setProduced] = useState(today());
  const [expiry, setExpiry] = useState(d.day(5));
  const [label, setLabel] = useState<Row | null>(null);
  const product = d.products.find(item => item.sku === sku);
  const sell = product ? prices[branch]?.[product.sku] ?? product.price : amount(sellNew);
  const familyRow = d.families.find(row => row.name === family);
  const shelfDays = Math.round((Date.parse(expiry) - Date.parse(produced)) / 86400000);
  const generated = () => `29${String(100000000 + d.products.length * 7 + rows.length).padStart(11, "0")}`;
  function find() {
    const value = scan.trim(); const key = digits(value) === value.replace(/\s/g, "") ? digits(value) : value.toLowerCase();
    const found = d.products.find(item => item.barcode === key || item.sku.toLowerCase() === key || item.name === value);
    if (found) { setSku(found.sku); setFresh(false); setBarcode(found.barcode); toast(`الصنف ${found.name} وباركوده ${found.barcode}`); return; }
    // An unknown code starts a new family item: a scanned barcode is kept, otherwise one is generated.
    setSku(""); setFresh(true); setName(/^\d+$/.test(key) ? "" : value); setBarcode(/^\d{8,14}$/.test(key) ? key : generated());
    toast(/^\d{8,14}$/.test(key) ? "باركود جديد وسيسجل الصنف به" : "الصنف بلا باركود وتم توليد باركود افتراضي له");
  }
  function noBarcode() { setSku(""); setFresh(true); setScan(""); setBarcode(generated()); toast("تم توليد باركود افتراضي للصنف"); }
  function receive() {
    const count = amount(qty); const price = amount(cost);
    if (!product && !fresh) return toast("امسح باركود الصنف أو اكتب رقمه أولًا");
    if (fresh && name.trim().length < 2) return toast("اكتب اسم الصنف الجديد");
    if (count <= 0 || price <= 0) return toast("اكتب الكمية وسعر الأسرة");
    if (sell <= 0 || price >= sell) return toast("سعر الأسرة يجب أن يكون أقل من سعر البيع في الفرع");
    if (!(shelfDays > 0) || expiry <= today()) return toast("تاريخ الانتهاء يجب أن يكون بعد تاريخ الإنتاج وبعد اليوم");
    const no = `FRC-${String(421 + rows.length).padStart(5, "0")}`;
    let item = product;
    if (!item) {
      item = { id: `p-fam-${d.products.length}`, image: "", name: name.trim(), category: "حلويات شرقية", unit, price: sell, cost: price, shelf: shelfDays, sku: `FAM-${1001 + d.products.length}`, barcode, sold: 0 };
      d.products.unshift(item); const created = item;
      d.branches.forEach(row => { d.branchStock[row.name][created.sku] = 0; });
      setPrice(branch, item.sku, sell);
    }
    d.branchStock[branch][item.sku] = (d.branchStock[branch][item.sku] ?? 0) + count;
    const row: Row = { id: `fr-${code}-${rows.length}`, point: code, no, date: today(), family, product: item.name, sku: item.sku, barcode: item.barcode, lot: `FL-${produced.slice(2).replaceAll("-", "")}-${String(rows.length + 1).padStart(2, "0")}`, qty: count, unit: item.unit, cost: price, sell, total: Math.round(count * price * 100) / 100, produced, expiry, cashier: cashierName, status: "مستلم" };
    addRecord("family", row);
    log(`استلام ${n(count)} ${item.unit} ${item.name} من ${family} في ${branch} بسند ${no} وينتهي ${expiry}`);
    toast(`استُلمت البضاعة بسند ${no} وأضيفت لمخزن الفرع`);
    setLabel(row); setCost(""); setScan(""); setSku(item.sku); setFresh(false); done();
  }
  function print(row: Row) { setLabel(row); log(`طباعة ${String(row.qty)} ملصق باركود للصنف ${String(row.product)}`); toast(`أُرسل ${String(row.qty)} ملصق باركود للطابعة`); }
  return <div className={s.grid2}>
    <section className={s.panel}><div className={s.panelHead}><h2>استلام منتجات أسرة منتجة</h2><span>بالباركود أو رقم الصنف وتضاف لمخزن الفرع</span></div><div className={s.panelBody}>
      <form className={c.scan} onSubmit={event => { event.preventDefault(); find(); }}><ScanLine size={18} aria-hidden="true" /><input value={scan} onChange={event => setScan(event.target.value)} placeholder="امسح الباركود أو اكتب رقم الصنف ثم Enter" aria-label="باركود أو رقم الصنف المستلم" /><button type="submit" className={s.ghost}>بحث</button><button type="button" className={s.ghost} onClick={noBarcode}>صنف بلا باركود</button></form>
      {(product || fresh) && <div className={c.found}>
        <Thumb name={product?.name ?? name} size={64} />
        <div><strong>{product ? product.name : "صنف جديد من الأسرة"}</strong><small>{product ? <>رقم الصنف <bdi>{product.sku}</bdi></> : "يسجل في المنتجات عند الاستلام"}</small></div>
        <div className={c.foundCode}><Bars value={barcode} /><bdi>{barcode}</bdi><small>{product ? "باركود الصنف" : "باركود افتراضي يمكن طباعته"}</small></div>
      </div>}
      <div className={s.form} style={{ marginTop: 14 }}>
        <label>الأسرة المنتجة<select value={family} onChange={event => setFamily(event.target.value)}>{d.families.map(row => <option key={row.id}>{String(row.name)}</option>)}</select></label>
        {fresh && <label>اسم الصنف<input value={name} maxLength={50} placeholder="مثال: معمول منزلي" onChange={event => setName(event.target.value)} /></label>}
        {fresh && <label>الوحدة<select value={unit} onChange={event => setUnit(event.target.value)}>{["علبة", "كجم", "قطعة", "صينية"].map(option => <option key={option}>{option}</option>)}</select></label>}
        <label>الكمية المستلمة<input value={qty} inputMode="decimal" dir="ltr" onChange={event => setQty(event.target.value)} /></label>
        <label>سعر الأسرة للوحدة<input value={cost} inputMode="decimal" dir="ltr" placeholder={sell ? `أقل من ${sell}` : "سعر الشراء من الأسرة"} onChange={event => setCost(event.target.value)} /></label>
        {fresh && <label>سعر البيع في الفرع<input value={sellNew} inputMode="decimal" dir="ltr" onChange={event => setSellNew(event.target.value)} /></label>}
        <label>تاريخ الإنتاج<input type="date" lang="en" value={produced} max={today()} onChange={event => setProduced(event.target.value)} /></label>
        <label>تاريخ الانتهاء<input type="date" lang="en" value={expiry} min={today()} onChange={event => setExpiry(event.target.value)} /></label>
      </div>
      <div className={s.chips} role="group" aria-label="مدة صلاحية سريعة" style={{ marginTop: 10 }}>{[3, 7, 14, 30, 90].map(days => <button type="button" key={days} aria-pressed={shelfDays === days} onClick={() => setExpiry(new Intl.DateTimeFormat("en-CA").format(new Date(Date.parse(produced) + days * 86400000)))}>صلاحية <bdi>{days}</bdi> يوم</button>)}</div>
      <dl className={s.fields} style={{ marginTop: 14 }}><div><dt>مدة الصلاحية</dt><dd>{shelfDays > 0 ? <><bdi>{shelfDays}</bdi> يوم</> : "حدد التاريخين"}</dd></div><div><dt>سعر البيع في الفرع</dt><dd><bdi>{sar(sell)}</bdi></dd></div><div><dt>عمولة الديم المتفق عليها</dt><dd><bdi>{String(familyRow?.commission ?? "15%")}</bdi></dd></div><div><dt>مستحق الأسرة عن هذا الاستلام</dt><dd><bdi>{sar(amount(qty) * amount(cost))}</bdi></dd></div></dl>
      <div className={s.actions} style={{ marginTop: 14 }}><button type="button" className={s.primary} onClick={receive}><HandHeart size={16} aria-hidden="true" />استلام وإضافة للمخزن</button></div>
    </div></section>
    <div>
      {label && <section className={c.label}>
        <header><strong>{String(label.product)}</strong><small>{String(label.family)}</small></header>
        <Bars value={String(label.barcode)} /><bdi>{String(label.barcode)}</bdi>
        <dl><div><dt>رقم الصنف</dt><dd><bdi>{String(label.sku)}</bdi></dd></div><div><dt>التشغيلة</dt><dd><bdi>{String(label.lot)}</bdi></dd></div><div><dt>الإنتاج</dt><dd><bdi>{String(label.produced)}</bdi></dd></div><div><dt>الانتهاء</dt><dd><bdi>{String(label.expiry)}</bdi></dd></div><div><dt>السعر</dt><dd><bdi>{sar(Number(label.sell))}</bdi></dd></div></dl>
        <button type="button" className={s.primary} onClick={() => print(label)}><Printer size={15} aria-hidden="true" />طباعة <bdi>{String(label.qty)}</bdi> ملصق باركود</button>
      </section>}
      <section className={s.panel} style={{ marginTop: label ? 20 : 0 }}><div className={s.panelHead}><h2>سندات الاستلام في هذه الوردية</h2><span><bdi>{rows.length}</bdi> سند</span></div><div className={s.tableWrap}><table className={s.table}><thead><tr><th>السند</th><th>الأسرة</th><th>المنتج</th><th>الباركود</th><th>الكمية</th><th>مستحق الأسرة</th><th>الانتهاء</th><th></th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><bdi className={s.code}>{String(row.no)}</bdi></td><td>{String(row.family)}</td><td><strong>{String(row.product)}</strong></td><td><bdi className={s.code}>{String(row.barcode)}</bdi></td><td><bdi className={s.num}>{String(row.qty)}</bdi> {String(row.unit)}</td><td><bdi className={s.num}>{sar(Number(row.total))}</bdi></td><td><bdi className={s.num}>{String(row.expiry)}</bdi></td><td><button type="button" className={s.ghost} onClick={() => print(row)}><Printer size={14} aria-hidden="true" />باركود</button></td></tr>)}</tbody></table>{rows.length === 0 && <p className={s.empty}>لم تستلم بضاعة من الأسر في هذه الوردية بعد</p>}</div></section>
    </div>
  </div>;
}
