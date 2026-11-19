"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Barcode, Boxes, Coins, Route, Save, Tag } from "lucide-react";
import { money } from "./data";
import { useToast } from "./kit";
import { useDemo } from "./store";
import s from "./demo.module.css";

const CATEGORIES = ["حلويات شرقية", "كيك وحلى", "شوكولاتة وتمور", "ضيافة ومناسبات", "مبردات"];
const UNITS = ["كجم", "علبة", "قطعة", "صينية", "كيكة", "حبة", "كوب"];
const CHANNELS = ["نقاط بيع الفروع", "شركاء الفرنشايز", "طلبات المناسبات والشركات", "المتجر الإلكتروني"];
const ALLERGENS = ["القمح والجلوتين", "الحليب", "البيض", "المكسرات", "الفول السوداني", "السمسم", "الصويا"];
const STORAGE = ["جاف في درجة حرارة الغرفة", "مبرد من 2 إلى 5 م", "مجمد 18 م تحت الصفر"];
const round = (value: number) => Math.round(value * 100) / 100;

function Block({ icon, title, hint, children }: { icon: ReactNode; title: string; hint: string; children: ReactNode }) {
  return <section className={s.rule}><div className={s.ruleHead}><span>{icon}</span><div><strong>{title}</strong><small>{hint}</small></div></div><div className={s.ruleBody}>{children}</div></section>;
}
function Chips({ options, value, toggle, label }: { options: string[]; value: string[]; toggle: (option: string) => void; label: string }) {
  return <div className={s.chips} role="group" aria-label={label}>{options.map(option => <button type="button" key={option} aria-pressed={value.includes(option)} onClick={() => toggle(option)}>{option}</button>)}</div>;
}

/** New product page: pricing follows the chosen profit margin, then classification, distribution and tracing choices. */
export function ProductForm({ back, saved }: { back: () => void; saved: (name: string) => void }) {
  const { d, setPrice, log } = useDemo();
  const toast = useToast();
  const nextSku = `ALD-${1001 + d.products.length}`;
  const [form, setForm] = useState({ name: "", category: CATEGORIES[0], family: "", unit: UNITS[0], barcode: `628100${String(4100000 + d.products.length * 137).padStart(7, "0")}`, cost: 40, margin: 55, shelf: 7, reorder: 20, initial: 12, storage: STORAGE[0], warehouse: d.warehouses[0].name, line: "خط الشرقيات", origin: "المملكة العربية السعودية", points: 0, lot: true, expiry: true, fefo: true, serialLabel: true });
  const [branches, setBranches] = useState(d.branches.map(branch => branch.name));
  const [channels, setChannels] = useState(CHANNELS.slice(0, 2));
  const [allergens, setAllergens] = useState<string[]>(["القمح والجلوتين"]);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm(current => ({ ...current, [key]: value }));
  const num = (value: string) => { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; };
  const flip = (list: string[], setList: (next: string[]) => void) => (option: string) => setList(list.includes(option) ? list.filter(item => item !== option) : [...list, option]);
  // Selling price is derived from cost and the profit margin on cost; typing a price recalculates the margin instead.
  const price = round(form.cost * (1 + form.margin / 100));
  const profit = round(price - form.cost);
  const withVat = round(price * 1.15);
  function save() {
    const name = form.name.trim();
    if (name.length < 2) return setError("اكتب اسم المنتج أولًا");
    if (d.products.some(product => product.name === name)) return setError("يوجد منتج بهذا الاسم");
    if (!form.cost || !price) return setError("حدد التكلفة ونسبة الربح");
    if (!branches.length) return setError("اختر فرعًا واحدًا على الأقل لبيع المنتج");
    setError("");
    d.products.unshift({ id: `p-new-${d.products.length}`, image: "", name, category: form.category, unit: form.unit, price, cost: form.cost, shelf: form.shelf, sku: nextSku, barcode: form.barcode, sold: 0 });
    d.branches.forEach(branch => { d.branchStock[branch.name][nextSku] = branches.includes(branch.name) ? form.initial : 0; });
    branches.forEach(branch => setPrice(branch, nextSku, price));
    log(`إضافة المنتج ${name} برقم ${nextSku} وتوزيعه على ${branches.length} فروع`);
    toast("أضيف المنتج وفُتح سجله");
    saved(name);
  }
  return <>
    <button type="button" className={s.back} onClick={back}><ArrowRight size={16} aria-hidden="true" />العودة إلى المنتجات</button>
    <div className={s.split}>
      <div>
        <Block icon={<Tag size={20} aria-hidden="true" />} title="هوية المنتج وتصنيفه" hint="الاسم والتصنيف والوحدة والباركود الذي يباع به في كل الفروع">
          <div className={s.form}>
            <label>اسم المنتج<input value={form.name} maxLength={60} placeholder="مثال: كنافة بالفستق" onChange={event => set("name", event.target.value)} /></label>
            <label>التصنيف<select value={form.category} onChange={event => set("category", event.target.value)}>{CATEGORIES.map(option => <option key={option}>{option}</option>)}</select></label>
            <label>التصنيف الفرعي<input value={form.family} maxLength={40} placeholder="مثال: كنافة" onChange={event => set("family", event.target.value)} /></label>
            <label>وحدة البيع<select value={form.unit} onChange={event => set("unit", event.target.value)}>{UNITS.map(option => <option key={option}>{option}</option>)}</select></label>
            <label>رقم الصنف<input value={nextSku} readOnly dir="ltr" /></label>
            <label>الباركود<input value={form.barcode} dir="ltr" inputMode="numeric" maxLength={14} onChange={event => set("barcode", event.target.value.replace(/\D/g, ""))} /></label>
          </div>
        </Block>
        <Block icon={<Coins size={20} aria-hidden="true" />} title="التكلفة ونسبة الربح" hint="حدد نسبة الربح فيتعدل سعر البيع تلقائيًا أو اكتب السعر فتتعدل النسبة">
          <div className={s.form}>
            <label>تكلفة الوحدة بالريال<input type="text" inputMode="decimal" dir="ltr" min={0} step={0.5} value={form.cost} onChange={event => set("cost", num(event.target.value))} /></label>
            <label>نسبة الربح على التكلفة<input type="text" inputMode="decimal" dir="ltr" min={0} step={1} value={form.margin} onChange={event => set("margin", num(event.target.value))} /></label>
            <label>سعر البيع قبل الضريبة<input type="text" inputMode="decimal" dir="ltr" min={0} step={0.5} value={price} onChange={event => { const next = num(event.target.value); if (form.cost > 0) set("margin", round((next - form.cost) / form.cost * 100)); }} /></label>
            <label>نقاط ولاء إضافية للصنف<input type="text" inputMode="decimal" dir="ltr" min={0} value={form.points} onChange={event => set("points", num(event.target.value))} /></label>
          </div>
          <div className={s.chips} style={{ marginTop: 12 }} role="group" aria-label="نسب ربح سريعة">{[30, 45, 60, 80, 100].map(value => <button type="button" key={value} aria-pressed={form.margin === value} onClick={() => set("margin", value)}><bdi>{value}%</bdi></button>)}</div>
        </Block>
        <Block icon={<Boxes size={20} aria-hidden="true" />} title="التوزيع والبيع" hint="أين يباع المنتج وبأي قنوات وكم يوزع على كل فرع عند الإضافة">
          <p className={s.subLabel}>الفروع التي تبيع المنتج</p><Chips options={d.branches.map(branch => branch.name)} value={branches} toggle={flip(branches, setBranches)} label="فروع البيع" />
          <p className={s.subLabel}>قنوات البيع</p><Chips options={CHANNELS} value={channels} toggle={flip(channels, setChannels)} label="قنوات البيع" />
          <div className={s.form} style={{ marginTop: 14 }}>
            <label>الكمية الأولية لكل فرع<input type="text" inputMode="decimal" dir="ltr" min={0} value={form.initial} onChange={event => set("initial", num(event.target.value))} /></label>
            <label>مستودع الاستلام<select value={form.warehouse} onChange={event => set("warehouse", event.target.value)}>{d.warehouses.map(warehouse => <option key={warehouse.id}>{warehouse.name}</option>)}</select></label>
            <label>حد إعادة الطلب<input type="text" inputMode="decimal" dir="ltr" min={0} value={form.reorder} onChange={event => set("reorder", num(event.target.value))} /></label>
          </div>
        </Block>
        <Block icon={<Route size={20} aria-hidden="true" />} title="التتبع وسلامة الغذاء" hint="خيارات تجعل كل وحدة معروفة المصدر والتشغيلة والصلاحية ومكان البيع">
          <div className={s.toggles}>
            {([["lot", "تتبع بالتشغيلة", "كل إنتاج يأخذ رقم تشغيلة يلازمه حتى البيع"], ["expiry", "تتبع تاريخ الانتهاء", "تنبيه قبل الانتهاء ومنع بيع المنتهي"], ["fefo", "صرف الأقرب انتهاءً أولًا", "المستودع والفرع يصرفان التشغيلة الأقدم"], ["serialLabel", "ملصق تتبع على العبوة", "باركود التشغيلة يطبع مع بطاقة البيان"]] as const).map(([key, title, hint]) => <div key={key}><div><strong>{title}</strong><small>{hint}</small></div><button type="button" role="switch" aria-checked={form[key]} aria-label={title} className={s.switch} onClick={() => set(key, !form[key])} /></div>)}
          </div>
          <div className={s.form} style={{ marginTop: 14 }}>
            <label>مدة الصلاحية بالأيام<input type="text" inputMode="decimal" dir="ltr" min={1} value={form.shelf} onChange={event => set("shelf", Math.max(1, num(event.target.value)))} /></label>
            <label>ظروف الحفظ<select value={form.storage} onChange={event => set("storage", event.target.value)}>{STORAGE.map(option => <option key={option}>{option}</option>)}</select></label>
            <label>خط الإنتاج<select value={form.line} onChange={event => set("line", event.target.value)}>{["خط الشرقيات", "خط الكيك", "خط الشوكولاتة", "أسرة منتجة", "مورد خارجي"].map(option => <option key={option}>{option}</option>)}</select></label>
            <label>بلد المنشأ<input value={form.origin} maxLength={40} onChange={event => set("origin", event.target.value)} /></label>
          </div>
          <p className={s.subLabel}>مسببات الحساسية التي تظهر على بطاقة البيان</p><Chips options={ALLERGENS} value={allergens} toggle={flip(allergens, setAllergens)} label="مسببات الحساسية" />
        </Block>
        {error && <p role="alert" className={s.formError}>{error}</p>}
        <div className={s.actions} style={{ marginTop: 16 }}><button type="button" className={s.primary} onClick={save}><Save size={16} aria-hidden="true" />حفظ المنتج وفتح سجله</button><button type="button" className={s.ghost} onClick={back}>إلغاء</button></div>
      </div>
      <aside className={s.sim} aria-label="معاينة المنتج">
        <h2>{form.name.trim() || "منتج جديد"}</h2><p>{form.category}{form.family ? ` · ${form.family}` : ""} · {form.unit}</p>
        <div className={s.result}><span>سعر البيع</span><strong><bdi>{money(price)}</bdi></strong></div>
        <div className={s.steps}>
          <div><span>التكلفة</span><bdi>{money(form.cost)}</bdi></div>
          <div><span>نسبة الربح على التكلفة</span><bdi>{form.margin}%</bdi></div>
          <div><span>ربح الوحدة</span><bdi>{money(profit)}</bdi></div>
          <div><span>الهامش من سعر البيع</span><bdi>{price ? Math.round(profit / price * 100) : 0}%</bdi></div>
          <div><span>السعر شامل الضريبة</span><bdi>{money(withVat)}</bdi></div>
        </div>
        <div className={s.barcodeBox}><div className={s.barcodeBars} aria-hidden="true">{form.barcode.split("").map((digit, index) => <i key={index} style={{ width: `${1 + Number(digit) % 4}px`, marginInlineEnd: `${1 + (Number(digit) + index) % 3}px` }} />)}</div><bdi>{form.barcode}</bdi><small><Barcode size={13} aria-hidden="true" /> نفس الباركود في كل الفروع</small></div>
        <div className={s.steps}>
          <div><span>يباع في</span><bdi>{branches.length} فروع</bdi></div>
          <div><span>توزيع أولي</span><bdi>{branches.length * form.initial} {form.unit}</bdi></div>
          <div><span>الصلاحية</span><bdi>{form.shelf} يوم</bdi></div>
          <div><span>التتبع</span><span>{[form.lot && "تشغيلة", form.expiry && "صلاحية", form.fefo && "الأقرب انتهاءً"].filter(Boolean).join(" · ") || "بدون"}</span></div>
          <div><span>الحساسية</span><span>{allergens.length ? `${allergens.length} مسببات` : "لا يوجد"}</span></div>
        </div>
      </aside>
    </div>
  </>;
}
