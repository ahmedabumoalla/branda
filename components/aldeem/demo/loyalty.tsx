"use client";

import { useState, type ReactNode } from "react";
import { Banknote, Crown, Gift, Package, Store, UserRound } from "lucide-react";
import { TIERS, count, money, sum, type DemoData } from "./data";
import { Kpis, Register, useToast } from "./kit";
import { invoiceView } from "./tax-invoice";
import s from "./demo.module.css";

const n = (value: number) => value.toLocaleString("en-US");
const CATEGORIES = ["حلويات شرقية", "كيك وحلى", "شوكولاتة وتمور", "ضيافة ومناسبات", "مبردات"];

/** Stamp card: one stamp per visit, kept apart from the points programme. */
export function DemoLoyaltyCard({ d }: { d: DemoData }) {
  const toast = useToast();
  const [stamps, setStamps] = useState(10);
  const [reward, setReward] = useState("علبة حلويات مشكلة مجانًا");
  const [trigger, setTrigger] = useState("visit");
  const [minimum, setMinimum] = useState(50);
  const filled = Math.min(6, stamps - 1);
  return <>
    <p className={s.note} style={{ margin: "0 0 18px" }}>بطاقة الولاء تعمل بالأختام وتمنح مكافأة عند اكتمالها وهي مستقلة عن برنامج النقاط ويمكن تشغيل أحدهما أو كليهما معًا</p>
    <div className={s.cardStage}>
      <div className={s.pass} aria-label="معاينة بطاقة الولاء">
        <header><strong>ولاء الديم</strong><span>بطاقة الأختام</span></header>
        <div className={s.stamps}>{Array.from({ length: stamps }, (_, index) => <i key={index} className={index < filled ? s.on : ""}>{index < filled ? "✓" : index === stamps - 1 ? "★" : ""}</i>)}</div>
        <footer><div><span>الأختام</span><b><bdi>{filled} / {stamps}</bdi></b></div><div><span>المكافأة</span><b>{reward}</b></div></footer>
      </div>
      <section className={s.panel}><div className={s.panelHead}><h2>إعدادات بطاقة الأختام</h2><span>تنعكس على المعاينة مباشرة</span></div><div className={s.panelBody}>
        <div className={s.form}>
          <label>عدد الأختام للمكافأة<select value={stamps} onChange={event => setStamps(Number(event.target.value))}>{[5, 6, 7, 8, 9, 10, 12].map(value => <option key={value} value={value}>{value} أختام</option>)}</select></label>
          <label>المكافأة عند الاكتمال<input value={reward} maxLength={60} onChange={event => setReward(event.target.value)} /></label>
          <label>يمنح الختم عند<select value={trigger} onChange={event => setTrigger(event.target.value)}><option value="visit">كل زيارة</option><option value="invoice">كل فاتورة فوق مبلغ محدد</option></select></label>
          {trigger === "invoice" && <label>الحد الأدنى للفاتورة بالريال<input type="text" inputMode="decimal" dir="ltr" min={1} value={minimum} onChange={event => setMinimum(Number(event.target.value))} /></label>}
        </div>
        <p className={s.note}>الختم يسجله الكاشير بقراءة بطاقة العميل من Apple Wallet أو Google Wallet ورصيد الأختام واحد في كل الفروع</p>
        <div style={{ marginTop: 14 }}><button type="button" className={s.primary} onClick={() => toast("حُفظت إعدادات بطاقة الأختام في العرض التجريبي")}>حفظ الإعدادات</button></div>
      </div></section>
    </div>
    <div style={{ marginTop: 22 }}><Register title="سجل الأختام" def={{ kpis: [{ label: "بطاقات مصدرة", value: n(sum(d.loyaltyBranches, "cards")) }, { label: "أختام هذا الشهر", value: n(sum(d.loyaltyBranches, "stampsMonth")), tone: "good" }, { label: "مكافآت مستبدلة", value: n(sum(d.loyaltyBranches, "rewards")) }, { label: "عملاء عادوا خلال 30 يومًا", value: "68%", tone: "good" }], rows: d.stampLog, cols: [["date", "التاريخ", "date"], ["customer", "العميل", "strong"], ["phone", "الجوال", "code"], ["branch", "الفرع"], ["cashier", "الكاشير"], ["stamps", "الأختام", "date"], ["wallet", "المحفظة"], ["status", "الحركة", "status"]] }} /></div>
  </>;
}

type Rules = {
  amount: { on: boolean; per: number; points: number; min: number };
  item: { on: boolean; categories: Record<string, number> };
  branch: { on: boolean; values: Record<string, number> };
  tier: { on: boolean; values: Record<string, number>; from: Record<string, number>; basis: string };
  customer: { on: boolean; values: Record<string, number> };
  redeem: { points: number; riyal: number; min: number; months: number };
};
const KEY = "aldeem.demo.points-rules.v3";
const TIER_FROM: Record<string, number[]> = { points: [0, 1000, 2000, 3000], spent: [0, 2500, 8000, 15000] };

function Rule({ icon, title, summary, on, toggle, children }: { icon: ReactNode; title: string; summary: string; on: boolean; toggle: () => void; children: ReactNode }) {
  return <section className={`${s.rule} ${on ? "" : s.ruleOff}`}>
    <div className={s.ruleHead}><span>{icon}</span><div><strong>{title}</strong><small>{summary}</small></div><button type="button" role="switch" aria-checked={on} aria-label={`${on ? "إيقاف" : "تفعيل"} ${title}`} className={s.switch} onClick={toggle} /></div>
    {on && <div className={s.ruleBody}>{children}</div>}
  </section>;
}

/** Points programme: the owner chooses what earns points and what multiplies them, then tries a basket. */
export function DemoPoints({ d }: { d: DemoData }) {
  const toast = useToast();
  const vip = d.customers.filter(row => row.tier === "بلاتيني").slice(0, 3).map(row => String(row.name));
  const [rules, setRules] = useState<Rules>(() => {
    const initial: Rules = {
      amount: { on: true, per: 1, points: 1, min: 20 },
      item: { on: true, categories: { "حلويات شرقية": 0, "كيك وحلى": 5, "شوكولاتة وتمور": 10, "ضيافة ومناسبات": 50, "مبردات": 0 } },
      branch: { on: true, values: Object.fromEntries(d.branches.map((branch, index) => [branch.name, index === 4 ? 2 : index === 1 ? 1.5 : 1])) },
      tier: { on: true, values: { "برونزي": 1, "فضي": 1.25, "ذهبي": 1.5, "بلاتيني": 2 }, from: Object.fromEntries(TIERS.map((tier, index) => [tier, TIER_FROM.points[index]])), basis: "points" },
      customer: { on: false, values: Object.fromEntries(vip.map(name => [name, 3])) },
      redeem: { points: 100, riyal: 10, min: 10, months: 12 },
    };
    try { const saved = window.localStorage.getItem(KEY); return saved ? { ...initial, ...(JSON.parse(saved) as Partial<Rules>) } : initial; } catch { return initial; }
  });
  const [basket, setBasket] = useState({ branch: d.branches[0].name, tier: "ذهبي", customer: "", amount: 240, category: "ضيافة ومناسبات", qty: 1 });
  const set = <K extends keyof Rules>(key: K, patch: Partial<Rules[K]>) => setRules(current => ({ ...current, [key]: { ...current[key], ...patch } }));
  const number = (value: string, fallback = 0) => { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback; };
  const save = () => { try { window.localStorage.setItem(KEY, JSON.stringify(rules)); } catch { /* private window */ } toast("حُفظت قواعد النقاط في العرض التجريبي"); };

  const base = rules.amount.on && basket.amount >= rules.amount.min && rules.amount.per > 0 ? Math.floor(basket.amount / rules.amount.per) * rules.amount.points : 0;
  const itemPoints = rules.item.on ? (rules.item.categories[basket.category] ?? 0) * basket.qty : 0;
  const branchX = rules.branch.on ? rules.branch.values[basket.branch] ?? 1 : 1;
  const tierX = rules.tier.on ? rules.tier.values[basket.tier] ?? 1 : 1;
  const customerX = rules.customer.on && basket.customer ? rules.customer.values[basket.customer] ?? 1 : 1;
  const earned = Math.round((base + itemPoints) * branchX * tierX * customerX);
  const worth = rules.redeem.points > 0 ? earned / rules.redeem.points * rules.redeem.riyal : 0;
  const earnRows = d.pointsLedger.filter(row => row.kind === "اكتساب");
  // A customer's tier follows the owner's thresholds: the highest tier whose starting value the customer has reached.
  const metric = (row: (typeof d.customers)[number]) => rules.tier.basis === "spent" ? Number(row.spent ?? 0) : Number(row.earnedOwn ?? 0) + Number(row.earnedFranchise ?? 0);
  const tierOf = (value: number) => [...TIERS].reverse().find(tier => value >= (rules.tier.from[tier] ?? 0)) ?? TIERS[0];
  const tierCount = (tier: string) => d.customers.filter(row => tierOf(metric(row)) === tier).length;
  const unitLabel = rules.tier.basis === "spent" ? "ريال مشتريات" : "نقطة مجمعة";

  return <>
    <p className={s.note} style={{ margin: "0 0 18px" }}>النقاط برنامج مستقل عن بطاقة الأختام وأنت تحدد هنا على ماذا تُحتسب ثم تجرب النتيجة على فاتورة قبل الحفظ</p>
    <Kpis items={[{ label: "نقاط مكتسبة هذا الشهر", value: n(sum(d.loyaltyBranches, "pointsMonth")), tone: "good" }, { label: "أرصدة العملاء", value: n(sum(d.customers, "points")), note: `تعادل ${money(sum(d.customers, "points") / rules.redeem.points * rules.redeem.riyal)}` }, { label: "عمليات اكتساب", value: n(earnRows.length) }, { label: "عملاء بلاتيني", value: n(count(d.customers, "tier", "بلاتيني")) }]} />
    <div className={s.split}>
      <div>
        <Rule icon={<Banknote size={20} aria-hidden="true" />} title="على قيمة الفاتورة" summary="نقاط مقابل كل مبلغ يدفعه العميل" on={rules.amount.on} toggle={() => set("amount", { on: !rules.amount.on })}>
          <div className={s.inline}>كل<input type="text" inputMode="decimal" dir="ltr" min={1} aria-label="المبلغ بالريال" value={rules.amount.per} onChange={event => set("amount", { per: number(event.target.value, 1) })} />ريال يساوي<input type="text" inputMode="decimal" dir="ltr" min={0} aria-label="عدد النقاط" value={rules.amount.points} onChange={event => set("amount", { points: number(event.target.value) })} />نقطة</div>
          <div className={s.inline}>لا تُحتسب النقاط لفاتورة أقل من<input type="text" inputMode="decimal" dir="ltr" min={0} aria-label="الحد الأدنى للفاتورة" value={rules.amount.min} onChange={event => set("amount", { min: number(event.target.value) })} />ريال</div>
        </Rule>
        <Rule icon={<Package size={20} aria-hidden="true" />} title="على الصنف" summary="نقاط إضافية ثابتة لكل وحدة من تصنيف محدد" on={rules.item.on} toggle={() => set("item", { on: !rules.item.on })}>
          <table className={s.mini}><tbody>{CATEGORIES.map(category => <tr key={category}><td>{category}</td><td style={{ textAlign: "end" }}><input type="text" inputMode="decimal" dir="ltr" min={0} aria-label={`نقاط ${category}`} value={rules.item.categories[category] ?? 0} onChange={event => set("item", { categories: { ...rules.item.categories, [category]: number(event.target.value) } })} /> نقطة لكل وحدة</td></tr>)}</tbody></table>
        </Rule>
        <Rule icon={<Store size={20} aria-hidden="true" />} title="على الفرع" summary="مضاعف لنقاط الفروع التي تريد تنشيطها" on={rules.branch.on} toggle={() => set("branch", { on: !rules.branch.on })}>
          <table className={s.mini}><tbody>{d.branches.map(branch => <tr key={branch.id}><td>{branch.full}</td><td style={{ textAlign: "end" }}>× <input type="text" inputMode="decimal" dir="ltr" min={0} step={0.25} aria-label={`مضاعف ${branch.name}`} value={rules.branch.values[branch.name] ?? 1} onChange={event => set("branch", { values: { ...rules.branch.values, [branch.name]: number(event.target.value, 1) } })} /></td></tr>)}</tbody></table>
        </Rule>
        <Rule icon={<Crown size={20} aria-hidden="true" />} title="على فئة العميل" summary="حدد متى ينتقل العميل من فئة إلى أخرى ومضاعف نقاط كل فئة" on={rules.tier.on} toggle={() => set("tier", { on: !rules.tier.on })}>
          <div className={s.inline} style={{ marginBottom: 12 }}>تحسب فئة العميل على<select value={rules.tier.basis} aria-label="أساس احتساب الفئة" onChange={event => set("tier", { basis: event.target.value, from: Object.fromEntries(TIERS.map((tier, index) => [tier, TIER_FROM[event.target.value][index]])) })}><option value="points">مجموع النقاط التي جمعها</option><option value="spent">مجموع مشترياته بالريال</option></select></div>
          <table className={s.mini}><thead><tr><th>الفئة</th><th>من</th><th>إلى</th><th>مضاعف النقاط</th><th>عملاء الفئة الآن</th></tr></thead><tbody>{TIERS.map((tier, index) => { const next = TIERS[index + 1]; return <tr key={tier}>
            <td><strong>{tier}</strong></td>
            <td><input type="text" inputMode="decimal" dir="ltr" aria-label={`بداية فئة ${tier}`} disabled={index === 0} value={rules.tier.from[tier] ?? 0} onChange={event => set("tier", { from: { ...rules.tier.from, [tier]: number(event.target.value) } })} /></td>
            <td>{next ? <bdi>{n(Math.max(rules.tier.from[tier] ?? 0, (rules.tier.from[next] ?? 0) - 1))}</bdi> : "فأكثر"}</td>
            <td>× <input type="text" inputMode="decimal" dir="ltr" aria-label={`مضاعف ${tier}`} value={rules.tier.values[tier] ?? 1} onChange={event => set("tier", { values: { ...rules.tier.values, [tier]: number(event.target.value, 1) } })} /></td>
            <td><bdi>{tierCount(tier)}</bdi> عميل</td>
          </tr>; })}</tbody></table>
          <p className={s.note}>العميل يكون برونزيًا من <bdi>{n(rules.tier.from["برونزي"] ?? 0)}</bdi> إلى <bdi>{n((rules.tier.from["فضي"] ?? 0) - 1)}</bdi> {unitLabel} ويصير فضيًا من <bdi>{n(rules.tier.from["فضي"] ?? 0)}</bdi> إلى <bdi>{n((rules.tier.from["ذهبي"] ?? 0) - 1)}</bdi> وذهبيًا من <bdi>{n(rules.tier.from["ذهبي"] ?? 0)}</bdi> إلى <bdi>{n((rules.tier.from["بلاتيني"] ?? 0) - 1)}</bdi> وبلاتينيًا من <bdi>{n(rules.tier.from["بلاتيني"] ?? 0)}</bdi> فأكثر وينتقل تلقائيًا عند بلوغ الحد</p>
        </Rule>
        <Rule icon={<UserRound size={20} aria-hidden="true" />} title="على عميل محدد" summary="مضاعف خاص لعملاء تختارهم بالاسم" on={rules.customer.on} toggle={() => set("customer", { on: !rules.customer.on })}>
          <table className={s.mini}><tbody>{vip.map(name => <tr key={name}><td>{name}</td><td style={{ textAlign: "end" }}>× <input type="text" inputMode="decimal" dir="ltr" min={0} step={0.25} aria-label={`مضاعف ${name}`} value={rules.customer.values[name] ?? 1} onChange={event => set("customer", { values: { ...rules.customer.values, [name]: number(event.target.value, 1) } })} /></td></tr>)}</tbody></table>
        </Rule>
        <section className={s.rule}><div className={s.ruleHead}><span><Gift size={20} aria-hidden="true" /></span><div><strong>استبدال النقاط</strong><small>قيمة النقطة وحد الاستبدال ومدة الصلاحية</small></div></div><div className={s.ruleBody}>
          <div className={s.inline}>كل<input type="text" inputMode="decimal" dir="ltr" min={1} aria-label="عدد النقاط للاستبدال" value={rules.redeem.points} onChange={event => set("redeem", { points: number(event.target.value, 1) })} />نقطة تساوي<input type="text" inputMode="decimal" dir="ltr" min={0} aria-label="قيمة الاستبدال بالريال" value={rules.redeem.riyal} onChange={event => set("redeem", { riyal: number(event.target.value) })} />ريال خصم</div>
          <div className={s.inline}>أقل رصيد للاستبدال<input type="text" inputMode="decimal" dir="ltr" min={0} aria-label="أقل رصيد للاستبدال" value={rules.redeem.min} onChange={event => set("redeem", { min: number(event.target.value) })} />نقطة وتنتهي النقاط بعد<input type="text" inputMode="decimal" dir="ltr" min={1} aria-label="مدة صلاحية النقاط بالأشهر" value={rules.redeem.months} onChange={event => set("redeem", { months: number(event.target.value, 1) })} />شهرًا</div>
        </div></section>
        <div style={{ marginTop: 16 }}><button type="button" className={s.primary} onClick={save}>حفظ قواعد النقاط</button></div>
      </div>
      <aside className={s.sim} aria-label="تجربة احتساب النقاط">
        <h2>جرّب الاحتساب</h2><p>غيّر الفاتورة وشاهد النقاط حسب قواعدك</p>
        <label>الفرع<select value={basket.branch} onChange={event => setBasket({ ...basket, branch: event.target.value })}>{d.branches.map(branch => <option key={branch.id}>{branch.name}</option>)}</select></label>
        <label>فئة العميل<select value={basket.tier} onChange={event => setBasket({ ...basket, tier: event.target.value })}>{TIERS.map(tier => <option key={tier}>{tier}</option>)}</select></label>
        <label>عميل محدد<select value={basket.customer} onChange={event => setBasket({ ...basket, customer: event.target.value })}><option value="">بدون</option>{vip.map(name => <option key={name}>{name}</option>)}</select></label>
        <label>قيمة الفاتورة بالريال<input type="text" inputMode="decimal" dir="ltr" min={0} value={basket.amount} onChange={event => setBasket({ ...basket, amount: number(event.target.value) })} /></label>
        <label>تصنيف الصنف<select value={basket.category} onChange={event => setBasket({ ...basket, category: event.target.value })}>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
        <label>عدد الوحدات<input type="text" inputMode="decimal" dir="ltr" min={1} value={basket.qty} onChange={event => setBasket({ ...basket, qty: Math.max(1, number(event.target.value, 1)) })} /></label>
        <div className={s.steps}>
          <div><span>نقاط قيمة الفاتورة</span><bdi>{n(base)}</bdi></div>
          <div><span>نقاط الصنف</span><bdi>{n(itemPoints)}</bdi></div>
          <div><span>مضاعف الفرع</span><bdi>× {branchX}</bdi></div>
          <div><span>مضاعف الفئة</span><bdi>× {tierX}</bdi></div>
          <div><span>مضاعف العميل</span><bdi>× {customerX}</bdi></div>
        </div>
        <div className={s.result}><span>يكسب العميل</span><strong><bdi>{n(earned)}</bdi></strong></div>
        <p style={{ marginTop: 8 }}>تعادل خصمًا بقيمة <bdi>{money(worth)}</bdi> عند الاستبدال</p>
      </aside>
    </div>
    <div style={{ marginTop: 22 }}><Register title="سجل النقاط" renderOpen={invoiceView} def={{ tabKey: "basis", kpis: [], rows: d.pointsLedger, cols: [["date", "التاريخ", "date"], ["customer", "العميل", "strong"], ["tier", "الفئة"], ["placeType", "الجهة", "status"], ["place", "المكان"], ["kind", "الحركة"], ["basis", "أساس الاحتساب"], ["invoice", "الفاتورة", "code"], ["points", "النقاط", "num"], ["status", "الحالة", "status"]] }} /></div>
  </>;
}
