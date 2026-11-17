"use client";

import { useEffect, useRef, useState } from "react";
import { Save, Hash, SlidersHorizontal, Wallet, ReceiptText, Printer, MessageCircle } from "lucide-react";
import styles from "./aldeem-sales-settings.module.css";

import { policySchema, defaults, type Policy } from "@/lib/finance/aldeem-sales-policy";
import { saveAldeemSalesPolicy } from "@/app/actions/aldeem-sales-policy";
import { loadAldeemAccountPolicy, aldeemPolicyChanged } from "@/lib/finance/aldeem-sales-policy-client";
type ToggleKey = { [K in keyof Policy]: Policy[K] extends boolean ? K : never }[keyof Policy];

export function AldeemSalesSettings() {
  const [draft, setDraft] = useState<Policy>(defaults);
  const [saved, setSaved] = useState<Policy>(defaults);
  const [ready, setReady] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const saveLock = useRef(false);
  useEffect(() => {
    let active = true;
    setReady(false); setError(""); setMessage("");
    void loadAldeemAccountPolicy().then(state => {
      if (!active) return;
      setDraft(state.policy); setSaved(state.policy); setRevision(state.revision);
      setHasSaved(state.revision > 0); setReady(true);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "تعذر تحميل إعدادات حساب الديم"); });
    return () => { active = false; };
  }, [attempt]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  function change<K extends keyof Policy>(key: K, value: Policy[K]) {
    setDraft(current => ({ ...current, [key]: value })); setMessage(""); setError("");
  }
  function toggle(key: ToggleKey, title: string, hint: string) {
    return <label className={styles.toggle} key={key}>
      <span><strong>{title}</strong><small id={`sales-help-${key}`}>{hint}</small></span>
      <input type="checkbox" role="switch" checked={draft[key]} onChange={event => change(key, event.target.checked)} aria-describedby={`sales-help-${key}`} />
    </label>;
  }
  async function save() {
    if (!ready || saveLock.current) return;
    const parsed = policySchema.safeParse(draft);
    if (!draft.print && !draft.whatsapp) { setError("اختر طريقة واحدة على الأقل لإصدار الفاتورة"); return; }
    if (![draft.cash, draft.network, draft.visa, draft.transfer].some(Boolean)) { setError("اختر طريقة دفع واحدة على الأقل"); return; }
    if (!parsed.success) { setError("راجع رقم أول فاتورة واسم الضريبة ونسبتها"); return; }
    try {
      saveLock.current = true; setSaving(true); setError(""); setMessage("");
      const result = await saveAldeemSalesPolicy(parsed.data, revision);
      if (!result.ok) { setError(result.message); return; }
      setSaved(result.data.policy); setDraft(result.data.policy); setRevision(result.data.revision);
      setHasSaved(true); setMessage("تم حفظ إعدادات حساب الديم وتتوفر من جميع الأجهزة");
      window.dispatchEvent(new Event(aldeemPolicyChanged));
    } catch { setError("لم يتم تأكيد حفظ الإعدادات تحقق من الاتصال ثم أعد المحاولة"); }
    finally { saveLock.current = false; setSaving(false); }
  }
  return <form className={styles.form} onSubmit={event => { event.preventDefault(); save(); }}>
    <div className={styles.notice}>إعدادات الفواتير مرتبطة بحساب الديم وتظهر عند الدخول من أي جهاز</div>
    <fieldset disabled={!ready || saving} className={styles.fields}>
      <section className={styles.section}>
        <h3><Hash size={18} aria-hidden="true" />الترقيم والتاريخ</h3>
        {toggle("autoNumber", "الترقيم التلقائي", "تحديد تسلسل أرقام الفواتير الجديدة بدءًا من الرقم الذي تختاره")}
        {draft.autoNumber && <div className={styles.inset}><label>رقم أول فاتورة<input type="number" min={1} max={999999999} step={1} required value={draft.firstNumber || ""} onChange={event => change("firstNumber", Number(event.target.value))} /></label><span>مثال التسلسل <bdi>{draft.firstNumber || "—"} ← {draft.firstNumber ? draft.firstNumber + 1 : "—"} ← {draft.firstNumber ? draft.firstNumber + 2 : "—"}</bdi></span></div>}
        {!draft.autoNumber && <p className={styles.hint}>يُدخل رقم كل فاتورة يدويًا عند إنشائها</p>}
        {toggle("editNumber", "تعديل رقم الفاتورة", "السماح بتغيير رقم الفاتورة المقترح قبل إصدارها")}
        {toggle("editDate", "تعديل تاريخ الفاتورة", "السماح باختيار تاريخ الفاتورة بدلًا من تاريخ اليوم")}
      </section>
      <section className={styles.section}>
        <h3><SlidersHorizontal size={18} aria-hidden="true" />الأصناف والأسعار</h3>
        {toggle("lastPrice", "إظهار آخر سعر بيع للعميل", "عرض آخر سعر اشترى به العميل المحدد هذا الصنف")}
        {toggle("showCost", "إظهار تكلفة الصنف", "عرض التكلفة للموظف داخل شاشة الإدخال فقط دون طباعتها للعميل")}
        {toggle("minimumPrice", "إظهار أقل سعر بيع للصنف", "عرض الحد الأدنى المسجل في بيانات الصنف أثناء إدخاله")}
        {toggle("discounts", "تفعيل الخصومات", "إتاحة إدخال الخصم على الفاتورة وأصنافها")}
        <div className={styles.inset}><label>الخانات العشرية الظاهرة<select value={draft.decimals} onChange={event => change("decimals", Number(event.target.value))}>{[0, 1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}</option>)}</select></label><span>مثال <bdi>{(12.345678).toFixed(draft.decimals)}</bdi><small>تنسيق العرض فقط مع الاحتفاظ بدقة الحسابات</small></span></div>
        {toggle("belowCost", "السماح بالبيع بأقل من التكلفة", "إتاحة إصدار فاتورة بسعر بيع بعد الخصم أقل من تكلفة الصنف")}
        {toggle("outOfStock", "السماح بالبيع عند نفاد المخزون", "إتاحة بيع الأصناف المخزنية رغم عدم كفاية الرصيد وقد يصبح الرصيد سالبًا")}
      </section>
      <section className={styles.section}>
        <h3><ReceiptText size={18} aria-hidden="true" />إصدار الفاتورة</h3>
        <p className={styles.hint}>حدد الطرق المتاحة بعد إصدار الفاتورة ويمكن تفعيل الطريقتين</p>
        <div className={styles.choices}>{([["print", "طباعة", Printer], ["whatsapp", "إرسال عبر الواتساب", MessageCircle]] as const).map(([key, label, Icon]) => <label key={key}><Icon size={18} aria-hidden="true" /><span>{label}</span><input type="checkbox" checked={draft[key]} onChange={event => change(key, event.target.checked)} /></label>)}</div>
        {toggle("preview", "معاينة الفاتورة قبل الحفظ", "عرض الفاتورة للمراجعة قبل تأكيد الحفظ والإصدار")}
      </section>
      <section className={styles.section}>
        <h3><Wallet size={18} aria-hidden="true" />التحصيل وطرق الدفع</h3>
        {toggle("credit", "البيع الآجل للفواتير", "السماح بتسجيل المبلغ غير المسدد في مديونية العميل")}
        <p className={styles.hint}>طرق الدفع المعتمدة في تحصيل مبالغ الفاتورة</p>
        <div className={styles.choices}>{([["cash", "كاش"], ["network", "شبكة"], ["visa", "فيزا"], ["transfer", "تحويل بنكي"]] as const).map(([key, label]) => <label key={key}><span>{label}</span><input type="checkbox" checked={draft[key]} onChange={event => change(key, event.target.checked)} /></label>)}</div>
      </section>
      <section className={styles.section}>
        <h3><ReceiptText size={18} aria-hidden="true" />الضريبة الافتراضية</h3>
        {toggle("taxEnabled", "تطبيق ضريبة افتراضية", "إضافة الضريبة المحددة تلقائيًا إلى أصناف الفواتير الجديدة")}
        {draft.taxEnabled && <div className={styles.taxFields}><label>اسم الضريبة<input value={draft.taxName} required maxLength={80} onChange={event => change("taxName", event.target.value)} /></label><label>نسبة الضريبة %<input type="number" min={0} max={100} step="0.01" required value={draft.taxRate} onChange={event => change("taxRate", Number(event.target.value))} /></label></div>}
      </section>
    </fieldset>
    <footer className={styles.footer}>
      <div aria-live="polite">{error ? <span role="alert" className={styles.error}>{error}</span> : message || (!ready ? "جار تحميل إعدادات الحساب" : dirty ? "تغييرات غير محفوظة" : hasSaved ? "محفوظة على حساب الديم" : "خيارات افتراضية لم تُحفظ بعد")}</div>
      <div className={styles.actions}>{error && <button type="button" disabled={saving} onClick={() => setAttempt(value => value + 1)}>إعادة تحميل إعدادات الحساب</button>}<button type="button" disabled={!dirty || !ready || saving} onClick={() => { setDraft(saved); setError(""); setMessage(""); }}>تراجع</button><button type="submit" disabled={!ready || saving} className={styles.save}><Save size={17} aria-hidden="true" />{saving ? "جار الحفظ" : "حفظ الإعدادات"}</button></div>
    </footer>
  </form>;
}
