"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, BadgeCheck, CreditCard, FileText, PackagePlus, Save, Search, Trash2, UserRound } from "lucide-react";
import { money, type Row } from "./data";
import { Badge, Thumb, today, useToast } from "./kit";
import { useDemo } from "./store";
import s from "./demo.module.css";

type Line = { sku: string; name: string; unit: string; price: number; qty: number; discount: number };
const TIER_X: Record<string, number> = { "برونزي": 1, "فضي": 1.25, "ذهبي": 1.5, "بلاتيني": 2 };
const POINT_VALUE = 0.1;
const METHODS = ["مدى", "نقدي", "فيزا", "Apple Pay", "تحويل بنكي", "آجل"];
const n = (value: number) => Math.round(value).toLocaleString("en-US");
const num = (value: string) => { const parsed = Number(value.replace(/[٠-٩]/g, char => String("٠١٢٣٤٥٦٧٨٩".indexOf(char)))); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; };
const round = (value: number) => Math.round(value * 100) / 100;

function Block({ icon, title, hint, children }: { icon: ReactNode; title: string; hint: string; children: ReactNode }) {
  return <section className={s.rule}><div className={s.ruleHead}><span>{icon}</span><div><strong>{title}</strong><small>{hint}</small></div></div><div className={s.ruleBody}>{children}</div></section>;
}

/** Sales invoice builder: customer, items at the branch price, discounts, points, payment and a live printed preview. */
export function InvoiceForm({ back }: { back: () => void }) {
  const { d, prices, records, addRecord, log } = useDemo();
  const toast = useToast();
  const [branch, setBranch] = useState(d.branches[0].name);
  const [kind, setKind] = useState("نقطة بيع");
  const [date, setDate] = useState(today());
  const [due, setDue] = useState(d.day(14));
  const [customerId, setCustomerId] = useState("");
  const [find, setFind] = useState("");
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [delivery, setDelivery] = useState("0");
  const [discountPct, setDiscountPct] = useState("0");
  const [redeem, setRedeem] = useState(0);
  const [method, setMethod] = useState("مدى");
  const [paidNow, setPaidNow] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState("");
  const customer = d.customers.find(row => row.id === customerId) ?? null;
  const number = `INV-${String(48211 + records.sale.length).padStart(5, "0")}`;
  const priceOf = (sku: string, base: number) => prices[branch]?.[sku] ?? base;
  const needle = query.trim().toLowerCase();
  const matches = needle ? d.products.filter(product => product.name.toLowerCase().includes(needle) || product.sku.toLowerCase().includes(needle) || product.barcode.includes(needle)).slice(0, 6) : [];
  const people = find.trim() ? d.customers.filter(row => String(row.name).includes(find.trim()) || String(row.phone).includes(find.trim())).slice(0, 5) : [];
  function add(sku: string) {
    const product = d.products.find(item => item.sku === sku); if (!product) return;
    setLines(current => current.some(line => line.sku === sku) ? current.map(line => line.sku === sku ? { ...line, qty: line.qty + 1 } : line) : [...current, { sku, name: product.name, unit: product.unit, price: priceOf(sku, product.price), qty: 1, discount: 0 }]);
    setQuery("");
  }
  const patch = (sku: string, next: Partial<Line>) => setLines(current => current.map(line => line.sku === sku ? { ...line, ...next } : line));
  const gross = lines.reduce((total, line) => total + line.qty * line.price, 0);
  const lineDiscount = lines.reduce((total, line) => total + line.qty * line.price * line.discount / 100, 0);
  const afterLines = gross - lineDiscount;
  const invoiceDiscount = afterLines * Math.min(100, num(discountPct)) / 100;
  const balance = customer ? Number(customer.points) : 0;
  const maxRedeem = customer ? Math.max(0, Math.min(Math.floor(balance / 10) * 10, Math.floor((afterLines - invoiceDiscount) / POINT_VALUE / 10) * 10)) : 0;
  const redeemed = Math.min(redeem, maxRedeem);
  const taxable = afterLines - invoiceDiscount - redeemed * POINT_VALUE + num(delivery);
  const vat = taxable * 0.15;
  const total = round(taxable + vat);
  const paid = method === "آجل" ? 0 : paidNow.trim() ? Math.min(total, num(paidNow)) : total;
  const status = paid >= total ? "مدفوعة" : paid > 0 ? "مدفوعة جزئيًا" : "آجلة";
  const earned = customer ? Math.floor((taxable - num(delivery)) * (TIER_X[String(customer.tier)] ?? 1)) : 0;

  function issue() {
    if (!lines.length) return toast("أضف صنفًا واحدًا على الأقل");
    if (status !== "مدفوعة" && !customer) return toast("الفاتورة الآجلة أو المدفوعة جزئيًا تحتاج عميلًا مسجلًا");
    const short = lines.find(line => (d.branchStock[branch]?.[line.sku] ?? 0) < line.qty);
    if (short) return toast(`رصيد ${short.name} في ${branch} أقل من الكمية المطلوبة`);
    const row: Row = { id: `sale-${records.sale.length}`, type: kind, no: number, date, customer: customer ? String(customer.name) : "عميل نقدي", branch, cashier: "مالك الحساب", method, items: lines.length, total, paid, status, lines: lines.map(line => ({ name: line.name, qty: line.qty, unit: line.unit, price: round(line.price * (1 - line.discount / 100)) })) };
    addRecord("sale", row);
    lines.forEach(line => { d.branchStock[branch][line.sku] = Math.max(0, (d.branchStock[branch][line.sku] ?? 0) - line.qty); });
    if (customer) {
      Object.assign(customer, { points: balance - redeemed + earned, earnedOwn: Number(customer.earnedOwn ?? 0) + earned, redeemedOwn: Number(customer.redeemedOwn ?? 0) + redeemed, spent: Number(customer.spent ?? 0) + total, balance: Number(customer.balance ?? 0) + (total - paid), lastVisit: today() });
      const base = { date: today(), customer: String(customer.name), customerId: customer.id, tier: String(customer.tier), placeType: "فروعنا", place: branch, invoice: number };
      if (redeemed) d.pointsLedger.unshift({ ...base, id: `pm-r-${number}`, kind: "استبدال", basis: "خصم من الفاتورة", points: -redeemed, status: "مستبدلة" });
      if (earned) d.pointsLedger.unshift({ ...base, id: `pm-e-${number}`, kind: "اكتساب", basis: "قيمة الفاتورة", points: earned, status: "مضافة" });
    }
    log(`إصدار الفاتورة ${number} من ${branch} بقيمة ${n(total)} ر.س وحالتها ${status}`);
    toast(`صدرت الفاتورة ${number} وأضيفت إلى السجل`);
    back();
  }

  return <>
    <button type="button" className={s.back} onClick={back}><ArrowRight size={16} aria-hidden="true" />العودة إلى فواتير المبيعات</button>
    <div className={s.split}>
      <div>
        <Block icon={<FileText size={20} aria-hidden="true" />} title="بيانات الفاتورة" hint="الفرع يحدد المخزن الذي يصرف منه والسعر الذي يباع به">
          <div className={s.form}>
            <label>رقم الفاتورة<input value={number} readOnly dir="ltr" /></label>
            <label>الفرع<select value={branch} onChange={event => { const next = event.target.value; setBranch(next); setLines(current => current.map(line => ({ ...line, price: prices[next]?.[line.sku] ?? line.price }))); }}>{d.branches.map(item => <option key={item.id}>{item.name}</option>)}</select></label>
            <label>تصنيف الفاتورة<select value={kind} onChange={event => setKind(event.target.value)}><option>نقطة بيع</option><option>مناسبات وشركات</option></select></label>
            <label>تاريخ الفاتورة<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
            <label>تاريخ الاستحقاق<input type="date" value={due} onChange={event => setDue(event.target.value)} /></label>
          </div>
        </Block>
        <Block icon={<UserRound size={20} aria-hidden="true" />} title="العميل" hint="ابحث بالاسم أو رقم الجوال أو اتركه فارغًا لعميل نقدي">
          {customer ? <div className={s.pickCustomer}><div><strong>{String(customer.name)}</strong><small><bdi>{String(customer.phone)}</bdi> · فئة {String(customer.tier)}</small></div><span><bdi>{n(balance)}</bdi> نقطة</span><span>رصيد آجل <bdi>{money(Number(customer.balance))}</bdi></span><button type="button" className={s.ghost} onClick={() => { setCustomerId(""); setRedeem(0); }}>تغيير</button></div>
            : <><label className={s.search}><Search size={16} aria-hidden="true" /><input value={find} onChange={event => setFind(event.target.value)} placeholder="اسم العميل أو رقم جواله" aria-label="بحث عن عميل" /></label>
              {people.length > 0 && <div className={s.pickList}>{people.map(row => <button type="button" key={row.id} onClick={() => { setCustomerId(row.id); setFind(""); }}><strong>{String(row.name)}</strong><bdi>{String(row.phone)}</bdi><Badge>{String(row.tier)}</Badge></button>)}</div>}</>}
          {customer && maxRedeem >= 10 && <div className={s.inline} style={{ marginTop: 12 }}>استبدال<input type="range" min={0} max={maxRedeem} step={10} value={redeemed} onChange={event => setRedeem(Number(event.target.value))} aria-label="النقاط المستبدلة" style={{ width: 180, accentColor: "var(--p)" }} /><bdi>{n(redeemed)}</bdi> نقطة بخصم <bdi>{money(redeemed * POINT_VALUE)}</bdi></div>}
        </Block>
        <Block icon={<PackagePlus size={20} aria-hidden="true" />} title="الأصناف" hint="امسح الباركود أو اكتب اسم الصنف والسعر يأتي من سعر الفرع ويمكن تعديله">
          <form onSubmit={event => { event.preventDefault(); if (matches[0]) add(matches[0].sku); }}><label className={s.search}><Search size={16} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="اسم الصنف أو رقمه أو الباركود ثم Enter" aria-label="إضافة صنف" /></label></form>
          {matches.length > 0 && <div className={s.pickList}>{matches.map(product => <button type="button" key={product.sku} onClick={() => add(product.sku)}><Thumb name={product.name} size={36} /><strong>{product.name}</strong><bdi>{money(priceOf(product.sku, product.price))}</bdi><span>متاح <bdi>{d.branchStock[branch]?.[product.sku] ?? 0}</bdi></span></button>)}</div>}
          <div className={s.tableWrap} style={{ marginTop: 12 }}><table className={s.table}><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>خصم %</th><th>الإجمالي</th><th>المتاح</th><th></th></tr></thead><tbody>{lines.map(line => { const left = d.branchStock[branch]?.[line.sku] ?? 0; return <tr key={line.sku}>
            <td><Thumb name={line.name} size={38} /> <strong>{line.name}</strong></td>
            <td><input className={s.cellInput} value={line.qty} inputMode="decimal" dir="ltr" aria-label={`كمية ${line.name}`} onChange={event => patch(line.sku, { qty: num(event.target.value) })} /> {line.unit}</td>
            <td><input className={s.cellInput} value={line.price} inputMode="decimal" dir="ltr" aria-label={`سعر ${line.name}`} onChange={event => patch(line.sku, { price: num(event.target.value) })} /></td>
            <td><input className={s.cellInput} value={line.discount} inputMode="decimal" dir="ltr" aria-label={`خصم ${line.name}`} onChange={event => patch(line.sku, { discount: Math.min(100, num(event.target.value)) })} /></td>
            <td><bdi className={s.num}>{money(line.qty * line.price * (1 - line.discount / 100))}</bdi></td>
            <td><span className={`${s.badge} ${left < line.qty ? s.bad : s.good}`}><bdi>{left}</bdi></span></td>
            <td><button type="button" className={s.icon} onClick={() => setLines(current => current.filter(item => item.sku !== line.sku))} aria-label={`حذف ${line.name}`}><Trash2 size={15} aria-hidden="true" /></button></td>
          </tr>; })}</tbody></table>{lines.length === 0 && <p className={s.empty}>ابحث عن صنف لإضافته إلى الفاتورة</p>}</div>
        </Block>
        <Block icon={<CreditCard size={20} aria-hidden="true" />} title="الخصم والتوصيل والدفع" hint="الدفع الجزئي يسجل الباقي على رصيد العميل">
          <div className={s.form}>
            <label>خصم على الفاتورة %<input value={discountPct} inputMode="decimal" dir="ltr" onChange={event => setDiscountPct(event.target.value)} /></label>
            <label>رسوم التوصيل<input value={delivery} inputMode="decimal" dir="ltr" onChange={event => setDelivery(event.target.value)} /></label>
            <label>المدفوع الآن<input value={method === "آجل" ? "0" : paidNow} disabled={method === "آجل"} inputMode="decimal" dir="ltr" placeholder={String(total)} onChange={event => setPaidNow(event.target.value)} /></label>
            <label>ملاحظات تظهر على الفاتورة<input value={notes} maxLength={80} onChange={event => setNotes(event.target.value)} /></label>
          </div>
          <div className={s.chips} role="group" aria-label="طريقة الدفع" style={{ marginTop: 12 }}>{METHODS.map(name => <button type="button" key={name} aria-pressed={method === name} onClick={() => setMethod(name)}>{name}</button>)}</div>
        </Block>
        {draft && <p className={s.note}>{draft}</p>}
        <div className={s.actions} style={{ marginTop: 16 }}><button type="button" className={s.primary} onClick={issue}><BadgeCheck size={16} aria-hidden="true" />إصدار الفاتورة <bdi>{money(total)}</bdi></button><button type="button" className={s.ghost} onClick={() => { setDraft(`حُفظت المسودة ${number} الساعة ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date())} ويمكنك إكمالها`); log(`حفظ مسودة الفاتورة ${number}`); toast("حُفظت الفاتورة كمسودة"); }}><Save size={15} aria-hidden="true" />حفظ كمسودة</button></div>
      </div>
      <aside className={s.paper} aria-label="معاينة الفاتورة">
        <header><div><strong>الديم للحلويات</strong><small>{branch} · فاتورة ضريبية</small></div><Badge>{status}</Badge></header>
        <dl><div><dt>رقم الفاتورة</dt><dd><bdi>{number}</bdi></dd></div><div><dt>التاريخ</dt><dd><bdi>{date}</bdi></dd></div><div><dt>العميل</dt><dd>{customer ? String(customer.name) : "عميل نقدي"}</dd></div><div><dt>الاستحقاق</dt><dd><bdi>{status === "مدفوعة" ? date : due}</bdi></dd></div></dl>
        <table><thead><tr><th>الصنف</th><th>الكمية</th><th>الإجمالي</th></tr></thead><tbody>{lines.map(line => <tr key={line.sku}><td>{line.name}{line.discount > 0 && <small> خصم <bdi>{line.discount}%</bdi></small>}</td><td><bdi>{line.qty}</bdi></td><td><bdi>{money(line.qty * line.price * (1 - line.discount / 100))}</bdi></td></tr>)}{lines.length === 0 && <tr><td colSpan={3}>لم تضف أصناف بعد</td></tr>}</tbody></table>
        <dl>
          <div><dt>المجموع</dt><dd><bdi>{money(gross)}</bdi></dd></div>
          {lineDiscount + invoiceDiscount > 0 && <div><dt>الخصومات</dt><dd><bdi>- {money(lineDiscount + invoiceDiscount)}</bdi></dd></div>}
          {redeemed > 0 && <div><dt>استبدال <bdi>{n(redeemed)}</bdi> نقطة</dt><dd><bdi>- {money(redeemed * POINT_VALUE)}</bdi></dd></div>}
          {num(delivery) > 0 && <div><dt>التوصيل</dt><dd><bdi>{money(num(delivery))}</bdi></dd></div>}
          <div><dt>ضريبة القيمة المضافة 15%</dt><dd><bdi>{money(vat)}</bdi></dd></div>
          <div className={s.paperTotal}><dt>الإجمالي</dt><dd><bdi>{money(total)}</bdi></dd></div>
          <div><dt>المدفوع {method}</dt><dd><bdi>{money(paid)}</bdi></dd></div>
          {total - paid > 0 && <div><dt>المتبقي على العميل</dt><dd><bdi>{money(total - paid)}</bdi></dd></div>}
        </dl>
        {customer && lines.length > 0 && <p className={s.paperNote}>يكسب العميل <bdi>{n(earned)}</bdi> نقطة بهذه الفاتورة</p>}
        {notes && <p className={s.paperNote}>{notes}</p>}
        <div className={s.paperCode} aria-hidden="true">{Array.from({ length: 81 }, (_, index) => <i key={index} className={(number.charCodeAt(index % number.length) * (index + 3) + Math.round(total)) % 3 ? s.paperDot : ""} />)}</div>
        <small>شكل توضيحي لرمز الفاتورة الإلكترونية</small>
      </aside>
    </div>
  </>;
}
