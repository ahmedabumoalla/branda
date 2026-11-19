"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { money, sum, type Row } from "./data";
import { Kpis, useToast } from "./kit";
import { useDemo } from "./store";
import s from "./demo.module.css";
import x from "./pospoints.module.css";

const n = (value: number) => value.toLocaleString("en-US");
const VALUE = 0.1; // riyal per point
const OWN = "فروعنا";
const isOwn = (row: Row) => row.placeType === OWN;
const pts = (row: Row) => Math.abs(Number(row.points ?? 0));

function Source({ own }: { own: boolean }) {
  return <span className={`${x.src} ${own ? x.own : x.fr}`}>{own ? "فروعنا" : "الفرنشايز"}</span>;
}

/** Totals per place for one kind of movement, largest first. */
function byPlace(rows: Row[], kind: string) {
  const map = new Map<string, { place: string; own: boolean; points: number; moves: number }>();
  rows.filter(row => row.kind === kind).forEach(row => { const place = String(row.place); const item = map.get(place) ?? { place, own: isOwn(row), points: 0, moves: 0 }; item.points += pts(row); item.moves += 1; map.set(place, item); });
  return [...map.values()].sort((a, b) => b.points - a.points);
}

function PlaceBars({ items, empty }: { items: ReturnType<typeof byPlace>; empty: string }) {
  const peak = Math.max(1, ...items.map(item => item.points));
  if (!items.length) return <p className={x.emptyLog}>{empty}</p>;
  return <>
    <div className={x.legend}><span><i className={x.fillOwn} />فروعنا</span><span><i className={x.fillFr} />الفرنشايز</span></div>
    <div className={s.bars}>{items.map(item => <div className={s.barRow} key={item.place}><span>{item.place}</span><div className={s.track}><span className={`${s.fill} ${item.own ? x.fillOwn : x.fillFr}`} style={{ width: `${Math.max(4, Math.round(item.points / peak * 100))}%` }} /></div><bdi className={s.num}>{n(item.points)} نقطة</bdi></div>)}</div>
  </>;
}

function Split({ own, franchise }: { own: number; franchise: number }) {
  const total = own + franchise || 1;
  return <div className={x.splitBar} role="img" aria-label={`فروعنا ${Math.round(own / total * 100)}% والفرنشايز ${Math.round(franchise / total * 100)}%`}><i className={x.fillOwn} style={{ width: `${own / total * 100}%` }} /><i className={x.fillFr} style={{ width: `${franchise / total * 100}%` }} /></div>;
}

function CustomerPage({ customer, back }: { customer: Row; back: () => void }) {
  const { d, log } = useDemo();
  const toast = useToast();
  const moves = useMemo(() => d.pointsLedger.filter(row => row.customerId === customer.id), [d, customer.id]);
  const earnedOwn = Number(customer.earnedOwn ?? 0), earnedFranchise = Number(customer.earnedFranchise ?? 0), redeemedOwn = Number(customer.redeemedOwn ?? 0), redeemedFranchise = Number(customer.redeemedFranchise ?? 0);
  const balance = Number(customer.points ?? 0);
  const statement = () => { log(`إصدار كشف نقاط العميل ${String(customer.name)}`); toast(`جُهز كشف نقاط ${String(customer.name)} في العرض التجريبي`); };
  return <>
    <button type="button" className={s.back} onClick={back}><ArrowRight size={16} aria-hidden="true" />كل العملاء</button>
    <section className={s.whHero}>
      <div><h2>{String(customer.name)}</h2><p><bdi>{String(customer.code)}</bdi> · فئة {String(customer.tier)} · <bdi>{String(customer.phone)}</bdi></p></div>
      <div className={x.heroNums}>
        <div><span>الرصيد الحالي</span><strong><bdi>{n(balance)}</bdi> نقطة</strong></div>
        <div><span>قيمته عند الاستبدال</span><strong><bdi>{money(balance * VALUE)}</bdi></strong></div>
        <div><span>عدد الحركات</span><strong><bdi>{n(moves.length)}</bdi></strong></div>
      </div>
    </section>
    <Kpis items={[
      { label: "جمعها من فروعنا", value: n(earnedOwn), note: `${Math.round(earnedOwn / (earnedOwn + earnedFranchise || 1) * 100)}% من نقاطه`, tone: "good" },
      { label: "جمعها من الفرنشايز", value: n(earnedFranchise), note: `${Math.round(earnedFranchise / (earnedOwn + earnedFranchise || 1) * 100)}% من نقاطه`, tone: "warn" },
      { label: "صرفها في فروعنا", value: n(redeemedOwn), note: money(redeemedOwn * VALUE) },
      { label: "صرفها عند الفرنشايز", value: n(redeemedFranchise), note: money(redeemedFranchise * VALUE) },
      { label: "الرصيد المتبقي", value: n(balance), note: money(balance * VALUE) },
    ]} />
    <div className={x.two} style={{ marginTop: 0 }}>
      <section className={s.panel}><div className={s.panelHead}><h2>من أين جمع نقاطه</h2><span><bdi>{n(earnedOwn + earnedFranchise)}</bdi> نقطة</span></div><div className={s.panelBody}><Split own={earnedOwn} franchise={earnedFranchise} /><div style={{ height: 16 }} /><PlaceBars items={byPlace(moves, "اكتساب")} empty="لم يكتسب العميل نقاطًا بعد" /></div></section>
      <section className={s.panel}><div className={s.panelHead}><h2>أين صرفها</h2><span><bdi>{n(redeemedOwn + redeemedFranchise)}</bdi> نقطة</span></div><div className={s.panelBody}><Split own={redeemedOwn} franchise={redeemedFranchise} /><div style={{ height: 16 }} /><PlaceBars items={byPlace(moves, "استبدال")} empty="لم يصرف العميل أي نقاط حتى الآن" /></div></section>
    </div>
    <section className={s.panel} style={{ marginTop: 20 }}>
      <div className={s.panelHead}><h2>سجل نقاط العميل</h2><button type="button" className={s.ghost} onClick={statement}>إصدار كشف النقاط</button></div>
      <div className={s.tableWrap}><table className={s.table}>
        <thead><tr><th>التاريخ</th><th>الحركة</th><th>الجهة</th><th>المكان</th><th>أساس الاحتساب</th><th>الفاتورة</th><th>النقاط</th></tr></thead>
        <tbody>{moves.map(row => <tr key={row.id}><td><bdi className={s.num}>{String(row.date)}</bdi></td><td><strong>{String(row.kind)}</strong></td><td><Source own={isOwn(row)} /></td><td>{String(row.place)}</td><td>{String(row.basis)}</td><td><bdi className={s.code}>{String(row.invoice)}</bdi></td><td><bdi className={Number(row.points) < 0 ? x.minus : x.plus}>{Number(row.points) > 0 ? "+" : ""}{n(Number(row.points))}</bdi></td></tr>)}</tbody>
      </table></div>
    </section>
  </>;
}

/** Loyalty points by source: what was earned and redeemed at Aldeem branches against franchise partners. */
export function DemoCustomerPoints() {
  const { d, log } = useDemo();
  const toast = useToast();
  const [openId, setOpenId] = useState("");
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("");
  const [settled, setSettled] = useState<string[]>([]);
  const ledger = d.pointsLedger;
  const partners = useMemo(() => {
    const map = new Map<string, { place: string; earned: number; redeemed: number }>();
    ledger.filter(row => !isOwn(row)).forEach(row => { const place = String(row.place); const item = map.get(place) ?? { place, earned: 0, redeemed: 0 }; if (row.kind === "اكتساب") item.earned += pts(row); else item.redeemed += pts(row); map.set(place, item); });
    return [...map.values()].sort((a, b) => b.earned + b.redeemed - a.earned - a.redeemed);
  }, [ledger]);
  const customer = d.customers.find(row => row.id === openId);
  if (customer) return <CustomerPage customer={customer} back={() => setOpenId("")} />;

  const earnedOwn = sum(d.customers, "earnedOwn"), earnedFranchise = sum(d.customers, "earnedFranchise"), redeemedOwn = sum(d.customers, "redeemedOwn"), redeemedFranchise = sum(d.customers, "redeemedFranchise");
  const balance = sum(d.customers, "points");
  const tiers = [...new Set(d.customers.map(row => String(row.tier)))];
  const needle = query.trim().toLowerCase();
  const customers = d.customers.filter(row => (!tier || row.tier === tier) && (!needle || [row.name, row.phone, row.code].some(value => String(value ?? "").toLowerCase().includes(needle))));
  const settle = (place: string, net: number) => { setSettled(current => [...current, place]); log(`تسوية نقاط الولاء مع ${place} بقيمة ${Math.round(Math.abs(net) * VALUE)} ر.س`); toast(`سُجلت تسوية النقاط مع ${place} في العرض التجريبي`); };
  return <>
    <p className={s.note} style={{ margin: "0 0 18px" }}>رصيد العميل واحد في فروعنا وعند شركاء الفرنشايز وهنا ترى من أين جمع نقاطه وأين صرفها وما يترتب على ذلك من تسوية مع كل شريك</p>
    <Kpis items={[
      { label: "مكتسبة من فروعنا", value: n(earnedOwn), note: `${Math.round(earnedOwn / (earnedOwn + earnedFranchise || 1) * 100)}% من المكتسب`, tone: "good" },
      { label: "مكتسبة من الفرنشايز", value: n(earnedFranchise), note: `${Math.round(earnedFranchise / (earnedOwn + earnedFranchise || 1) * 100)}% من المكتسب`, tone: "warn" },
      { label: "مصروفة في فروعنا", value: n(redeemedOwn), note: money(redeemedOwn * VALUE) },
      { label: "مصروفة عند الفرنشايز", value: n(redeemedFranchise), note: money(redeemedFranchise * VALUE) },
      { label: "أرصدة قائمة", value: n(balance), note: `تعادل ${money(balance * VALUE)}` },
    ]} />
    <div className={x.two} style={{ marginTop: 0 }}>
      <section className={s.panel}><div className={s.panelHead}><h2>مصدر اكتساب النقاط</h2><span>كل الأماكن</span></div><div className={s.panelBody}><Split own={earnedOwn} franchise={earnedFranchise} /><div style={{ height: 16 }} /><PlaceBars items={byPlace(ledger, "اكتساب")} empty="لا توجد حركات اكتساب" /></div></section>
      <section className={s.panel}><div className={s.panelHead}><h2>أماكن صرف النقاط</h2><span>كل الأماكن</span></div><div className={s.panelBody}><Split own={redeemedOwn} franchise={redeemedFranchise} /><div style={{ height: 16 }} /><PlaceBars items={byPlace(ledger, "استبدال")} empty="لا توجد حركات استبدال" /></div></section>
    </div>
    <section className={s.panel} style={{ marginTop: 20 }}>
      <div className={s.panelHead}><h2>تسوية النقاط مع شركاء الفرنشايز</h2><span>قيمة النقطة <bdi>{VALUE}</bdi> ريال</span></div>
      <p className={s.hint}>من يمنح النقطة يتحمل قيمتها فإذا صرف العملاء عند الشريك أكثر مما اكتسبوه عنده فالفرق مستحق له على الديم وإذا اكتسبوا عنده أكثر مما صرفوه فالفرق مستحق عليه</p>
      <div className={s.tableWrap}><table className={s.table}>
        <thead><tr><th>شريك الفرنشايز</th><th>اكتسبها العملاء عنده</th><th>صرفها العملاء عنده</th><th>صافي النقاط</th><th>قيمة التسوية</th><th>المستحق</th><th>الإجراء</th></tr></thead>
        <tbody>{partners.map(item => { const net = item.redeemed - item.earned; const done = settled.includes(item.place); return <tr key={item.place}>
          <td><strong>{item.place}</strong></td><td><bdi className={s.num}>{n(item.earned)}</bdi></td><td><bdi className={s.num}>{n(item.redeemed)}</bdi></td>
          <td><bdi className={net > 0 ? x.minus : x.plus}>{n(Math.abs(net))}</bdi></td><td><bdi className={s.num}>{money(Math.abs(net) * VALUE)}</bdi></td>
          <td><span className={`${s.badge} ${done ? s.good : net > 0 ? s.bad : s.warn}`}>{done ? "تمت التسوية" : net > 0 ? "مستحق للشريك على الديم" : net < 0 ? "مستحق للديم على الشريك" : "متعادل"}</span></td>
          <td><button type="button" className={s.ghost} disabled={done || net === 0} onClick={() => settle(item.place, net)}>{done ? "سُجلت" : "تسجيل التسوية"}</button></td>
        </tr>; })}</tbody>
      </table></div>
    </section>
    <section className={s.panel} style={{ marginTop: 20 }}>
      <div className={s.panelHead}><h2>نقاط العملاء حسب المصدر</h2><span><bdi>{n(customers.length)}</bdi> عميل</span></div>
      <div className={x.filters}><label className={`${s.search} ${x.grow}`}><Search size={16} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث باسم العميل أو جواله أو رمزه" aria-label="بحث في العملاء" /></label></div>
      <div className={`${s.chips} ${x.chipsRow}`} role="group" aria-label="فئة العميل"><button type="button" aria-pressed={!tier} onClick={() => setTier("")}>كل الفئات</button>{tiers.map(item => <button type="button" key={item} aria-pressed={tier === item} onClick={() => setTier(item)}>{item}</button>)}</div>
      <p className={s.hint}>اضغط أي عميل لفتح صفحة نقاطه ومعرفة كل فرع أو شريك جمع منه أو صرف عنده</p>
      <div className={s.tableWrap}><table className={s.table}>
        <thead><tr><th>العميل</th><th>الجوال</th><th>الفئة</th><th>جمع من فروعنا</th><th>جمع من الفرنشايز</th><th>صرف في فروعنا</th><th>صرف عند الفرنشايز</th><th>الرصيد</th><th>قيمته</th></tr></thead>
        <tbody>{customers.map(row => <tr key={row.id} tabIndex={0} className={x.rowBtn} onClick={() => setOpenId(row.id)} onKeyDown={event => { if (event.key === "Enter") setOpenId(row.id); }}>
          <td><strong>{String(row.name)}</strong></td><td><bdi className={s.code}>{String(row.phone)}</bdi></td><td>{String(row.tier)}</td>
          <td><bdi className={x.plus}>{n(Number(row.earnedOwn ?? 0))}</bdi></td><td><bdi className={x.plus}>{n(Number(row.earnedFranchise ?? 0))}</bdi></td>
          <td><bdi className={x.minus}>{n(Number(row.redeemedOwn ?? 0))}</bdi></td><td><bdi className={x.minus}>{n(Number(row.redeemedFranchise ?? 0))}</bdi></td>
          <td><strong><bdi>{n(Number(row.points ?? 0))}</bdi></strong></td><td><bdi className={s.num}>{money(Number(row.points ?? 0) * VALUE)}</bdi></td>
        </tr>)}</tbody>
      </table>{customers.length === 0 && <p className={s.empty}>لا يوجد عميل مطابق للبحث</p>}</div>
    </section>
  </>;
}
