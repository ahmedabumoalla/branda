"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Banknote, Boxes, ChartNoAxesCombined, Download, FileSpreadsheet, Landmark, Mail, PackageSearch, Percent, Printer, Receipt, Scale, Store, TrendingDown, TrendingUp, Users, Wallet, type LucideIcon } from "lucide-react";
import { sum } from "./data";
import { Badge, today, useToast } from "./kit";
import { useDemo } from "./store";
import s from "./demo.module.css";
import r from "./reports.module.css";

type Data = ReturnType<typeof useDemo>["d"];
type Kind = "sar" | "n" | "pct";

const PERIODS = [
  { id: "day", label: "اليوم", prev: "أمس", factor: 1 / 330, buckets: 16 },
  { id: "week", label: "هذا الأسبوع", prev: "الأسبوع الماضي", factor: 7 / 330, buckets: 7 },
  { id: "month", label: "هذا الشهر", prev: "الشهر الماضي", factor: 1 / 11.4, buckets: 30 },
  { id: "quarter", label: "هذا الربع", prev: "الربع السابق", factor: 0.262, buckets: 13 },
  { id: "year", label: "هذه السنة", prev: "السنة الماضية", factor: 1, buckets: 12 },
];
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
// Hourly sales shape from 8 in the morning to 11 at night: sweets sell after the afternoon prayer and peak in the evening.
const HOURS = [2, 3, 4, 5, 6, 6, 5, 5, 6, 8, 10, 12, 13, 12, 9, 5];
const AGE_LABELS = ["0 - 30 يوم", "31 - 60 يوم", "61 - 90 يوم", "أكثر من 90 يوم"];
const AGE_PATTERNS = [[1, 0, 0, 0], [0.7, 0.3, 0, 0], [0.55, 0.25, 0.2, 0], [0.4, 0.3, 0.2, 0.1], [0.2, 0.5, 0.3, 0], [0.6, 0.2, 0.1, 0.1]];

// Small amounts keep their halalas; totals read as whole riyals.
const sar = (value: number) => Math.abs(value) < 1000 ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(value).toLocaleString("en-US");
const num = (value: number) => Math.round(value).toLocaleString("en-US");
const pct = (value: number) => `${value.toFixed(1)}%`;
const fmt = (kind: Kind, value: number) => kind === "sar" ? `${sar(value)} ر.س` : kind === "pct" ? pct(value) : num(value);
const add = <T,>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);
// Stable fingerprint so the previous-period comparison never changes between renders.
const hash = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };

/** One model feeds every report, so the same figure reads the same wherever it appears. */
function build(d: Data, periodId: string, branch: string) {
  const period = PERIODS.find(item => item.id === periodId) ?? PERIODS[2];
  const acc = (code: string) => Number(d.accounts.find(row => row.code === code)?.balance ?? 0);
  const was = (key: string, value: number) => value / (1 + (hash(`${key}|${periodId}|${branch}`) % 260 - 70) / 1000);
  const centres = d.costCenters.filter(row => row.kind === "فرع");
  const centreRevenue = sum(centres, "revenue") || 1;
  const shareOf = (index: number) => Number(centres[index]?.revenue ?? 0) / centreRevenue;
  const branchIndex = d.branches.findIndex(item => String(item.name) === branch);
  const share = branchIndex >= 0 ? shareOf(branchIndex) : 1;
  const k = period.factor * share;

  const priceWeight = d.products.reduce((total, p) => total + Number(p.sold) * Number(p.price), 0) || 1;
  const costRatio = d.products.reduce((total, p) => total + Number(p.sold) * Number(p.cost), 0) / priceWeight;
  const opexBase: [string, number][] = [["الرواتب والأجور", acc("52")], ["الإيجارات", acc("53")], ["الكهرباء والمياه", acc("54")], ["التسويق والولاء", acc("55")], ["الصيانة", acc("15") * 0.01], ["النقل والتوزيع", (acc("41") + acc("42")) * 0.011], ["الإهلاك", acc("56")]];
  const pnl = (factor: number) => {
    const sales = (acc("41") + acc("42")) * factor; const franchise = acc("43") * factor; const revenue = sales + franchise; const cogs = sales * costRatio;
    const opex = opexBase.map(([name, value]) => ({ name, value: value * factor })); const opexTotal = add(opex, row => row.value);
    const grossProfit = revenue - cogs; const operating = grossProfit - opexTotal; const zakat = Math.max(0, operating * 0.025);
    return { sales, franchise, revenue, cogs, opex, opexTotal, grossProfit, operating, zakat, net: operating - zakat };
  };
  const now = pnl(k); const entity = pnl(period.factor); const year = pnl(1);

  // sales
  const sales = now.sales; const vat = sales * 0.15; const gross = sales + vat;
  const ticket = sum(d.invoices, "total") / (d.invoices.length || 1) || 1;
  const invoices = Math.max(1, Math.round(gross / ticket));
  const items = d.products.map((p, i) => {
    const revenue = sales * Number(p.sold) * Number(p.price) / priceWeight; const qty = revenue / Number(p.price); const cost = qty * Number(p.cost);
    return { name: String(p.name), sku: String(p.sku), category: String(p.category), unit: String(p.unit), qty, revenue, cost, profit: revenue - cost, margin: (1 - Number(p.cost) / Number(p.price)) * 100, share: revenue / (sales || 1) * 100, days: Math.max(1, Math.round(Number(p.shelf) * 0.3) + i % 4) };
  }).sort((a, b) => b.revenue - a.revenue);
  const units = add(items, row => row.qty);
  const categories = Array.from(new Set(items.map(row => row.category))).map(name => { const rows = items.filter(row => row.category === name); return { name, value: add(rows, row => row.revenue), profit: add(rows, row => row.profit), qty: add(rows, row => row.qty), items: rows.length }; }).sort((a, b) => b.value - a.value);
  const wholesale = acc("42") / ((acc("41") + acc("42")) || 1);
  const channelShares: [string, number][] = [["نقطة بيع", (1 - wholesale) * 0.8], ["جملة ومناسبات", wholesale], ["تطبيق وتوصيل", (1 - wholesale) * 0.13], ["معمل", (1 - wholesale) * 0.07]];
  const channels = channelShares.map(([name, part]) => ({ name, value: sales * part, invoices: Math.max(1, Math.round(invoices * part * (name === "جملة ومناسبات" ? 0.18 : 1.12))) }));
  const scoped = d.invoices.filter(row => branchIndex < 0 || row.branch === branch); const pool = scoped.length ? scoped : d.invoices; const poolTotal = sum(pool, "total") || 1;
  const methods = Array.from(new Set(pool.map(row => String(row.method)))).map(name => { const rows = pool.filter(row => row.method === name); return { name, value: gross * sum(rows, "total") / poolTotal, invoices: Math.max(1, Math.round(invoices * rows.length / pool.length)) }; }).sort((a, b) => b.value - a.value);
  const weights = Array.from({ length: period.buckets }, (_, i) => periodId === "day" ? HOURS[i] : Number(d.daily[(i * 5 + 3) % d.daily.length].total));
  const weightSum = add(weights, value => value) || 1;
  const trend = weights.map((weight, i) => ({ label: periodId === "day" ? `${8 + i}:00` : periodId === "week" ? DAYS[i] : periodId === "year" ? MONTHS[i] : String(i + 1), value: sales * weight / weightSum }));
  const hourSum = add(HOURS, value => value); const hourMax = Math.max(...HOURS);
  const hours = HOURS.map((weight, i) => ({ label: String(8 + i), value: sales * weight / hourSum, level: weight / hourMax }));
  const customerPool = d.customers.filter(row => branchIndex < 0 || row.branch === branch);
  const customers = [...customerPool].sort((a, b) => Number(b.spent) - Number(a.spent)).slice(0, 8).map(row => ({ name: String(row.name), phone: String(row.phone), tier: String(row.tier), visits: Math.max(1, Math.round(Number(row.visits) * period.factor)), value: Number(row.spent) * period.factor, points: Number(row.points) }));
  const allCashiers = d.employees.filter(row => row.job === "كاشير"); const branchCashiers = allCashiers.filter(row => branchIndex < 0 || row.branch === branch); const cashierPool = branchCashiers.length ? branchCashiers : allCashiers;
  const cashierWeights = cashierPool.map(row => 1 + hash(String(row.name)) % 60 / 100); const cashierSum = add(cashierWeights, value => value) || 1;
  const cashiers = cashierPool.map((row, i) => { const value = channels[0].value * cashierWeights[i] / cashierSum; const basket = ticket * (0.9 + hash(String(row.code)) % 22 / 100); return { name: String(row.name), branch: String(row.branch), value, invoices: Math.max(1, Math.round(value * 1.15 / basket)), basket: value * 1.15 / Math.max(1, Math.round(value * 1.15 / basket)) }; }).sort((a, b) => b.value - a.value);
  const returnRate = Math.min(0.03, sum(d.salesReturns, "total") / (sum(d.invoices, "total") || 1) / 6);
  const returns = sales * returnRate; const discounts = gross * 0.021; const pointsValue = sales * 0.008;

  // stock, taken from the same lots the warehouse pages show
  const stockRows = d.warehouses.map(w => { const lots = d.lots.filter(lot => lot.warehouse === w.id); const value = (state: string) => add(lots.filter(lot => lot.state === state), lot => lot.qty * lot.cost); return { name: w.name, kind: w.kind, lots: lots.length, good: value("صالح"), near: value("قريب الانتهاء"), expired: value("منتهي"), damaged: value("تالف") }; });
  const stock = { good: add(stockRows, row => row.good), near: add(stockRows, row => row.near), expired: add(stockRows, row => row.expired), damaged: add(stockRows, row => row.damaged) };
  const stockValue = stock.good + stock.near;
  const live = d.lots.filter(lot => lot.state === "صالح" || lot.state === "قريب الانتهاء");
  const stockCategories = Array.from(new Set(live.map(lot => lot.category))).map(name => ({ name, value: add(live.filter(lot => lot.category === name), lot => lot.qty * lot.cost) })).sort((a, b) => b.value - a.value);
  const stockItems = Array.from(new Set(live.map(lot => lot.item))).map(name => { const lots = live.filter(lot => lot.item === name); return { name, unit: lots[0].unit, qty: add(lots, lot => lot.qty), value: add(lots, lot => lot.qty * lot.cost), lots: lots.length, nearest: Math.min(...lots.map(lot => lot.daysLeft)) }; }).sort((a, b) => b.value - a.value).slice(0, 10);
  const turnover = year.cogs / (stockValue || 1);

  // financial position: the balancing figure is the profit already paid out to the owners
  const cash = sum(d.treasuries, "balance"); const receivable = acc("12"); const fixed = acc("15"); const assets = cash + receivable + stockValue + fixed;
  const payable = acc("21"); const vatDue = acc("22"); const wages = acc("23"); const liabilities = payable + vatDue + wages;
  const capital = acc("31"); const retained = acc("32"); const dividends = assets - liabilities - capital - retained - year.net; const equity = capital + retained + year.net + dividends;

  // ageing
  const age = (rows: { name: string; note: string; weight: number }[], total: number) => { const all = add(rows, row => row.weight) || 1; return rows.map(row => { const amount = total * row.weight / all; return { name: row.name, note: row.note, amount, buckets: AGE_PATTERNS[hash(row.name) % AGE_PATTERNS.length].map(part => amount * part) }; }).sort((a, b) => b.amount - a.amount); };
  const debtors = age(d.customers.filter(row => Number(row.balance) > 0).map(row => ({ name: String(row.name), note: String(row.phone), weight: Number(row.balance) })), receivable);
  const creditors = age(Array.from(new Set(d.purchaseInvoices.map(row => String(row.supplier)))).map(name => { const rows = d.purchaseInvoices.filter(row => row.supplier === name); return { name, note: `${rows.length} فاتورة مشتريات`, weight: sum(rows, "total") }; }), payable);

  // cash flow
  const operatingFlow: [string, number][] = [["صافي الربح", now.net], ["يضاف الإهلاك", acc("56") * k], ["الزيادة في المدينين", -receivable * 0.15 * k], ["الزيادة في المخزون", -stockValue * 0.07 * k], ["الزيادة في الدائنين", payable * 0.09 * k], ["الزيادة في الضريبة والرواتب المستحقة", (vatDue + wages) * 0.05 * k]];
  const investingFlow: [string, number][] = [["شراء معدات وتجهيز فروع", -fixed * 0.074 * k], ["بيع أصول مستبعدة", fixed * 0.004 * k]];
  const financingFlow: [string, number][] = [[dividends <= 0 ? "توزيعات أرباح مدفوعة" : "زيادة رأس المال", dividends * k], ["سداد التزامات عقود الإيجار", -acc("53") * 0.12 * k]];
  const flow = { operating: add(operatingFlow, row => row[1]), investing: add(investingFlow, row => row[1]), financing: add(financingFlow, row => row[1]) };
  const change = flow.operating + flow.investing + flow.financing; const closing = cash * share; const opening = closing - change;

  // VAT
  const outputVat = now.revenue * 0.15;
  const purchaseBase = now.cogs * 0.86 + add(now.opex.slice(1, 6), row => row.value); const inputVat = purchaseBase * 0.15;
  const purchaseCount = Math.max(1, Math.round(d.purchaseInvoices.length * 14 * k));

  // cost centres and branches share one allocation, so the two reports agree
  const centreExpense = sum(d.costCenters, "expense") || 1;
  const centreRows = d.costCenters.map((row, i) => { const revenue = row.kind === "فرع" ? entity.sales * shareOf(i) : row.kind === "إدارة" ? entity.franchise : 0; const expense = (entity.cogs + entity.opexTotal) * Number(row.expense) / centreExpense; return { code: String(row.code), name: String(row.name), kind: String(row.kind), manager: String(row.manager), revenue, expense, result: revenue - expense }; });
  const branchRows = d.branches.map((b, i) => { const centre = centreRows[i]; const name = String(b.name); const basket = ticket * (0.9 + hash(name) % 22 / 100); const count = Math.max(1, Math.round(centre.revenue * 1.15 / basket)); const achievement = 84 + hash(name + periodId) % 34; return { name, city: String(b.city), manager: String(b.manager), sales: centre.revenue, invoices: count, basket: centre.revenue * 1.15 / count, profit: centre.result, margin: centre.result / (centre.revenue || 1) * 100, target: centre.revenue / achievement * 100, achievement }; }).sort((a, b) => b.sales - a.sales);

  return { period, branch, was, now, entity, year, sales, vat, gross, invoices, basket: gross / invoices, units, items, categories, channels, methods, trend, hours, customers, cashiers, returns, discounts, pointsValue, stockRows, stock, stockValue, stockCategories, stockItems, turnover, cash, receivable, fixed, assets, payable, vatDue, wages, liabilities, capital, retained, dividends, equity, debtors, creditors, operatingFlow, investingFlow, financingFlow, flow, change, closing, opening, outputVat, purchaseBase, inputVat, purchaseCount, centreRows, branchRows, date: d.day(0) };
}
type Model = ReturnType<typeof build>;

function Delta({ now, before, inverse }: { now: number; before: number; inverse?: boolean }) {
  const change = before ? (now - before) / Math.abs(before) * 100 : 0; const up = change >= 0; const good = inverse ? !up : up;
  return <span className={`${r.delta} ${good ? r.up : r.down}`}>{up ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}<bdi>{up ? "+" : ""}{change.toFixed(1)}%</bdi></span>;
}
function Stat({ m, id, label, value, kind = "sar", inverse, lead }: { m: Model; id: string; label: string; value: number; kind?: Kind; inverse?: boolean; lead?: boolean }) {
  const before = m.was(id, value);
  return <div className={`${r.stat} ${lead ? r.lead : ""}`}><span>{label}</span><strong><bdi>{kind === "sar" ? sar(value) : fmt(kind, value)}</bdi>{kind === "sar" && <small>ر.س</small>}</strong><p><Delta now={value} before={before} inverse={inverse} /><em>{m.period.prev} <bdi>{fmt(kind, before)}</bdi></em></p></div>;
}
function Panel({ title, note, children, flush }: { title: string; note?: string; children: ReactNode; flush?: boolean }) {
  return <section className={s.panel}><div className={s.panelHead}><h2>{title}</h2>{note && <span>{note}</span>}</div>{flush ? children : <div className={s.panelBody}>{children}</div>}</section>;
}
function Shares({ rows, kind = "sar" }: { rows: { name: string; value: number; note?: string }[]; kind?: Kind }) {
  const max = Math.max(...rows.map(row => Math.abs(row.value)), 1); const all = add(rows, row => row.value) || 1;
  return <ul className={r.shares}>{rows.map((row, i) => <li key={`${row.name}${i}`}><div><span>{row.name}{row.note && <small>{row.note}</small>}</span><b><bdi>{fmt(kind, row.value)}</bdi></b><em><bdi>{pct(row.value / all * 100)}</bdi></em></div><i><u style={{ width: `${Math.abs(row.value) / max * 100}%` }} /></i></li>)}</ul>;
}
function Columns({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const max = Math.max(...data.map(row => row.value), 1); const every = data.length > 16 ? 5 : 1;
  return <div className={r.cols} role="img" aria-label={label}>{data.map((row, i) => <div key={i} title={`${row.label} · ${fmt("sar", row.value)}`}><b><bdi>{row.value >= 1000 ? `${Math.round(row.value / 1000)}k` : Math.round(row.value)}</bdi></b><i style={{ height: `${Math.max(3, row.value / max * 100)}%` }} /><span>{i % every === 0 ? row.label : ""}</span></div>)}</div>;
}
function Tbl({ head, rows, foot }: { head: string[]; rows: ReactNode[][]; foot?: ReactNode[] }) {
  return <div className={s.tableWrap}><table className={`${s.table} ${r.tbl}`}><thead><tr>{head.map((cell, i) => <th key={i}>{cell}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>{foot && <tfoot><tr>{foot.map((cell, j) => <td key={j}>{cell}</td>)}</tr></tfoot>}</table></div>;
}
const M = (value: number) => <bdi className={s.num}>{sar(value)}</bdi>;
const N = (value: number) => <bdi className={s.num}>{num(value)}</bdi>;
const P = (value: number) => <bdi className={s.num}>{pct(value)}</bdi>;
const B = (text: string) => <strong>{text}</strong>;
const Meter = ({ value }: { value: number }) => <span className={r.meter}><i><u className={value >= 100 ? r.meterGood : value < 90 ? r.meterLow : ""} style={{ width: `${Math.min(100, value)}%` }} /></i><bdi>{pct(value)}</bdi></span>;

type StatementRow = { label: string; value: number; tone?: "head" | "total" | "grand" | "minus"; id?: string };
/** Financial statement lines with the share of revenue and the previous period beside each figure. */
function Statement({ m, rows, base, baseLabel = "من الإيرادات" }: { m: Model; rows: StatementRow[]; base?: number; baseLabel?: string }) {
  return <div className={s.tableWrap}><table className={r.statement}><thead><tr><th>البند</th><th>{m.period.label}</th>{base !== undefined && <th>{baseLabel}</th>}<th>{m.period.prev}</th><th>التغير</th></tr></thead><tbody>{rows.map((row, i) => row.tone === "head" ? <tr key={i} className={r.sHead}><td colSpan={base !== undefined ? 5 : 4}>{row.label}</td></tr> : (() => { const before = m.was(row.id ?? row.label, row.value); return <tr key={i} className={row.tone === "total" ? r.sTotal : row.tone === "grand" ? r.sGrand : ""}><td>{row.label}</td><td className={row.value < 0 ? r.neg : ""}><bdi>{sar(row.value)}</bdi></td>{base !== undefined && <td><bdi>{pct(row.value / (base || 1) * 100)}</bdi></td>}<td><bdi>{sar(before)}</bdi></td><td><Delta now={row.value} before={before} inverse={row.tone === "minus"} /></td></tr>; })())}</tbody></table></div>;
}

function Sales({ m }: { m: Model }) {
  const top = m.items.slice(0, 10); const bottom = m.items.slice(-5).reverse();
  return <>
    <div className={r.stats}>
      <Stat m={m} id="sales" label="صافي المبيعات قبل الضريبة" value={m.sales} lead />
      <Stat m={m} id="vat" label="ضريبة القيمة المضافة 15%" value={m.vat} />
      <Stat m={m} id="gross" label="الإجمالي شامل الضريبة" value={m.gross} />
      <Stat m={m} id="invoices" label="عدد الفواتير" value={m.invoices} kind="n" />
      <Stat m={m} id="basket" label="متوسط السلة" value={m.basket} />
      <Stat m={m} id="units" label="الأصناف المباعة" value={m.units} kind="n" />
      <Stat m={m} id="returns" label="المرتجعات" value={m.returns} inverse />
      <Stat m={m} id="discounts" label="الخصومات الممنوحة" value={m.discounts} inverse />
      <Stat m={m} id="points" label="نقاط مستبدلة بقيمة" value={m.pointsValue} />
      <Stat m={m} id="profit" label="مجمل الربح من المبيعات" value={m.sales - m.now.cogs} />
    </div>
    <Panel title="اتجاه المبيعات" note={`صافي المبيعات موزعًا على ${m.period.label}`}><Columns data={m.trend} label="اتجاه المبيعات" /></Panel>
    <Panel title="المبيعات حسب ساعات اليوم" note="كلما غمق اللون زادت المبيعات في تلك الساعة"><div className={r.heat}>{m.hours.map(hour => <div key={hour.label} title={`الساعة ${hour.label} · ${fmt("sar", hour.value)}`} style={{ background: `color-mix(in srgb, var(--p) ${Math.round(12 + hour.level * 88)}%, #fff)`, color: hour.level > 0.5 ? "#fff" : "var(--ink)" }}><b><bdi>{hour.label}:00</bdi></b><span><bdi>{sar(hour.value)}</bdi></span></div>)}</div></Panel>
    <div className={s.grid2}>
      <Panel title="حسب قناة البيع" note="نقطة بيع وجملة ومعمل وتطبيق"><Shares rows={m.channels.map(row => ({ name: row.name, value: row.value, note: `${num(row.invoices)} فاتورة` }))} /></Panel>
      <Panel title="حسب طريقة الدفع" note="شامل الضريبة"><Shares rows={m.methods.map(row => ({ name: row.name, value: row.value, note: `${num(row.invoices)} فاتورة` }))} /></Panel>
    </div>
    <div className={s.grid2}>
      <Panel title="حسب الفرع" note="صافي المبيعات لكل الفروع"><Shares rows={m.branchRows.map(row => ({ name: row.name, value: row.sales, note: row.city }))} /></Panel>
      <Panel title="حسب تصنيف الأصناف" note="صافي المبيعات"><Shares rows={m.categories.map(row => ({ name: row.name, value: row.value, note: `${row.items} صنف` }))} /></Panel>
    </div>
    <Panel title="أعلى 10 أصناف مبيعًا" note="مرتبة حسب صافي المبيعات" flush><Tbl head={["#", "الصنف", "التصنيف", "الكمية", "صافي المبيعات ر.س", "الربح ر.س", "الهامش", "الحصة"]} rows={top.map((row, i) => [N(i + 1), B(row.name), row.category, <>{N(row.qty)} {row.unit}</>, M(row.revenue), M(row.profit), P(row.margin), P(row.share)])} foot={["", "مجموع العشرة", "", N(add(top, row => row.qty)), M(add(top, row => row.revenue)), M(add(top, row => row.profit)), "", P(add(top, row => row.share))]} /></Panel>
    <div className={s.grid2}>
      <Panel title="أقل 5 أصناف مبيعًا" note="تحتاج مراجعة التسعير أو العرض" flush><Tbl head={["الصنف", "الكمية", "صافي المبيعات ر.س", "الحصة"]} rows={bottom.map(row => [B(row.name), <>{N(row.qty)} {row.unit}</>, M(row.revenue), P(row.share)])} /></Panel>
      <Panel title="أفضل العملاء" note="مشتريات الفترة" flush><Tbl head={["العميل", "الفئة", "الزيارات", "المشتريات ر.س"]} rows={m.customers.map(row => [<><strong>{row.name}</strong><small className={r.sub}><bdi>{row.phone}</bdi></small></>, <Badge>{row.tier}</Badge>, N(row.visits), M(row.value)])} foot={["المجموع", "", N(add(m.customers, row => row.visits)), M(add(m.customers, row => row.value))]} /></Panel>
    </div>
    <Panel title="أداء الكاشير" note="مبيعات نقاط البيع قبل الضريبة" flush><Tbl head={["#", "الكاشير", "الفرع", "الفواتير", "صافي المبيعات ر.س", "متوسط السلة ر.س", "الحصة"]} rows={m.cashiers.map((row, i) => [N(i + 1), B(row.name), row.branch, N(row.invoices), M(row.value), M(row.basket), P(row.value / (m.channels[0].value || 1) * 100)])} foot={["", "المجموع", "", N(add(m.cashiers, row => row.invoices)), M(add(m.cashiers, row => row.value)), "", P(100)]} /></Panel>
  </>;
}

function Income({ m }: { m: Model }) {
  const p = m.now; const max = p.revenue || 1;
  const steps: [string, number, number, string][] = [["الإيرادات", 0, p.revenue, r.fBase], ["تكلفة المبيعات", p.grossProfit, p.cogs, r.fMinus], ["مجمل الربح", 0, p.grossProfit, r.fBase], ["المصروفات التشغيلية", p.operating, p.opexTotal, r.fMinus], ["الربح التشغيلي", 0, p.operating, r.fBase], ["مخصص الزكاة", p.net, p.zakat, r.fMinus], ["صافي الربح", 0, p.net, r.fNet]];
  return <>
    <div className={r.stats}>
      <Stat m={m} id="revenue" label="إجمالي الإيرادات" value={p.revenue} lead />
      <Stat m={m} id="cogs" label="تكلفة المبيعات" value={p.cogs} inverse />
      <Stat m={m} id="gp" label="مجمل الربح" value={p.grossProfit} />
      <Stat m={m} id="gpm" label="هامش مجمل الربح" value={p.grossProfit / max * 100} kind="pct" />
      <Stat m={m} id="opex" label="المصروفات التشغيلية" value={p.opexTotal} inverse />
      <Stat m={m} id="op" label="الربح التشغيلي" value={p.operating} />
      <Stat m={m} id="net" label="صافي الربح بعد الزكاة" value={p.net} />
      <Stat m={m} id="npm" label="هامش صافي الربح" value={p.net / max * 100} kind="pct" />
    </div>
    <Panel title="من الإيرادات إلى صافي الربح" note="كل شريط يبين ما بقي بعد خصم ما قبله"><div className={r.fall}>{steps.map(([label, start, size, tone]) => <div key={label}><span>{label}</span><i><u className={tone} style={{ insetInlineStart: `${Math.max(0, start) / max * 100}%`, width: `${Math.max(1, Math.abs(size) / max * 100)}%` }} /></i><b><bdi>{sar(size)}</bdi></b></div>)}</div></Panel>
    <Panel title="قائمة الدخل" note={`${m.period.label} مقارنة مع ${m.period.prev}`} flush><Statement m={m} base={p.revenue} rows={[
      { label: "الإيرادات", value: 0, tone: "head" },
      { label: "مبيعات الفروع والمناسبات", value: p.sales, id: "sales" }, { label: "إيرادات الفرنشايز", value: p.franchise },
      { label: "إجمالي الإيرادات", value: p.revenue, tone: "total", id: "revenue" },
      { label: "تكلفة المبيعات", value: p.cogs, tone: "minus", id: "cogs" },
      { label: "مجمل الربح", value: p.grossProfit, tone: "total", id: "gp" },
      { label: "المصروفات التشغيلية", value: 0, tone: "head" },
      ...p.opex.map(row => ({ label: row.name, value: row.value, tone: "minus" as const })),
      { label: "إجمالي المصروفات التشغيلية", value: p.opexTotal, tone: "total", id: "opex" },
      { label: "الربح التشغيلي", value: p.operating, tone: "total", id: "op" },
      { label: "مخصص الزكاة 2.5%", value: p.zakat, tone: "minus" },
      { label: "صافي الربح", value: p.net, tone: "grand", id: "net" },
    ]} /></Panel>
    <Panel title="توزيع المصروفات التشغيلية" note="نصيب كل بند من المصروفات"><Shares rows={p.opex} /></Panel>
  </>;
}

function Balance({ m }: { m: Model }) {
  const current = m.cash + m.receivable + m.stockValue;
  return <>
    <div className={r.stats}>
      <Stat m={m} id="assets" label="إجمالي الأصول" value={m.assets} lead />
      <Stat m={m} id="liabilities" label="إجمالي الالتزامات" value={m.liabilities} inverse />
      <Stat m={m} id="equity" label="حقوق الملكية" value={m.equity} />
      <Stat m={m} id="ratio" label="نسبة التداول" value={current / (m.liabilities || 1) * 100} kind="pct" />
    </div>
    <p className={s.hint}>المركز المالي يعرض على مستوى المنشأة كاملة في تاريخ <bdi>{m.date}</bdi> والأصول تساوي الالتزامات مع حقوق الملكية</p>
    <div className={s.grid2} style={{ marginTop: 20 }}>
      <Panel title="الأصول" note="ما تملكه المنشأة" flush><Statement m={m} base={m.assets} baseLabel="من الأصول" rows={[
        { label: "أصول متداولة", value: 0, tone: "head" },
        { label: "النقد في الخزائن والبنوك", value: m.cash, id: "cash" }, { label: "المدينون", value: m.receivable, id: "receivable" }, { label: "المخزون الصالح للبيع", value: m.stockValue, id: "stock" },
        { label: "مجموع الأصول المتداولة", value: current, tone: "total" },
        { label: "أصول غير متداولة", value: 0, tone: "head" },
        { label: "الأصول الثابتة بالصافي", value: m.fixed },
        { label: "إجمالي الأصول", value: m.assets, tone: "grand", id: "assets" },
      ]} /></Panel>
      <Panel title="الالتزامات وحقوق الملكية" note="من أين مولت الأصول" flush><Statement m={m} base={m.assets} baseLabel="من الأصول" rows={[
        { label: "الالتزامات", value: 0, tone: "head" },
        { label: "الدائنون والموردون", value: m.payable, tone: "minus", id: "payable" }, { label: "ضريبة القيمة المضافة المستحقة", value: m.vatDue, tone: "minus" }, { label: "رواتب مستحقة", value: m.wages, tone: "minus" },
        { label: "مجموع الالتزامات", value: m.liabilities, tone: "total", id: "liabilities" },
        { label: "حقوق الملكية", value: 0, tone: "head" },
        { label: "رأس المال", value: m.capital }, { label: "الأرباح المبقاة", value: m.retained }, { label: "صافي ربح السنة الحالية", value: m.year.net }, { label: m.dividends <= 0 ? "توزيعات أرباح مدفوعة" : "احتياطيات", value: m.dividends },
        { label: "مجموع حقوق الملكية", value: m.equity, tone: "total", id: "equity" },
        { label: "إجمالي الالتزامات وحقوق الملكية", value: m.liabilities + m.equity, tone: "grand", id: "assets" },
      ]} /></Panel>
    </div>
  </>;
}

function Cash({ m, d }: { m: Model; d: Data }) {
  const section = (title: string, rows: [string, number][], total: number, label: string): StatementRow[] => [{ label: title, value: 0, tone: "head" }, ...rows.map(([name, value]) => ({ label: name, value })), { label, value: total, tone: "total" }];
  return <>
    <div className={r.stats}>
      <Stat m={m} id="closing" label="النقد آخر الفترة" value={m.closing} lead />
      <Stat m={m} id="opening" label="النقد أول الفترة" value={m.opening} />
      <Stat m={m} id="cfo" label="من الأنشطة التشغيلية" value={m.flow.operating} />
      <Stat m={m} id="cfi" label="من الأنشطة الاستثمارية" value={m.flow.investing} />
      <Stat m={m} id="cff" label="من الأنشطة التمويلية" value={m.flow.financing} />
      <Stat m={m} id="change" label="صافي التغير في النقد" value={m.change} />
    </div>
    <Panel title="قائمة التدفقات النقدية" note={`${m.period.label} بالطريقة غير المباشرة`} flush><Statement m={m} rows={[
      { label: "النقد أول الفترة", value: m.opening, tone: "total", id: "opening" },
      ...section("الأنشطة التشغيلية", m.operatingFlow, m.flow.operating, "صافي النقد من الأنشطة التشغيلية"),
      ...section("الأنشطة الاستثمارية", m.investingFlow, m.flow.investing, "صافي النقد من الأنشطة الاستثمارية"),
      ...section("الأنشطة التمويلية", m.financingFlow, m.flow.financing, "صافي النقد من الأنشطة التمويلية"),
      { label: "صافي التغير في النقد", value: m.change, tone: "total", id: "change" },
      { label: "النقد آخر الفترة", value: m.closing, tone: "grand", id: "closing" },
    ]} /></Panel>
    <Panel title="أرصدة الخزائن والبنوك" note="على مستوى المنشأة كاملة" flush><Tbl head={["الرمز", "الخزينة أو الحساب", "النوع", "المسؤول", "حركة اليوم ر.س", "الرصيد ر.س", "الحصة"]} rows={d.treasuries.map(row => [<bdi className={s.code}>{String(row.code)}</bdi>, B(String(row.name)), String(row.kind), <bdi>{String(row.holder)}</bdi>, M(Number(row.today)), M(Number(row.balance)), P(Number(row.balance) / (m.cash || 1) * 100)])} foot={["", "إجمالي النقد", "", "", M(sum(d.treasuries, "today")), M(m.cash), P(100)]} /></Panel>
  </>;
}

function Vat({ m }: { m: Model }) {
  const net = m.outputVat - m.inputVat; const quarter = Math.ceil(Number(m.date.slice(5, 7)) / 3);
  return <>
    <p className={r.demo}>تقرير عرض تجريبي وكل الأرقام والبيانات الضريبية فيه غير حقيقية ولا يرسل شيء إلى هيئة الزكاة والضريبة والجمارك</p>
    <div className={r.stats}>
      <Stat m={m} id="netvat" label="صافي الضريبة المستحقة" value={net} lead inverse />
      <Stat m={m} id="outvat" label="ضريبة المخرجات على المبيعات" value={m.outputVat} />
      <Stat m={m} id="invat" label="ضريبة المدخلات على المشتريات" value={m.inputVat} />
      <Stat m={m} id="invoices" label="فواتير المبيعات" value={m.invoices} kind="n" />
      <Stat m={m} id="pinv" label="فواتير المشتريات" value={m.purchaseCount} kind="n" />
    </div>
    <Panel title="تفصيل الإقرار حسب النسبة" note={`الفترة الضريبية: الربع ${quarter} من ${m.date.slice(0, 4)} · المعروض ${m.period.label}`} flush><Tbl head={["البند", "النسبة", "المبلغ الخاضع ر.س", "التعديلات ر.س", "الضريبة ر.س"]} rows={[
      [B("مبيعات خاضعة للنسبة الأساسية"), P(15), M(m.now.revenue), M(-m.returns), M((m.now.revenue - m.returns) * 0.15)],
      [B("مبيعات خاضعة لنسبة الصفر"), P(0), M(0), M(0), M(0)],
      [B("مبيعات معفاة"), "معفاة", M(0), M(0), M(0)],
      [B("مشتريات محلية خاضعة للنسبة الأساسية"), P(15), M(m.purchaseBase), M(0), M(m.inputVat)],
      [B("مشتريات غير خاضعة كالرواتب والإهلاك"), "خارج النطاق", M(m.now.opex[0].value + m.now.opex[6].value), M(0), M(0)],
    ]} foot={["صافي الضريبة المستحقة بعد المرتجعات", "", "", "", M((m.now.revenue - m.returns) * 0.15 - m.inputVat)]} /></Panel>
    <div className={s.grid2}>
      <Panel title="ضريبة المخرجات حسب القناة" note="15% من صافي كل قناة"><Shares rows={[...m.channels.map(row => ({ name: row.name, value: row.value * 0.15 })), { name: "إيرادات الفرنشايز", value: m.now.franchise * 0.15 }]} /></Panel>
      <Panel title="ضريبة المدخلات حسب البند" note="15% من المشتريات الخاضعة"><Shares rows={[{ name: "مشتريات المواد الخام والتغليف", value: m.now.cogs * 0.86 * 0.15 }, ...m.now.opex.slice(1, 6).map(row => ({ name: row.name, value: row.value * 0.15 }))]} /></Panel>
    </div>
  </>;
}

function Items({ m }: { m: Model }) {
  const profit = add(m.items, row => row.profit); const best = [...m.items].sort((a, b) => b.margin - a.margin)[0];
  return <>
    <div className={r.stats}>
      <Stat m={m} id="sales" label="صافي مبيعات الأصناف" value={m.sales} lead />
      <Stat m={m} id="cogs" label="تكلفة الأصناف المباعة" value={m.now.cogs} inverse />
      <Stat m={m} id="itemprofit" label="ربح الأصناف" value={profit} />
      <Stat m={m} id="itemmargin" label="متوسط الهامش" value={profit / (m.sales || 1) * 100} kind="pct" />
      <Stat m={m} id="units" label="الوحدات المباعة" value={m.units} kind="n" />
    </div>
    <p className={s.hint}>أعلى هامش ربح: {best.name} بهامش <bdi>{pct(best.margin)}</bdi> وأكثر صنف مبيعًا: {m.items[0].name} بحصة <bdi>{pct(m.items[0].share)}</bdi></p>
    <div style={{ marginTop: 20 }}><Panel title="ربحية كل صنف" note={`${m.items.length} صنف مرتبة حسب صافي المبيعات`} flush><Tbl head={["#", "الصنف", "الرمز", "التصنيف", "الكمية", "صافي المبيعات ر.س", "التكلفة ر.س", "الربح ر.س", "الهامش", "الحصة", "أيام الدوران"]} rows={m.items.map((row, i) => [N(i + 1), B(row.name), <bdi className={s.code}>{row.sku}</bdi>, row.category, <>{N(row.qty)} {row.unit}</>, M(row.revenue), M(row.cost), M(row.profit), <Meter value={row.margin} />, P(row.share), <>{N(row.days)} يوم</>])} foot={["", "الإجمالي", "", "", N(m.units), M(m.sales), M(m.now.cogs), M(profit), P(profit / (m.sales || 1) * 100), P(100), ""]} /></Panel></div>
    <Panel title="ربحية التصنيفات" note="ربح كل تصنيف من الإجمالي"><Shares rows={m.categories.map(row => ({ name: row.name, value: row.profit, note: `${row.items} صنف` }))} /></Panel>
  </>;
}

function Branches({ m }: { m: Model }) {
  const rows = m.branchRows; const total = add(rows, row => row.sales); const target = add(rows, row => row.target);
  return <>
    <div className={r.stats}>
      <Stat m={m} id="allsales" label="مبيعات كل الفروع" value={total} lead />
      <Stat m={m} id="allprofit" label="نتيجة الفروع بعد مصروفاتها" value={add(rows, row => row.profit)} />
      <Stat m={m} id="alltarget" label="تحقيق المستهدف" value={total / (target || 1) * 100} kind="pct" />
      <Stat m={m} id="allinv" label="فواتير الفروع" value={add(rows, row => row.invoices)} kind="n" />
    </div>
    <div className={r.rank}>{rows.map((row, i) => <article key={row.name} className={row.name === m.branch ? r.rankOn : ""}><header><i><bdi>{i + 1}</bdi></i><div><strong>{row.name}</strong><span>{row.city} · {row.manager}</span></div></header><b><bdi>{sar(row.sales)}</bdi><small>ر.س</small></b><Meter value={row.achievement} /><dl><div><dt>الفواتير</dt><dd><bdi>{num(row.invoices)}</bdi></dd></div><div><dt>السلة</dt><dd><bdi>{sar(row.basket)}</bdi></dd></div><div><dt>نتيجة الفرع</dt><dd><bdi>{sar(row.profit)}</bdi></dd></div></dl></article>)}</div>
    <Panel title="مقارنة الفروع" note="نتيجة الفرع بعد تحميل مصروفاته المباشرة" flush><Tbl head={["الترتيب", "الفرع", "المدير", "الفواتير", "صافي المبيعات ر.س", "متوسط السلة ر.س", "نتيجة الفرع ر.س", "الهامش", "المستهدف ر.س", "تحقيق المستهدف"]} rows={rows.map((row, i) => [N(i + 1), B(row.name), row.manager, N(row.invoices), M(row.sales), M(row.basket), M(row.profit), P(row.margin), M(row.target), <Meter value={row.achievement} />])} foot={["", "الإجمالي", "", N(add(rows, row => row.invoices)), M(total), M(total * 1.15 / (add(rows, row => row.invoices) || 1)), M(add(rows, row => row.profit)), P(add(rows, row => row.profit) / (total || 1) * 100), M(target), P(total / (target || 1) * 100)]} /></Panel>
  </>;
}

function Ageing({ m }: { m: Model }) {
  const buckets = (rows: Model["debtors"]) => AGE_LABELS.map((_, i) => add(rows, row => row.buckets[i]));
  const table = (rows: Model["debtors"], total: number, party: string) => { const sums = buckets(rows); return <Tbl head={[party, ...AGE_LABELS.map(label => `${label} ر.س`), "الإجمالي ر.س", "الحصة"]} rows={rows.map(row => [<><strong>{row.name}</strong><small className={r.sub}><bdi>{row.note}</bdi></small></>, ...row.buckets.map(value => M(value)), M(row.amount), P(row.amount / (total || 1) * 100)])} foot={["الإجمالي", ...sums.map(value => M(value)), M(total), P(100)]} />; };
  const late = (rows: Model["debtors"]) => add(rows, row => row.buckets[2] + row.buckets[3]);
  return <>
    <div className={r.stats}>
      <Stat m={m} id="receivable" label="ذمم مدينة على العملاء" value={m.receivable} lead inverse />
      <Stat m={m} id="latein" label="متأخرة أكثر من 60 يوم" value={late(m.debtors)} inverse />
      <Stat m={m} id="payable" label="ذمم دائنة للموردين" value={m.payable} inverse />
      <Stat m={m} id="lateout" label="مستحقة للموردين أكثر من 60 يوم" value={late(m.creditors)} inverse />
    </div>
    <p className={s.hint}>الأرصدة كما في تاريخ <bdi>{m.date}</bdi> على مستوى المنشأة ومجموعها يطابق المدينين والدائنين في المركز المالي</p>
    <div className={s.grid2} style={{ marginTop: 20 }}>
      <Panel title="أعمار الذمم المدينة" note="ما يستحق لنا على العملاء"><Shares rows={AGE_LABELS.map((name, i) => ({ name, value: buckets(m.debtors)[i] }))} /></Panel>
      <Panel title="أعمار الذمم الدائنة" note="ما يستحق علينا للموردين"><Shares rows={AGE_LABELS.map((name, i) => ({ name, value: buckets(m.creditors)[i] }))} /></Panel>
    </div>
    <Panel title="تفصيل الذمم المدينة" note={`${m.debtors.length} عميل عليه رصيد`} flush>{table(m.debtors, m.receivable, "العميل")}</Panel>
    <Panel title="تفصيل الذمم الدائنة" note={`${m.creditors.length} مورد له رصيد`} flush>{table(m.creditors, m.payable, "المورد")}</Panel>
  </>;
}

function Expenses({ m }: { m: Model }) {
  const e = m.entity; const total = e.cogs + e.opexTotal; const rows = m.centreRows;
  return <>
    <div className={r.stats}>
      <Stat m={m} id="allexp" label="إجمالي المصروفات والتكاليف" value={total} lead inverse />
      <Stat m={m} id="ecogs" label="تكلفة المبيعات" value={e.cogs} inverse />
      <Stat m={m} id="eopex" label="المصروفات التشغيلية" value={e.opexTotal} inverse />
      <Stat m={m} id="eratio" label="المصروفات من الإيرادات" value={total / (e.revenue || 1) * 100} kind="pct" inverse />
    </div>
    <p className={s.hint}>المصروفات ومراكز التكلفة تعرض على مستوى المنشأة كاملة ومجموع نتائج المراكز يساوي الربح التشغيلي في قائمة الدخل</p>
    <div className={s.grid2} style={{ marginTop: 20 }}>
      <Panel title="المصروفات حسب البند" note="نصيب كل بند من الإجمالي"><Shares rows={[{ name: "تكلفة المبيعات", value: e.cogs }, ...e.opex]} /></Panel>
      <Panel title="المصروفات حسب مركز التكلفة" note="فروع وإنتاج وإدارة"><Shares rows={[...rows].sort((a, b) => b.expense - a.expense).map(row => ({ name: row.name, value: row.expense, note: row.kind }))} /></Panel>
    </div>
    <Panel title="بنود المصروفات مقارنة بالفترة السابقة" note={`${m.period.label} مقارنة مع ${m.period.prev}`} flush><Statement m={m} base={e.revenue} rows={[{ label: "تكلفة المبيعات", value: e.cogs, tone: "minus", id: "ecogs" }, ...e.opex.map(row => ({ label: row.name, value: row.value, tone: "minus" as const, id: `e${row.name}` })), { label: "إجمالي المصروفات والتكاليف", value: total, tone: "grand", id: "allexp" }]} /></Panel>
    <Panel title="نتيجة مراكز التكلفة" note="الإيراد والمصروف المحمل على كل مركز" flush><Tbl head={["الرمز", "المركز", "النوع", "المسؤول", "الإيرادات ر.س", "المصروفات ر.س", "النتيجة ر.س", "من المصروفات"]} rows={rows.map(row => [<bdi className={s.code}>{row.code}</bdi>, B(row.name), row.kind, row.manager, M(row.revenue), M(row.expense), <span className={row.result < 0 ? r.neg : r.pos}>{M(row.result)}</span>, P(row.expense / (total || 1) * 100)])} foot={["", "الإجمالي", "", "", M(add(rows, row => row.revenue)), M(total), M(add(rows, row => row.result)), P(100)]} /></Panel>
  </>;
}

function Stock({ m }: { m: Model }) {
  const all = m.stock.good + m.stock.near + m.stock.expired + m.stock.damaged;
  return <>
    <div className={r.stats}>
      <Stat m={m} id="stock" label="قيمة المخزون الصالح للبيع" value={m.stockValue} lead />
      <Stat m={m} id="near" label="قريب الانتهاء" value={m.stock.near} inverse />
      <Stat m={m} id="expired" label="منتهي الصلاحية" value={m.stock.expired} inverse />
      <Stat m={m} id="damaged" label="تالف" value={m.stock.damaged} inverse />
      <Stat m={m} id="turn" label="معدل دوران المخزون سنويًا" value={m.turnover} kind="n" />
      <Stat m={m} id="turndays" label="أيام بقاء المخزون" value={365 / (m.turnover || 1)} kind="n" inverse />
    </div>
    <p className={s.hint}>القيم بسعر التكلفة ومأخوذة من تشغيلات المستودعات نفسها وتعرض على مستوى المنشأة كاملة</p>
    <div className={s.grid2} style={{ marginTop: 20 }}>
      <Panel title="حالة المخزون" note="قيمة كل حالة بسعر التكلفة"><Shares rows={[{ name: "صالح", value: m.stock.good }, { name: "قريب الانتهاء", value: m.stock.near }, { name: "منتهي الصلاحية", value: m.stock.expired }, { name: "تالف", value: m.stock.damaged }]} /></Panel>
      <Panel title="المخزون حسب التصنيف" note="الصالح وقريب الانتهاء"><Shares rows={m.stockCategories} /></Panel>
    </div>
    <Panel title="قيمة المخزون حسب المستودع" note="بسعر التكلفة" flush><Tbl head={["المستودع", "النوع", "التشغيلات", "صالح ر.س", "قريب الانتهاء ر.س", "منتهي ر.س", "تالف ر.س", "الإجمالي ر.س"]} rows={m.stockRows.map(row => [B(row.name), row.kind, N(row.lots), M(row.good), M(row.near), <span className={row.expired ? r.neg : ""}>{M(row.expired)}</span>, <span className={row.damaged ? r.neg : ""}>{M(row.damaged)}</span>, M(row.good + row.near + row.expired + row.damaged)])} foot={["الإجمالي", "", N(add(m.stockRows, row => row.lots)), M(m.stock.good), M(m.stock.near), M(m.stock.expired), M(m.stock.damaged), M(all)]} /></Panel>
    <Panel title="أعلى 10 أصناف قيمة في المخزون" note="أقرب انتهاء لكل صنف" flush><Tbl head={["#", "الصنف", "الكمية", "التشغيلات", "القيمة ر.س", "من المخزون", "أقرب انتهاء"]} rows={m.stockItems.map((row, i) => [N(i + 1), B(row.name), <>{N(row.qty)} {row.unit}</>, N(row.lots), M(row.value), P(row.value / (m.stockValue || 1) * 100), <Badge>{row.nearest <= 3 ? "قريب الانتهاء" : "صالح"}</Badge>])} /></Panel>
  </>;
}

const REPORTS: { id: string; title: string; text: string; icon: LucideIcon; figure: (m: Model) => [string, string] }[] = [
  { id: "sales", title: "تقرير المبيعات الشامل", text: "صافي المبيعات والفواتير والسلة والقنوات وطرق الدفع والأصناف والعملاء والكاشير", icon: ChartNoAxesCombined, figure: m => ["صافي المبيعات", fmt("sar", m.sales)] },
  { id: "income", title: "قائمة الدخل", text: "الإيرادات وتكلفة المبيعات والمصروفات التشغيلية وصافي الربح وهوامشه", icon: Receipt, figure: m => ["صافي الربح", fmt("sar", m.now.net)] },
  { id: "balance", title: "المركز المالي", text: "الأصول والالتزامات وحقوق الملكية بمجاميع متوازنة", icon: Scale, figure: m => ["إجمالي الأصول", fmt("sar", m.assets)] },
  { id: "cash", title: "التدفقات النقدية", text: "التشغيلية والاستثمارية والتمويلية ورصيد كل خزينة وبنك", icon: Banknote, figure: m => ["النقد آخر الفترة", fmt("sar", m.closing)] },
  { id: "vat", title: "تقرير ضريبة القيمة المضافة", text: "ضريبة المخرجات والمدخلات وصافي المستحق حسب النسبة", icon: Percent, figure: m => ["صافي المستحق", fmt("sar", m.outputVat - m.inputVat)] },
  { id: "items", title: "ربحية الأصناف", text: "كمية كل صنف وإيراده وتكلفته وربحه وهامشه ومدة دورانه", icon: PackageSearch, figure: m => ["ربح الأصناف", fmt("sar", m.sales - m.now.cogs)] },
  { id: "branches", title: "أداء الفروع", text: "مبيعات كل فرع وفواتيره وسلته ونتيجته وتحقيقه للمستهدف", icon: Store, figure: m => ["الفرع الأول", m.branchRows[0].name] },
  { id: "ageing", title: "الذمم المدينة والدائنة", text: "أعمار أرصدة العملاء والموردين من يوم حتى أكثر من 90 يوم", icon: Users, figure: m => ["على العملاء", fmt("sar", m.receivable)] },
  { id: "expenses", title: "المصروفات ومراكز التكلفة", text: "كل بند مصروف ونصيبه ونتيجة كل فرع ومركز تكلفة", icon: Wallet, figure: m => ["إجمالي المصروفات", fmt("sar", m.entity.cogs + m.entity.opexTotal)] },
  { id: "stock", title: "تقرير المخزون", text: "قيمة المخزون الصالح وقريب الانتهاء والمنتهي والتالف ومعدل الدوران", icon: Boxes, figure: m => ["قيمة المخزون", fmt("sar", m.stockValue)] },
];

export function DemoReports() {
  const { d, log } = useDemo();
  const toast = useToast();
  const [open, setOpen] = useState("");
  const [period, setPeriod] = useState("month");
  const [branch, setBranch] = useState("");
  const m = useMemo(() => build(d, period, branch), [d, period, branch]);
  const report = REPORTS.find(item => item.id === open);
  const scope = `${m.period.label} · ${branch || "كل الفروع"}`;
  const act = (label: string, message: string) => { log(`${label} ${report?.title ?? "التقارير"} عن ${scope}`); toast(message); };
  const filters = <div className={r.filters}>
    <div className={r.periods} role="group" aria-label="الفترة">{PERIODS.map(item => <button type="button" key={item.id} aria-pressed={item.id === period} className={item.id === period ? r.periodOn : ""} onClick={() => setPeriod(item.id)}>{item.label}</button>)}</div>
    <label className={r.branch}><Landmark size={15} aria-hidden="true" /><span>الفرع</span><select value={branch} onChange={event => setBranch(event.target.value)}><option value="">كل الفروع</option>{d.branches.map(item => <option key={String(item.id)} value={String(item.name)}>{String(item.name)}</option>)}</select></label>
  </div>;

  if (report) {
    const Icon = report.icon;
    return <div className={r.wrap}>
      <button type="button" className={s.back} onClick={() => setOpen("")}><ArrowRight size={16} aria-hidden="true" />العودة إلى التقارير</button>
      <header className={r.head}>
        <div className={r.headIcon}><Icon size={26} aria-hidden="true" /></div>
        <div><p>الديم للحلويات · تقرير عرض تجريبي</p><h2>{report.title}</h2><span>{scope} · مقارنة مع {m.period.prev} · أُعد بتاريخ <bdi>{today()}</bdi></span></div>
        <div className={r.headActions}>
          <button type="button" onClick={() => act("طباعة", "أُرسل التقرير للطابعة")}><Printer size={15} aria-hidden="true" />طباعة</button>
          <button type="button" onClick={() => act("تنزيل PDF", "جُهزت نسخة PDF من التقرير")}><Download size={15} aria-hidden="true" />تنزيل PDF</button>
          <button type="button" onClick={() => act("تصدير Excel", "صُدّر التقرير إلى ملف Excel")}><FileSpreadsheet size={15} aria-hidden="true" />تصدير Excel</button>
          <button type="button" onClick={() => act("إرسال بالبريد", "أُرسل التقرير بالبريد في العرض التجريبي")}><Mail size={15} aria-hidden="true" />إرسال بالبريد</button>
        </div>
      </header>
      {filters}
      <div className={r.body}>
        {open === "sales" ? <Sales m={m} /> : open === "income" ? <Income m={m} /> : open === "balance" ? <Balance m={m} /> : open === "cash" ? <Cash m={m} d={d} /> : open === "vat" ? <Vat m={m} /> : open === "items" ? <Items m={m} /> : open === "branches" ? <Branches m={m} /> : open === "ageing" ? <Ageing m={m} /> : open === "expenses" ? <Expenses m={m} /> : <Stock m={m} />}
      </div>
      <p className={s.note}>كل أرقام التقرير بيانات عرض تجريبية محسوبة داخل المتصفح ولا تمثل نتائج مالية حقيقية</p>
    </div>;
  }

  return <div className={r.wrap}>
    {filters}
    <div className={r.stats}>
      <Stat m={m} id="revenue" label="إجمالي الإيرادات" value={m.now.revenue} lead />
      <Stat m={m} id="gp" label="مجمل الربح" value={m.now.grossProfit} />
      <Stat m={m} id="net" label="صافي الربح بعد الزكاة" value={m.now.net} />
      <Stat m={m} id="npm" label="هامش صافي الربح" value={m.now.net / (m.now.revenue || 1) * 100} kind="pct" />
      <Stat m={m} id="invoices" label="عدد الفواتير" value={m.invoices} kind="n" />
      <Stat m={m} id="basket" label="متوسط السلة" value={m.basket} />
    </div>
    <div className={r.hub}>{REPORTS.map(item => { const Icon = item.icon; const [label, value] = item.figure(m); return <button type="button" key={item.id} className={r.card} onClick={() => { setOpen(item.id); log(`فتح ${item.title} عن ${scope}`); }}>
      <i><Icon size={22} aria-hidden="true" /></i>
      <strong>{item.title}</strong>
      <span>{item.text}</span>
      <footer><div><small>{label}</small><b><bdi>{value}</bdi></b></div><em>فتح التقرير<ArrowRight size={14} aria-hidden="true" style={{ transform: "scaleX(-1)" }} /></em></footer>
    </button>; })}</div>
    <p className={s.note}>كل أرقام التقارير بيانات عرض تجريبية محسوبة داخل المتصفح ولا تمثل نتائج مالية حقيقية</p>
  </div>;
}
