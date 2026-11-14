"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, RotateCcw, Save } from "lucide-react";
import { getFinanceInvoiceSettings, saveFinanceInvoiceSettings } from "@/app/actions/finance-invoice-settings";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { InvoiceSettings, InvoiceSettingsState } from "@/lib/finance/invoice-settings";
import { invoiceSettingsCache, invoiceSettingsCacheTtl, type EditableInvoiceSettings } from "@/lib/finance/invoice-settings-cache";
import { FinanceInvoiceSettingsManagement } from "./finance-invoice-settings-management";
import styles from "./finance-invoice-settings.module.css";

const sections = [["issue", "إصدار الفاتورة"], ["pricing", "التسعير والخصومات"], ["payment", "الدفع والائتمان"], ["stock", "قيود توفر وصلاحية المخزون"], ["journal", "القيود المحاسبية"], ["tax", "الضريبة الافتراضية"]] as const;
type Props = { slug: string; snapshot: FinanceSnapshot; settings: FinanceSnapshot["settings"]; canEdit: boolean; disabled: boolean; onBack: () => void; onEditTax?: () => void };

function Toggle({ id, title, hint, checked, disabled, onChange, reason }: { id: string; title: string; hint?: string; checked: boolean; disabled: boolean; onChange?: (value: boolean) => void; reason?: string }) {
  const helpId = "invoice-setting-help-" + id;
  return <div className={styles.row}><label className={styles.toggleLabel} htmlFor={"invoice-setting-" + id}><strong className={styles.fieldTitle}>{title}</strong><span className={styles.toggleControl}><span>{checked ? "مفعّل" : "غير مفعّل"}</span><span className={styles.switch}><input id={"invoice-setting-" + id} type="checkbox" role="switch" checked={checked} disabled={disabled} aria-describedby={hint ? helpId : undefined} onChange={event => { if (!disabled) onChange?.(event.target.checked); }} /><span aria-hidden="true" /></span></span></label>{hint && <span className={styles.hint} id={helpId}>{hint}</span>}{reason && <small className={styles.unavailable}>{reason}</small>}</div>;
}
function Field({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return <div className={styles.row}><label className={styles.fieldTitle} htmlFor={id}>{title}</label><div className={styles.control}>{children}</div>{hint && <span className={styles.hint} id={id + "-help"}>{hint}</span>}</div>;
}

function InvoiceSettingsNavigation() {
  const [active, setActive] = useState<string>(sections[0][0]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const marker = window.innerWidth <= 560 ? 230 : window.innerWidth <= 780 ? 190 : 140;
      let current: string = sections[0][0];
      for (const [id] of sections) {
        const section = document.getElementById("invoice-settings-" + id);
        if (section && section.getBoundingClientRect().top <= marker) current = id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) current = sections[sections.length - 1][0];
      setActive(current);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    const followHash = () => {
      const id = sections.find(([key]) => window.location.hash === "#invoice-settings-" + key)?.[0];
      if (!id) { schedule(); return; }
      document.getElementById("invoice-settings-" + id)?.scrollIntoView({ behavior: "auto", block: "start" });
      setActive(id);
    };
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", followHash);
    followHash();
    return () => {
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", followHash);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return <nav className={styles.sidebar} aria-label="أقسام إعدادات الفاتورة">{sections.map(([id, label]) => <a key={id} href={"#invoice-settings-" + id} aria-current={active === id ? "location" : undefined} onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = document.getElementById("invoice-settings-" + id);
    if (!target) return;
    event.preventDefault();
    window.history.replaceState(window.history.state, "", "#invoice-settings-" + id);
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    setActive(id);
  }}>{label}</a>)}</nav>;
}

export function FinanceInvoiceSettings(props: Props) {
  return <InvoiceSettingsLoader key={props.slug} {...props} />;
}
function InvoiceSettingsLoader(props: Props) {
  const cache = invoiceSettingsCache(props.snapshot);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ attempt: number; data?: EditableInvoiceSettings; error?: string } | null>(() => {
    const data = cache.read<EditableInvoiceSettings>(props.slug);
    return data ? { attempt: 0, data } : null;
  });
  useEffect(() => {
    let active = true;
    cache.load(props.slug, invoiceSettingsCacheTtl, async () => {
      const result = await getFinanceInvoiceSettings(props.slug);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    }).then(data => { if (active) setLoaded({ attempt, data }); }).catch((error: unknown) => { if (active) setLoaded({ attempt, error: error instanceof Error ? error.message : "تعذر تحميل إعدادات الفاتورة أعد المحاولة" }); });
    return () => { active = false; };
  }, [props.slug, attempt, cache]);
  const current = loaded?.attempt === attempt ? loaded : null;
  if (!current?.data) return <section className={styles.page} dir="rtl" aria-busy={!current}><div className={styles.heading}><h2>إعدادات الفاتورة</h2><button type="button" onClick={props.onBack}><ArrowRight size={16} aria-hidden="true" />إعدادات المبيعات</button></div>{!current ? <p role="status" className={styles.notice}>جار تحميل إعدادات الفاتورة</p> : <div role="alert" className={styles.error}><p>{current.error || "إعدادات الفاتورة غير متاحة"}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div>}</section>;
  return <InvoiceSettingsForm key={attempt} {...props} canEdit={current.data.canEdit} initial={current.data} onReload={() => { cache.clear(); setAttempt(value => value + 1); }} />;
}

function InvoiceSettingsForm({ slug, snapshot, settings, canEdit, disabled, onBack, onEditTax, initial, onReload }: Props & { initial: InvoiceSettingsState; onReload: () => void }) {
  const [saved, setSaved] = useState(initial), [draft, setDraft] = useState(initial.settings);
  const [saving, setSaving] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [categoriesOpen, setCategoriesOpen] = useState(initial.settings.advanced.excludedCategories.length > 0);
  const lock = useRef(false);
  const dirty = JSON.stringify(saved.settings) !== JSON.stringify(draft);
  const blocked = disabled || saving || !canEdit;
  function change<K extends keyof InvoiceSettings>(key: K, value: InvoiceSettings[K]) { if (!blocked) { setDraft(current => ({ ...current, [key]: value })); setMessage(""); } }
  const advanced = draft.advanced;
  function changeAdvanced<K extends keyof InvoiceSettings["advanced"]>(key: K, value: InvoiceSettings["advanced"][K]) { change("advanced", { ...advanced, [key]: value }); }
  const manage = (mode: Parameters<typeof FinanceInvoiceSettingsManagement>[0]["mode"], title: string) => <FinanceInvoiceSettingsManagement mode={mode} title={title} value={advanced} snapshot={snapshot} disabled={blocked} onChange={value => change("advanced", value)} />;
  const categories = [...new Set([...snapshot.products.map(row => row.category).filter(Boolean), ...advanced.excludedCategories])];
  async function save() {
    if (lock.current || blocked || !dirty) return;
    lock.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const result = await saveFinanceInvoiceSettings(slug, draft, saved.revision);
      if (!result.ok) { setError(result.message); return; }
      setSaved(result.data); setDraft(result.data.settings); setMessage("تم حفظ إعدادات الفاتورة");
      invoiceSettingsCache(snapshot).write(slug, { ...result.data, canEdit }, invoiceSettingsCacheTtl);
    } catch { setError("تعذر تأكيد حفظ الإعدادات أعد تحميلها قبل المحاولة مجددًا"); }
    finally { lock.current = false; setSaving(false); }
  }
  return <form className={styles.page} dir="rtl" aria-label="إعدادات الفاتورة" aria-busy={saving} onSubmit={event => { event.preventDefault(); void save(); }}>
    <header className={styles.heading}><div><h2>إعدادات الفاتورة</h2><p>خيارات فواتير إدارة المبيعات لا تغيّر إعدادات نقطة البيع</p></div><button type="button" disabled={saving || dirty} onClick={() => { if (!saving && !dirty) onBack(); }}><ArrowRight size={16} aria-hidden="true" />إعدادات المبيعات</button></header>
    <div className={styles.topbar}><span role="status" className={styles.dirty}>{dirty ? "تغييرات غير محفوظة" : ""}</span><div><button type="submit" className={styles.save} disabled={blocked || !dirty}><Save size={16} aria-hidden="true" />{saving ? "جار الحفظ" : "حفظ"}</button><button type="button" disabled={saving || !dirty} onClick={() => { if (!saving) { setDraft(saved.settings); setCategoriesOpen(saved.settings.advanced.excludedCategories.length > 0); setError(""); setMessage("تم تجاهل التغييرات"); } }}><RotateCcw size={16} aria-hidden="true" />تجاهل</button></div></div>
    {dirty && <p className={styles.notice}>احفظ التغييرات أو تجاهلها قبل العودة أو فتح إعدادات الضريبة</p>}
    {!canEdit && <p className={styles.notice}>يمكنك عرض الإعدادات تعديلها متاح للحساب المصرح له</p>}{disabled && <p className={styles.notice}>انتظر اكتمال تحديث البيانات قبل حفظ الإعدادات</p>}{error && <div role="alert" className={styles.error}><p>{error}</p><button type="button" disabled={saving} onClick={onReload}>إعادة تحميل الإعدادات</button></div>}{message && <p role="status" className={styles.success}>{message}</p>}
    <div className={styles.layout}><InvoiceSettingsNavigation /><div className={styles.sections}>
      <section id="invoice-settings-issue" className={styles.panel} aria-labelledby="invoice-settings-title-issue"><h3 id="invoice-settings-title-issue">إصدار الفاتورة</h3>
        <Field id="invoice-next-number" title="الرقم التسلسلي للفاتورة التالية" hint="رقم العرض التالي للمستندات الجديدة ويُحجز عند الإصدار لمنع التكرار"><input id="invoice-next-number" readOnly value={advanced.numbering.prefix + String(advanced.numbering.next).padStart(Math.max(1, Math.min(12, advanced.numbering.padding)), "0")} aria-describedby="invoice-next-number-help" />{manage("numbering", "إعدادات الترقيم المتسلسل")}</Field>
        <Toggle id="manual-number" title="تعديل رقم الفاتورة يدويًا" hint="يسمح بمراجعة رقم العرض قبل الإصدار ولا يغيّر أرقام الفواتير الصادرة" checked={advanced.numbering.manual} disabled={blocked} onChange={value => changeAdvanced("numbering", { ...advanced.numbering, manual: value })} />
        <Field id="invoice-billing-method" title="طريقة الفوترة" hint="تحدد وسيلة العرض والمشاركة الافتراضية ويُراجع المستخدم الإرسال قبل تنفيذه"><select id="invoice-billing-method" disabled={blocked} value={advanced.billingMethod} onChange={event => changeAdvanced("billingMethod", event.target.value as typeof advanced.billingMethod)} aria-describedby="invoice-billing-method-help"><option value="print">طباعة</option><option value="email">البريد الإلكتروني</option><option value="both">الطباعة والبريد الإلكتروني</option></select></Field>
        <Toggle id="line-editing" title="الإدخال الحر وتعديل بيانات الأصناف في الفاتورة" hint="يسمح بتعديل بيانات الأصناف المسجلة وإضافة منتج أو خدمة حرة دون حركة مخزون للصنف الحر" checked={draft.allowLineEditing} disabled={blocked} onChange={value => change("allowLineEditing", value)} />
        <Toggle id="price-hints" title="عرض الحد الأدنى للسعر وآخر سعر بيع لكل صنف" hint="يعرض آخر سعر بيع للعميل والحد الأدنى المحدد في سياسة الصنف عند توفره" checked={draft.priceHints === "last"} disabled={blocked} onChange={value => change("priceHints", value ? "last" : "hidden")} />
        <Toggle id="conversion-notes" title="نسخ الملاحظات والشروط عند تحويل عرض سعر أو أمر بيع إلى فاتورة" hint="ينطبق على تحويل عروض الأسعار أوامر البيع غير متاحة حاليًا" checked={draft.copyNotesOnConversion} disabled={blocked} onChange={value => change("copyNotesOnConversion", value)} />
        <Toggle id="preview" title="معاينة الفاتورة قبل الحفظ" checked={draft.previewBeforeSave} disabled={blocked} onChange={value => change("previewBeforeSave", value)} />
        <div><Toggle id="custom-status" title="حالات الفاتورة المخصصة" hint="تظل حالات السداد الحالية مرتبطة بالدفعات الفعلية" checked={advanced.customStatusesEnabled} disabled={blocked} onChange={value => changeAdvanced("customStatusesEnabled", value)} />{advanced.customStatusesEnabled && manage("statuses", "إدارة الحالات المخصصة")}</div>
        <Toggle id="profit-tab" title="تبويب الربح في الفاتورة" hint="يظهر للحسابات المصرح لها ولا يظهر للعملاء" checked={advanced.profitEnabled} disabled={blocked} onChange={value => changeAdvanced("profitEnabled", value)} />
        <fieldset className={styles.radioRow} disabled={blocked}><legend>عرض الأصفار في الأرقام العشرية</legend><div>{([["always", "دائمًا", "تظهر الخانات العشرية دائمًا مثل 10.00"], ["never", "أبدًا", "تُحذف الأصفار الزائدة مثل 10 وتبقى الكسور الفعلية"], ["auto", "تلقائيًا", "تظهر الخانات العشرية للمبالغ الأقل من 1000 وتُحذف الأصفار الزائدة فيما عدا ذلك"]] as const).map(([value, label, hint]) => <label key={value}><input type="radio" name="invoice-decimal-display" value={value} checked={draft.decimalDisplay === value} onChange={() => change("decimalDisplay", value)} /><span><strong>{label}</strong><small>{hint}</small></span></label>)}</div><p>يطبّق على محرر الفاتورة والمستندات الجديدة ولا يغيّر ملفات الفواتير السابقة أو قيمة الكسور الفعلية</p></fieldset>
        <fieldset className={styles.radioRow} disabled={blocked}><legend>معامل تحويل العملات</legend><div><label><input type="radio" name="invoice-exchange-rate" checked={advanced.showExchangeRate} onChange={() => changeAdvanced("showExchangeRate", true)} />إظهار</label><label><input type="radio" name="invoice-exchange-rate" checked={!advanced.showExchangeRate} onChange={() => changeAdvanced("showExchangeRate", false)} />إخفاء</label></div><p>تُحسب قيمة العملة المختارة مقابل الريال مع بقاء القيود المحاسبية بالريال</p></fieldset>{advanced.showExchangeRate && manage("currencies", "إدارة العملات ومعاملات التحويل")}
        <div><Toggle id="social" title="إرسال الفواتير عبر وسائل التواصل الاجتماعي" hint="المشاركة بعد مراجعة المستخدم ولا تُرسل رسائل بمجرد تفعيل الخيار" checked={advanced.socialEnabled} disabled={blocked} onChange={value => changeAdvanced("socialEnabled", value)} />{advanced.socialEnabled && manage("social", "إدارة منصات التواصل الاجتماعي المفعلة")}</div>
        <Toggle id="deposits" title="الدفعات المقدمة" hint="يسمح بالدفعات المقدمة ضمن الفاتورة وبإدارة الرصيد المقدم المستقل من صفحة العميل" checked={draft.allowDeposits} disabled={blocked} onChange={value => change("allowDeposits", value)} />
      </section>
      <section id="invoice-settings-pricing" className={styles.panel} aria-labelledby="invoice-settings-title-pricing"><h3 id="invoice-settings-title-pricing">التسعير والخصومات</h3>
        <Field id="invoice-discount-mode" title="طريقة تطبيق الخصومات"><select id="invoice-discount-mode" disabled={blocked} value={draft.discountMode} onChange={event => change("discountMode", event.target.value as InvoiceSettings["discountMode"])}><option value="both">على مستوى الفاتورة والأصناف</option><option value="invoice">على مستوى الفاتورة</option><option value="line">على مستوى الأصناف</option></select></Field>
        <Toggle id="discount-caps" title="الحد الأقصى لنسبة الخصم" hint="تحدد حدود الخصم للمستخدمين عند إنشاء الفاتورة" checked={advanced.discountCapsEnabled} disabled={blocked} onChange={value => changeAdvanced("discountCapsEnabled", value)} />{advanced.discountCapsEnabled && manage("discountCaps", "إدارة حدود الخصم للمستخدمين")}
        <Toggle id="advanced-pricing" title="خيارات التسعير المتقدمة" checked={advanced.advancedPricing} disabled={blocked} onChange={value => changeAdvanced("advancedPricing", value)} />{advanced.advancedPricing && manage("productPolicies", "إدارة سياسات الأصناف والأسعار")}
        <fieldset className={styles.radioRow} disabled={blocked}><legend>احتساب الحد الأدنى لسعر البيع</legend><div><label><input type="radio" name="invoice-minimum-tax" checked={advanced.minimumIncludesTax} onChange={() => changeAdvanced("minimumIncludesTax", true)} />شامل الضريبة</label><label><input type="radio" name="invoice-minimum-tax" checked={!advanced.minimumIncludesTax} onChange={() => changeAdvanced("minimumIncludesTax", false)} />غير شامل الضريبة</label></div><p>يحدد أساس مقارنة الحد الأدنى المسجل في سياسة الصنف بسعر البيع</p></fieldset>
        <Toggle id="below-cost" title="البيع بأقل من سعر متوسط التكلفة" hint="عند إيقافه يُمنع البيع بأقل من التكلفة الفعلية بعد الخصم ويلزم توفر تكلفة موثوقة" checked={draft.allowBelowCost} disabled={blocked} onChange={value => change("allowBelowCost", value)} />
        <div><Toggle id="price-lists" title="تغيير قائمة الأسعار عند إنشاء الفواتير" checked={advanced.priceListsEnabled} disabled={blocked} onChange={value => changeAdvanced("priceListsEnabled", value)} />{advanced.priceListsEnabled && manage("priceLists", "إدارة قوائم الأسعار")}</div>
        <div><Toggle id="sales-adjustments" title="تسوية المبيعات" checked={advanced.adjustmentsEnabled} disabled={blocked} onChange={value => changeAdvanced("adjustmentsEnabled", value)} />{advanced.adjustmentsEnabled && manage("adjustments", "إدارة تسويات المبيعات الإضافية")}</div>
      </section>
      <section id="invoice-settings-payment" className={styles.panel} aria-labelledby="invoice-settings-title-payment"><h3 id="invoice-settings-title-payment">الدفع والائتمان</h3>
        <Toggle id="default-paid" title="جعل الفواتير مدفوعة بالفعل افتراضيًا" hint="تظل مراجعة حساب التحصيل والمبلغ مطلوبة عند إصدار الفاتورة" checked={draft.defaultPaid} disabled={blocked} onChange={value => change("defaultPaid", value)} />
        {manage("payment", "إدارة وسائل الدفع الافتراضية")}
        <Toggle id="auto-credit" title="دفع الفاتورة تلقائيًا في حالة وجود رصيد للعميل" hint="يُعرض الرصيد المتاح للمراجعة ويُطبّق عند إصدار الفاتورة" checked={advanced.autoApplyCredit} disabled={blocked} onChange={value => changeAdvanced("autoApplyCredit", value)} />
        <Toggle id="debit-note" title="إشعار مدين" checked={advanced.debitNotesEnabled} disabled={blocked} onChange={value => changeAdvanced("debitNotesEnabled", value)} />{advanced.debitNotesEnabled && manage("debitNumbering", "إعدادات ترقيم الإشعارات المدينة")}
      </section>
      <section id="invoice-settings-stock" className={styles.panel} aria-labelledby="invoice-settings-title-stock"><h3 id="invoice-settings-title-stock">قيود توفر وصلاحية المخزون</h3>
        <Toggle id="category-restrictions" title="منع بيع وإصدار الفواتير لفئات منتجات وخدمات محددة" hint="اختر الفئات الممنوعة وتظل ضوابط توفر المخزون مطبقة" checked={categoriesOpen} disabled={blocked} onChange={value => { if (!blocked) { setCategoriesOpen(value); if (!value) changeAdvanced("excludedCategories", []); } }} />{categoriesOpen && <div className={styles.conditional}><p className={styles.fieldTitle}>الفئات الممنوعة من الفوترة</p>{categories.map(category => <label key={category} className={styles.checkChoice}><input type="checkbox" disabled={blocked} checked={advanced.excludedCategories.includes(category)} onChange={event => changeAdvanced("excludedCategories", event.target.checked ? [...advanced.excludedCategories, category] : advanced.excludedCategories.filter(item => item !== category))} />{category}</label>)}{!categories.length && <p className={styles.hint}>أضف فئات للأصناف في كتالوج المنتجات لتحديدها هنا</p>}</div>}
        <fieldset className={styles.radioRow} disabled={blocked}><legend>طبيعة مبيعات النشاط</legend><div>{([["products", "المنتجات فقط"], ["services", "الخدمات فقط"], ["both", "منتجات وخدمات"]] as const).map(([value, label]) => <label key={value}><input type="radio" name="invoice-activity-kind" value={value} checked={advanced.activityKind === value} onChange={() => changeAdvanced("activityKind", value)} />{label}</label>)}</div><p>يعتمد تصنيف المنتج أو الخدمة على سياسات الأصناف</p></fieldset>{manage("productPolicies", "إدارة تصنيف المنتجات والخدمات")}
      </section>
      <section id="invoice-settings-journal" className={styles.panel} aria-labelledby="invoice-settings-title-journal"><h3 id="invoice-settings-title-journal">القيود المحاسبية</h3><Toggle id="journal-template-enabled" title="وصف مخصص لقيود اليومية" checked={advanced.journalTemplateEnabled} disabled={blocked} onChange={value => changeAdvanced("journalTemplateEnabled", value)} />{advanced.journalTemplateEnabled && <div className={styles.conditional}><Field id="invoice-journal-template" title="قالب الوصف المخصص لقيود اليومية" hint="يُستخدم عند إنشاء قيود الفواتير الجديدة ولا يغيّر القيود السابقة"><textarea id="invoice-journal-template" rows={3} maxLength={500} value={advanced.journalTemplate} onChange={event => changeAdvanced("journalTemplate", event.target.value)} disabled={blocked} aria-describedby="invoice-journal-template-help" /></Field><details className={styles.variables}><summary>دليل المتغيرات</summary><dl>{[["{number}", "رقم الفاتورة"], ["{customer}", "اسم العميل"], ["{date}", "تاريخ الفاتورة"], ["{total}", "إجمالي الفاتورة"]].map(([variable, label]) => <div key={variable}><dt><code dir="ltr">{variable}</code></dt><dd>{label}</dd></div>)}</dl></details></div>}</section>
      <section id="invoice-settings-tax" className={styles.panel} aria-labelledby="invoice-settings-title-tax"><h3 id="invoice-settings-title-tax">الضريبة الافتراضية</h3><fieldset className={styles.radioRow} disabled={blocked}><legend>الضريبة الافتراضية</legend><div>{([["product", "مطابق لضريبة المنتج"], ["none", "بدون ضريبة"], ["specific", "ضريبة محددة"]] as const).map(([value, label]) => <label key={value}><input type="radio" name="invoice-tax-source" value={value} checked={advanced.taxMode === value} onChange={() => changeAdvanced("taxMode", value)} />{label}</label>)}</div><p>يُطبّق الاختيار على الفواتير الجديدة وتبقى البيانات الضريبية للفواتير الصادرة محفوظة</p></fieldset>{advanced.taxMode === "product" && manage("productPolicies", "إدارة ضرائب الأصناف")}{advanced.taxMode === "specific" && <Field id="invoice-tax-one" title="الضريبة 1"><select id="invoice-tax-one" value={advanced.specificTaxRate} disabled={blocked} onChange={event => changeAdvanced("specificTaxRate", Number(event.target.value) as 0 | 15)}><option value={15}>القيمة المضافة 15%</option><option value={0}>نسبة صفر</option></select></Field>}{(advanced.taxMode === "none" || (advanced.taxMode === "specific" && advanced.specificTaxRate === 0)) && <Field id="invoice-tax-exemption" title="سبب الإعفاء أو تطبيق نسبة الصفر"><textarea id="invoice-tax-exemption" rows={2} maxLength={250} value={advanced.exemptionReason} disabled={blocked} onChange={event => changeAdvanced("exemptionReason", event.target.value)} /></Field>}<Toggle id="tax-required" title="الضريبة 1 إلزامية" checked={advanced.taxRequired} disabled={blocked} onChange={value => changeAdvanced("taxRequired", value)} /><span className={styles.taxBasis}>{settings.tax_inclusive ? "أسعار المنشأة شاملة الضريبة" : "أسعار المنشأة غير شاملة الضريبة"}</span>{onEditTax && <button type="button" disabled={blocked || dirty} onClick={() => { if (!blocked && !dirty) onEditTax(); }}>تعديل إعدادات الضريبة</button>}</section>
    </div></div>
  </form>;
}
