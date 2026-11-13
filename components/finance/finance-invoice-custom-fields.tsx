"use client";

import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { AlignLeft, ArrowDown, ArrowUp, Bold, CalendarDays, CalendarClock, CheckSquare, ChevronDown, ChevronLeft, Circle, Clock, DollarSign, FileUp, GripVertical, Hash, Image as ImageIcon, Italic, Link as LinkIcon, List, ListChecks, ListOrdered, Mail, Minus, Pencil, Search, Settings, Square, Star, Strikethrough, TextCursorInput, Type, Underline, Unlink, X, Globe, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/dashboard/ui/modal";
import { getFinanceInvoiceCustomFields, saveFinanceInvoiceCustomFields } from "@/app/actions/finance-invoice-custom-fields";
import { invoiceCustomFieldCapabilities, invoiceCustomFieldSchema, invoiceCustomFieldSettingsSchema, invoiceCustomFieldTypes, newInvoiceCustomField, safeInvoiceCustomFieldContent, type InvoiceCustomField, type InvoiceCustomFieldSettings, type InvoiceCustomFieldState, type InvoiceCustomFieldType } from "@/lib/finance/invoice-custom-fields";
import local from "./finance-invoice-custom-fields.module.css";

type Props = { slug: string; canEdit: boolean; disabled: boolean; onBack: () => void };
type FieldTab = "properties" | "validation" | "layout";
const fieldIcons: Record<string, LucideIcon> = { singleline: TextCursorInput, multiline: AlignLeft, number: Hash, decimal: Hash, email: Mail, date: CalendarDays, time: Clock, datetime: CalendarClock, dropdown: List, multiple_dropdown: ListChecks, radio: Circle, checkbox: CheckSquare, multiple_checkbox: ListChecks, website: Globe, currency: DollarSign, file_upload: FileUp, image_upload: ImageIcon, rating_input: Star, separator: Minus, free_static_content: Pencil };
const sizeOptions = [{ value: "xs", label: "صغير جدًا" }, { value: "sm", label: "صغير" }, { value: "md", label: "متوسط" }, { value: "lg", label: "كبير" }, { value: "xl", label: "كبير جدًا" }] as const;
const fileTypeOptions = [{ value: "document", label: "المستند (*.docx, *.doc, *.xls, *.xlsx, *.pdf, *.ppt, *.pptx, *.rtf)" }, { value: "pdf", label: "PDF (*.pdf)" }, { value: "spreadsheet", label: "Spreadsheet (*.xls, *.xlsx, *.csv, *.txt)" }, { value: "text", label: "نص (*.txt)" }, { value: "html", label: "Html (*.html)" }, { value: "image", label: "الصورة (*.jpg, *.tif, *.png, *.gif)" }, { value: "archive", label: "الأرشيف (*.zip, *.rar, *.gz, *.tar)" }];
const dragType = "application/x-branda-invoice-field";
const inlineType = (type: InvoiceCustomFieldType) => type === "separator" || type === "free_static_content";

// Currency choices are copied from the inspected reference selector, not financial FX settings.
const currencyOptions: { value: string; text: string }[] = [{"text":"AED درهم إماراتي","value":"AED"},{"text":"AFN أفغاني","value":"AFN"},{"text":"ALL ليك ألباني","value":"ALL"},{"text":"AMD درام أرميني","value":"AMD"},{"text":"ANG غويلدر الأنتيل الهولندية","value":"ANG"},{"text":"AOA كوانزا أنغولي","value":"AOA"},{"text":"ARS بيزو أرجنتيني","value":"ARS"},{"text":"AUD دولار أسترالي","value":"AUD"},{"text":"AWG فلورن أروبي","value":"AWG"},{"text":"AZN مانات","value":"AZN"},{"text":"BAM مارك بوسني","value":"BAM"},{"text":"BBD دولار بربادوسي","value":"BBD"},{"text":"BDT تاكا بنغلاديشي","value":"BDT"},{"text":"BGN ليف بلغاري","value":"BGN"},{"text":"BHD دينار بحريني","value":"BHD"},{"text":"BIF فرنك بروندي","value":"BIF"},{"text":"BMD دولار برمودي","value":"BMD"},{"text":"BND دولار بروني","value":"BND"},{"text":"BOB بوليفاريو","value":"BOB"},{"text":"BRL ريال برازيلي","value":"BRL"},{"text":"BSD دولار بهامي","value":"BSD"},{"text":"BTC Bitcoin","value":"BTC"},{"text":"BTN نغولترم","value":"BTN"},{"text":"BWP بوتسوانا بولا","value":"BWP"},{"text":"BYR روبل بلاروسي","value":"BYR"},{"text":"BZD دولار البليز","value":"BZD"},{"text":"CAD دولار كندي","value":"CAD"},{"text":"CDF فرنك كونغولي","value":"CDF"},{"text":"CHF فرنك سويسري","value":"CHF"},{"text":"CLP بيزو","value":"CLP"},{"text":"CNY يوان","value":"CNY"},{"text":"COP بيسو","value":"COP"},{"text":"CRC كولون كوستاريكي","value":"CRC"},{"text":"CUP بيزو كوبي","value":"CUP"},{"text":"CVE ايسكودو","value":"CVE"},{"text":"CZK كرونة تشيكية","value":"CZK"},{"text":"DJF فرنك جيبوتي","value":"DJF"},{"text":"DKK كرونة دنماركية","value":"DKK"},{"text":"DOP بيزو دومنيكاني","value":"DOP"},{"text":"DZD دينار جزائري","value":"DZD"},{"text":"EEK كرون إستوني","value":"EEK"},{"text":"EGP جنيه مصري","value":"EGP"},{"text":"ERN ناكفا","value":"ERN"},{"text":"ETB بير إثيوبي","value":"ETB"},{"text":"EUR يورو","value":"EUR"},{"text":"FJD دولار فيجي","value":"FJD"},{"text":"FKP جنيه جزر فوكلاند","value":"FKP"},{"text":"GBP جنيه إسترليني[C]","value":"GBP"},{"text":"GEL لاري","value":"GEL"},{"text":"GHS سيدي غاني","value":"GHS"},{"text":"GIP جنيه جبل طارق","value":"GIP"},{"text":"GMD دالاسي غامبي","value":"GMD"},{"text":"GNF فرنك غيني","value":"GNF"},{"text":"GTQ كتزال غواتيمالي","value":"GTQ"},{"text":"GYD دولار غياني","value":"GYD"},{"text":"HKD دولار هونغ كونغ","value":"HKD"},{"text":"HNL لمبيرة هندوراسية","value":"HNL"},{"text":"HRK كونا كرواتية","value":"HRK"},{"text":"HTG جوردة هايتية","value":"HTG"},{"text":"HUF فورنت مجري","value":"HUF"},{"text":"IDR روبية إندونيسية","value":"IDR"},{"text":"ILS شيكل إسرائيلي جديد","value":"ILS"},{"text":"INR روبية هندية","value":"INR"},{"text":"IQD دينار عراقي","value":"IQD"},{"text":"IRR ريال إيراني","value":"IRR"},{"text":"ISK كرونة آيسلندية","value":"ISK"},{"text":"JMD دولار جامايكي","value":"JMD"},{"text":"JOD دينار أردني","value":"JOD"},{"text":"JPY ين ياباني","value":"JPY"},{"text":"KES شيلينغ كيني","value":"KES"},{"text":"KGS سوم قيرغيزستاني","value":"KGS"},{"text":"KHR ريال كمبودي","value":"KHR"},{"text":"KMF فرنك قمري","value":"KMF"},{"text":"KPW وون كوري شمالي","value":"KPW"},{"text":"KRW وون كوري جنوبي","value":"KRW"},{"text":"KWD دينار كويتي","value":"KWD"},{"text":"KYD دولار جزر كايمان","value":"KYD"},{"text":"KZT تينغ كازاخستاني","value":"KZT"},{"text":"LAK كيب لاوي","value":"LAK"},{"text":"LBP ليرة لبنانية","value":"LBP"},{"text":"LKR روبية سريلانكي","value":"LKR"},{"text":"LRD دولار ليبيري","value":"LRD"},{"text":"LSL لوتي ليسوتو","value":"LSL"},{"text":"LTL ليتاس ليتواني","value":"LTL"},{"text":"LVL لاتس لاتفي","value":"LVL"},{"text":"LYD دينار ليبي","value":"LYD"},{"text":"MAD درهم مغربي","value":"MAD"},{"text":"MDL ليو مولدوفي","value":"MDL"},{"text":"MGA أرياري مدغشقري","value":"MGA"},{"text":"MKD دينار مقدوني","value":"MKD"},{"text":"MMK كيات ميانماري","value":"MMK"},{"text":"MNT توغروغ منغولي","value":"MNT"},{"text":"MOP باتاكا ماكاوية","value":"MOP"},{"text":"MRO أوقية موريتانية","value":"MRO"},{"text":"MRU أوقية موريتانية","value":"MRU"},{"text":"MUR روبي موريشي","value":"MUR"},{"text":"MVR روفيه مالديفية","value":"MVR"},{"text":"MWK كواشا ملاوية","value":"MWK"},{"text":"MXN بيزو مكسيكي","value":"MXN"},{"text":"MYR رينغيت","value":"MYR"},{"text":"MZN متكال موزمبيقي","value":"MZN"},{"text":"NAD دولار ناميبي","value":"NAD"},{"text":"NGN نيرة نيجيرية","value":"NGN"},{"text":"NIO كوردبا نيكاراغوا","value":"NIO"},{"text":"NOK كرونة نروجية","value":"NOK"},{"text":"NPR روبية نيبالية","value":"NPR"},{"text":"NZD دولار نيوزيلندي","value":"NZD"},{"text":"OMR ريال عماني","value":"OMR"},{"text":"PAB بالبوا بنمي","value":"PAB"},{"text":"PEN سول بيروفي جديد","value":"PEN"},{"text":"PGK كينا بابوا غينيا الجديدة","value":"PGK"},{"text":"PHP بيسو فلبيني","value":"PHP"},{"text":"PKR روبية باكستانية","value":"PKR"},{"text":"PLN زلوتي بولندي","value":"PLN"},{"text":"PYG غواراني باراغواي","value":"PYG"},{"text":"QAR ريال قطري","value":"QAR"},{"text":"RON ليو روماني","value":"RON"},{"text":"RSD دينار صربي","value":"RSD"},{"text":"RUB روبل روسي","value":"RUB"},{"text":"RWF فرنك رواندي","value":"RWF"},{"text":"SAR ريال سعودي","value":"SAR"},{"text":"SBD دولار جزر سليمان","value":"SBD"},{"text":"SCR روبية سيشلية","value":"SCR"},{"text":"SDG جنيه سوداني","value":"SDG"},{"text":"SEK كرونة سويدية","value":"SEK"},{"text":"SGD دولار سنغافوري","value":"SGD"},{"text":"SHP جنيه سانت هيليني","value":"SHP"},{"text":"SLL ليون سيراليوني","value":"SLL"},{"text":"SOS شلن صومالي","value":"SOS"},{"text":"SRD دولار سورينامي","value":"SRD"},{"text":"STD دوبرا ساو توميه وبرينسيب","value":"STD"},{"text":"SYP ليرة سورية","value":"SYP"},{"text":"SZL ليلانغيني سوازيلندي","value":"SZL"},{"text":"THB بات تايلاندي","value":"THB"},{"text":"TJS ساماني طاجيكي","value":"TJS"},{"text":"TMT منات تركمانستاني","value":"TMT"},{"text":"TND دينار تونسي","value":"TND"},{"text":"TOP بانغا تونغي","value":"TOP"},{"text":"TRL ليرة تركية","value":"TRL"},{"text":"TRY ليرة تركية","value":"TRY"},{"text":"TTD دولار ترينيداد وتوباغو","value":"TTD"},{"text":"TWD دولار تايواني جديد","value":"TWD"},{"text":"TZS شيلينغ تانزاني","value":"TZS"},{"text":"UAH هريفنا","value":"UAH"},{"text":"UGX شيلينغ أوغندي","value":"UGX"},{"text":"USD دولار أمريكي","value":"USD"},{"text":"UYU بيزو أورغواي","value":"UYU"},{"text":"UZS سوم","value":"UZS"},{"text":"VEF بوليفار فنزويلي","value":"VEF"},{"text":"VND دونغ","value":"VND"},{"text":"VUV فاتو","value":"VUV"},{"text":"WST تالا ساموي","value":"WST"},{"text":"XAF فرنك س ف ا وسط أفريقيا","value":"XAF"},{"text":"XCD دولار شرق الكاريبي","value":"XCD"},{"text":"XOF فرنك س ف ا غرب أفريقيا","value":"XOF"},{"text":"XPF فرنك س ف ب","value":"XPF"},{"text":"YER ريال يمني","value":"YER"},{"text":"ZAR راند جنوب أفريقي","value":"ZAR"},{"text":"ZMK كواشا","value":"ZMK"},{"text":"ZWL زمبابوي","value":"ZWL"}];

export function FinanceInvoiceCustomFields(props: Props) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ slug: string; attempt: number; data?: InvoiceCustomFieldState; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    getFinanceInvoiceCustomFields(props.slug).then(result => { if (active) setLoaded({ slug: props.slug, attempt, ...(result.ok ? { data: result.data } : { error: result.message }) }); }).catch(() => { if (active) setLoaded({ slug: props.slug, attempt, error: "تعذر تحميل حقول الفاتورة أعد المحاولة" }); });
    return () => { active = false; };
  }, [props.slug, attempt]);
  const result = loaded?.slug === props.slug && loaded.attempt === attempt ? loaded : null;
  if (!result?.data) return <section className={local.page} dir="rtl"><header className={local.loadingHeader}><h2>المزيد من معلومات الفاتورة</h2><button type="button" onClick={props.onBack}>إلغاء</button></header>{result?.error ? <div className={local.error} role="alert"><p>{result.error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div> : <p className={local.loading} role="status">جار تحميل حقول الفاتورة</p>}</section>;
  return <CustomFieldsBuilder key={`${props.slug}:${attempt}`} {...props} initial={result.data} onReload={() => setAttempt(value => value + 1)} />;
}

function CustomFieldsBuilder({ slug, canEdit, disabled, onBack, initial, onReload }: Props & { initial: InvoiceCustomFieldState; onReload: () => void }) {
  const [saved, setSaved] = useState(initial), [settings, setSettings] = useState(initial.settings);
  const [query, setQuery] = useState(""), [editingTitle, setEditingTitle] = useState(false), [editing, setEditing] = useState<InvoiceCustomField | null>(null);
  const [dragged, setDragged] = useState<string | null>(null), [pending, setPending] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const lock = useRef(false), mounted = useRef(true), titleInput = useRef<HTMLInputElement>(null), fieldButtons = useRef(new Map<string, HTMLButtonElement>()), palette = useRef<HTMLDivElement>(null);
  const blocked = disabled || !canEdit || pending;
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved.settings);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || lock.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { if (editingTitle) titleInput.current?.focus(); }, [editingTitle]);
  function change(next: InvoiceCustomFieldSettings) { if (blocked || lock.current) return; setSettings(next); setError(""); setMessage(""); }
  function changeField(id: string, patch: Partial<InvoiceCustomField>) { change({ ...settings, fields: settings.fields.map(field => field.id === id ? { ...field, ...patch } : field) }); }
  function add(type: InvoiceCustomFieldType, index = settings.fields.length) {
    if (blocked || settings.fields.length >= 50) return;
    const field = newInvoiceCustomField(type), fields = [...settings.fields]; fields.splice(index, 0, field); change({ ...settings, fields });
    if (!inlineType(type)) setEditing(field);
    else requestAnimationFrame(() => fieldButtons.current.get(field.id)?.focus());
  }
  function move(id: string, destination: number, restoreFocus = true) {
    if (blocked) return;
    const from = settings.fields.findIndex(field => field.id === id);
    if (from < 0 || destination < 0 || destination >= settings.fields.length || from === destination) return;
    const fields = [...settings.fields], [field] = fields.splice(from, 1); fields.splice(destination, 0, field); change({ ...settings, fields });
    setMessage(`تم نقل الحقل إلى الموضع ${destination + 1}`);
    if (restoreFocus) requestAnimationFrame(() => fieldButtons.current.get(id)?.focus());
  }
  function remove(field: InvoiceCustomField) {
    if (blocked) return;
    const index = settings.fields.findIndex(item => item.id === field.id), next = settings.fields[index + 1] ?? settings.fields[index - 1];
    change({ ...settings, fields: settings.fields.filter(item => item.id !== field.id) });
    requestAnimationFrame(() => { if (next) fieldButtons.current.get(next.id)?.focus(); else palette.current?.querySelector<HTMLButtonElement>("button")?.focus(); });
  }
  function drop(event: DragEvent, index: number) {
    event.preventDefault(); event.stopPropagation();
    const payload = event.dataTransfer.getData(dragType); setDragged(null);
    if (blocked || !payload) return;
    if (payload.startsWith("type:")) { const type = payload.slice(5); if (invoiceCustomFieldTypes.some(item => item.type === type)) add(type as InvoiceCustomFieldType, index); }
    else if (payload.startsWith("field:")) move(payload.slice(6), Math.min(index, settings.fields.length - 1));
  }
  function dragOver(event: DragEvent) { if (!blocked && Array.from(event.dataTransfer.types).includes(dragType)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }
  async function save() {
    if (blocked || lock.current) return;
    const parsed = invoiceCustomFieldSettingsSchema.safeParse(settings);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "راجع إعدادات الحقول"); return; }
    lock.current = true; setPending(true); setError(""); setMessage("");
    try {
      const result = await saveFinanceInvoiceCustomFields(slug, parsed.data, saved.revision);
      if (!mounted.current) return;
      if (!result.ok) { setError(result.message); return; }
      setSaved(result.data); setSettings(result.data.settings); setMessage("تم حفظ حقول الفاتورة الإضافية");
    } catch { if (mounted.current) setError("تعذر تأكيد حفظ الحقول أعد المحاولة بنفس البيانات"); }
    finally { lock.current = false; if (mounted.current) setPending(false); }
  }
  return <section className={local.page} dir="rtl" aria-busy={pending}>
    <div className={local.builder}>
      <aside className={local.palette} aria-label="أنواع الحقول" ref={palette}>
        <label className={local.search}><Search size={17} aria-hidden="true" /><input type="search" placeholder="ادخل اسم الحقل" aria-label="البحث عن نوع الحقل" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div>{invoiceCustomFieldTypes.filter(item => item.label.includes(query.trim())).map(({ type, label }) => { const Icon = fieldIcons[type] ?? Type; return <button key={type} type="button" draggable={!blocked && settings.fields.length < 50} disabled={blocked || settings.fields.length >= 50} onDragStart={event => { event.dataTransfer.setData(dragType, `type:${type}`); event.dataTransfer.effectAllowed = "copyMove"; }} onClick={() => add(type)}><Icon size={19} aria-hidden="true" /><span>{label}</span></button>; })}</div>
        {query && !invoiceCustomFieldTypes.some(item => item.label.includes(query.trim())) && <p className={local.paletteEmpty}>لا توجد أنواع مطابقة</p>}
      </aside>
      <div className={local.content} dir="rtl">
        <header className={local.titleBar}>{editingTitle ? <input ref={titleInput} aria-label="عنوان النموذج" value={settings.title} maxLength={255} disabled={blocked} onChange={event => change({ ...settings, title: event.target.value })} onBlur={() => setEditingTitle(false)} onKeyDown={event => { if (event.key === "Enter" || event.key === "Escape") setEditingTitle(false); }} /> : <button type="button" className={local.titleButton} disabled={blocked} onClick={() => setEditingTitle(true)}><span>{settings.title}</span><Pencil size={16} aria-hidden="true" /></button>}<button type="button" disabled={pending} className={local.back} onClick={() => { if (!lock.current && (!dirty || window.confirm("توجد تعديلات غير محفوظة هل تريد إلغاءها؟"))) onBack(); }}>إلغاء</button></header>
        <div className={local.canvasArea}>
          {error && <div className={local.error} role="alert"><p>{error}</p><button type="button" disabled={pending} onClick={() => { if (!dirty || window.confirm("سيتم استبدال تعديلاتك بالبيانات المحفوظة هل تريد المتابعة؟")) onReload(); }}>إعادة تحميل البيانات</button></div>}
          {message && <p className={local.notice} role="status">{message}</p>}
          {!canEdit && <p className={local.notice} role="status">تعديل الحقول يتطلب صلاحية إدارة الإعدادات</p>}
          <div className={local.canvas} onDragOver={dragOver} onDrop={event => drop(event, settings.fields.length)} aria-label="معاينة حقول الفاتورة">
            {settings.fields.length === 0 && <div className={local.empty}>أضف هنا</div>}
            {settings.fields.map((field, index) => <FieldCard key={field.id} field={field} index={index} total={settings.fields.length} disabled={blocked} dragged={dragged === field.id} setButton={button => { if (button) fieldButtons.current.set(field.id, button); else fieldButtons.current.delete(field.id); }} onEdit={() => setEditing(field)} onChange={patch => changeField(field.id, patch)} onMove={destination => move(field.id, destination)} onRemove={() => remove(field)} onDragStart={event => { setDragged(field.id); event.dataTransfer.setData(dragType, `field:${field.id}`); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragged(null)} onDragOver={dragOver} onDrop={event => drop(event, index)} />)}
          </div>
          <button type="button" className={local.saveAll} disabled={blocked || !dirty} onClick={() => { void save(); }}>{pending ? "جار الحفظ" : "حفظ"}</button>
          {settings.fields.length >= 50 && <p className={local.notice}>وصلت إلى الحد الأقصى وهو ٥٠ حقلًا</p>}
        </div>
      </div>
    </div>
    {editing && <FieldDialog key={editing.id} initial={editing} disabled={blocked} onClose={() => setEditing(null)} onSave={field => { changeField(field.id, field); setEditing(null); }} />}
  </section>;
}

type FieldCardProps = { field: InvoiceCustomField; index: number; total: number; disabled: boolean; dragged: boolean; setButton: (button: HTMLButtonElement | null) => void; onEdit: () => void; onChange: (patch: Partial<InvoiceCustomField>) => void; onMove: (index: number) => void; onRemove: () => void; onDragStart: (event: DragEvent<HTMLButtonElement>) => void; onDragEnd: () => void; onDragOver: (event: DragEvent) => void; onDrop: (event: DragEvent) => void };
function FieldCard({ field, index, total, disabled, dragged, setButton, onEdit, onChange, onMove, onRemove, ...drag }: FieldCardProps) {
  const inline = inlineType(field.type);
  return <>{field.newLine && <div className={local.rowBreak} aria-hidden="true" />}<div className={`${local.fieldCard} ${dragged ? local.dragging : ""} ${field.hidden ? local.hiddenField : ""}`} data-size={inline ? "xl" : field.size} onDragOver={drag.onDragOver} onDrop={drag.onDrop}>
    <div className={local.fieldTools}>
      <button type="button" ref={setButton} disabled={disabled} draggable={!disabled} onDragStart={drag.onDragStart} onDragEnd={drag.onDragEnd} aria-label={`ترتيب ${field.label || "الفاصل"}`} title="اسحب للترتيب أو استخدم زري النقل"><GripVertical size={17} aria-hidden="true" /></button>
      <button type="button" disabled={disabled || index === 0} onClick={() => onMove(index - 1)} aria-label={`نقل ${field.label || "الفاصل"} لأعلى`}><ArrowUp size={14} aria-hidden="true" /></button>
      <button type="button" disabled={disabled || index === total - 1} onClick={() => onMove(index + 1)} aria-label={`نقل ${field.label || "الفاصل"} لأسفل`}><ArrowDown size={14} aria-hidden="true" /></button>
      {!inline && <button type="button" disabled={disabled} className={local.gear} onClick={onEdit} aria-label={`تعديل خصائص ${field.label}`}><Settings size={17} aria-hidden="true" /></button>}
      <button type="button" disabled={disabled} className={local.remove} onClick={onRemove} aria-label={`إزالة ${field.label || "الفاصل"}`}><X size={17} aria-hidden="true" /></button>
    </div>
    {field.type === "separator" ? <div className={local.separator}><input aria-label="عنوان الفاصل" value={field.label} maxLength={255} disabled={disabled} onChange={event => onChange({ label: event.target.value })} /><hr /></div> : field.type === "free_static_content" ? <StaticField field={field} disabled={disabled} onChange={onChange} /> : <div className={local.fieldPreview}><span className={local.fieldLabel}>{field.label}{field.required && <span aria-label="مطلوب"> *</span>}{field.hidden && <small>مخفي</small>}</span><PreviewControl field={field} />{field.instructions && <small>{field.instructions}</small>}</div>}
  </div></>;
}

function PreviewControl({ field }: { field: InvoiceCustomField }) {
  const value = typeof field.defaultValue === "string" ? field.defaultValue : "";
  if (field.type === "multiline") return <textarea aria-label={`معاينة ${field.label}`} placeholder={field.placeholder} readOnly value={value} tabIndex={-1} />;
  if (["dropdown", "multiple_dropdown"].includes(field.type)) return <div className={local.previewSelect}><span>{Array.isArray(field.defaultValue) ? field.defaultValue.join("، ") : value || "اختر"}</span><ChevronDown size={15} aria-hidden="true" /></div>;
  if (["radio", "multiple_checkbox"].includes(field.type)) return <div className={local.previewChoices}>{field.options.map(option => { const checked = Array.isArray(field.defaultValue) ? field.defaultValue.includes(option) : field.defaultValue === option; return <span key={option}>{field.type === "radio" ? <Circle size={16} fill={checked ? "currentColor" : "none"} aria-hidden="true" /> : checked ? <CheckSquare size={16} aria-hidden="true" /> : <Square size={16} aria-hidden="true" />}{option}</span>; })}</div>;
  if (field.type === "checkbox") return <span className={local.previewCheck}>{field.defaultValue === true ? <CheckSquare size={20} aria-hidden="true" /> : <Square size={20} aria-hidden="true" />}</span>;
  if (field.type === "rating_input") return <span className={local.stars} aria-label={`معاينة التقييم ${value || "٠"} من ٥`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} size={21} fill={Number(value) > i ? "currentColor" : "none"} aria-hidden="true" />)}</span>;
  if (field.type === "file_upload" || field.type === "image_upload") return <div className={local.previewUpload}><FileUp size={17} aria-hidden="true" /><span>{field.type === "image_upload" ? "اختر صورة" : "اختر ملفًا"}</span></div>;
  return <div className={local.previewInput}><input aria-label={`معاينة ${field.label}`} readOnly tabIndex={-1} value={value} placeholder={field.placeholder} />{field.type === "currency" && <span>{field.currency}</span>}{field.type === "date" || field.type === "datetime" ? <CalendarDays size={17} aria-hidden="true" /> : field.type === "time" ? <Clock size={17} aria-hidden="true" /> : null}</div>;
}

function StaticField({ field, disabled, onChange }: { field: InvoiceCustomField; disabled: boolean; onChange: (patch: Partial<InvoiceCustomField>) => void }) {
  const editor = useRef<HTMLDivElement>(null);
  const [initialHtml] = useState(() => safeInvoiceCustomFieldContent(field.content));
  const [error, setError] = useState("");
  function publish() { if (!disabled && editor.current) { const content = safeInvoiceCustomFieldContent(editor.current.innerHTML); onChange({ content }); setError(content.length > 20000 ? "المحتوى يتجاوز الحد الأقصى المسموح" : ""); } }
  function command(name: string) {
    if (disabled) return;
    let value: string | undefined;
    if (name === "createLink") {
      const entered = window.prompt("أدخل رابطًا يبدأ بـ https أو http", "https://");
      if (!entered) return;
      try { const url = new URL(entered); if (!["https:", "http:"].includes(url.protocol) || !url.hostname) throw new Error(); value = url.href; }
      catch { setError("أدخل رابطًا صحيحًا يبدأ بـ https أو http"); return; }
    }
    editor.current?.focus(); document.execCommand(name, false, value); publish();
  }
  const commands = [{ name: "bold", label: "عريض", icon: Bold }, { name: "italic", label: "مائل", icon: Italic }, { name: "underline", label: "تسطير", icon: Underline }, { name: "strikeThrough", label: "يتوسطه خط", icon: Strikethrough }, { name: "insertOrderedList", label: "قائمة مرقمة", icon: ListOrdered }, { name: "insertUnorderedList", label: "قائمة نقطية", icon: List }, { name: "createLink", label: "إدراج رابط", icon: LinkIcon }, { name: "unlink", label: "إزالة الرابط", icon: Unlink }];
  return <div className={local.staticField}><Choice label="إعدادات المكان ؟" value={field.placement} disabled={disabled} options={[{ value: "view", label: "للاطلاع فقط" }, { value: "edit", label: "للتحرير فقط" }, { value: "both", label: "كلاهما" }]} onChange={value => onChange({ placement: value as InvoiceCustomField["placement"] })} /><div className={local.richToolbar} role="toolbar" aria-label="تنسيق الكتابة الفاصلة">{commands.map(({ name, label, icon: Icon }) => <button key={name} type="button" title={label} aria-label={label} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => command(name)}><Icon size={16} aria-hidden="true" /></button>)}</div><div ref={editor} className={local.richEditor} role="textbox" aria-multiline="true" aria-label="كتابة فاصلة" aria-readonly={disabled} contentEditable={!disabled} suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: initialHtml }} onInput={publish} onPaste={event => { event.preventDefault(); if (!disabled) { document.execCommand("insertText", false, event.clipboardData.getData("text/plain")); publish(); } }} onDrop={event => event.preventDefault()} />{error && <p className={local.error} role="alert">{error}</p>}</div>;
}

function FieldDialog({ initial, disabled, onClose, onSave }: { initial: InvoiceCustomField; disabled: boolean; onClose: () => void; onSave: (field: InvoiceCustomField) => void }) {
  const [field, setField] = useState(initial), [tab, setTab] = useState<FieldTab>("properties"), [error, setError] = useState("");
  const [optionsText, setOptionsText] = useState(initial.options.join("\n"));
  const capabilities = invoiceCustomFieldCapabilities[field.type];
  const title = invoiceCustomFieldTypes.find(item => item.type === field.type)?.label ?? field.label;
  const hasOptions = ["dropdown", "multiple_dropdown", "radio", "multiple_checkbox"].includes(field.type);
  const hasValidation = capabilities.required || capabilities.unique || capabilities.filterable || capabilities.showInList || capabilities.range || capabilities.fileTypes || capabilities.compressImage;
  const tabs: { id: FieldTab; label: string }[] = [{ id: "properties", label: "الخصائص" }, ...(hasValidation ? [{ id: "validation" as const, label: "التحقيق" }] : []), { id: "layout", label: "القوالب" }];
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const multiple = field.type === "multiple_dropdown" || field.type === "multiple_checkbox";
  function update(patch: Partial<InvoiceCustomField>) { setField(current => ({ ...current, ...patch })); setError(""); }
  function close() { if (JSON.stringify(initial) !== JSON.stringify(field) && !window.confirm("توجد تعديلات غير محفوظة على خصائص الحقل هل تريد إلغاءها؟")) return; onClose(); }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); const current = tabs.findIndex(item => item.id === tab), step = event.key === "ArrowLeft" ? 1 : -1;
    const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + step + tabs.length) % tabs.length;
    setTab(tabs[index].id); tabRefs.current.get(tabs[index].id)?.focus();
  }
  function submit() {
    if (disabled) return;
    const result = invoiceCustomFieldSchema.safeParse(field);
    if (!result.success) { setError(result.error.issues[0]?.message ?? "راجع خصائص الحقل"); return; }
    onSave(result.data);
  }
  const inputType = field.type === "date" ? "date" : field.type === "time" ? "time" : field.type === "datetime" ? "datetime-local" : "text";
  return <Modal open title={title} onClose={close} panelClassName={local.modal}>
    <div role="tablist" aria-label="خصائص الحقل" className={local.tabs}>{tabs.map(item => <button key={item.id} ref={button => { if (button) tabRefs.current.set(item.id, button); else tabRefs.current.delete(item.id); }} type="button" role="tab" id={`custom-field-tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`custom-field-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onKeyDown={tabKey} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
    <div className={local.modalPanel} role="tabpanel" id={`custom-field-panel-${tab}`} aria-labelledby={`custom-field-tab-${tab}`}>
      {error && <p className={local.error} role="alert">{error}</p>}
      {tab === "properties" && <>
        <FieldLabel label="اسم الحقل"><input value={field.label} maxLength={255} disabled={disabled} onChange={event => update({ label: event.target.value })} /></FieldLabel>
        {capabilities.instructions && <FieldLabel label="التعليمات"><textarea value={field.instructions} maxLength={2000} disabled={disabled} onChange={event => update({ instructions: event.target.value })} /></FieldLabel>}
        {hasOptions && <FieldLabel label="الخيارات (كل خيار في سطر منفرد)"><textarea value={optionsText} maxLength={25600} disabled={disabled} onChange={event => { setOptionsText(event.target.value); update({ options: event.target.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean) }); }} /></FieldLabel>}
        {capabilities.defaultValue && <FieldLabel label="القيمة المبدأية">{field.type === "checkbox" ? <input type="checkbox" className={local.checkbox} checked={field.defaultValue === true} disabled={disabled} onChange={event => update({ defaultValue: event.target.checked })} /> : hasOptions ? <select multiple={multiple} value={multiple ? Array.isArray(field.defaultValue) ? field.defaultValue : [] : typeof field.defaultValue === "string" ? field.defaultValue : ""} disabled={disabled} onChange={event => update({ defaultValue: multiple ? Array.from(event.target.selectedOptions).map(option => option.value) : event.target.value })}>{!multiple && <option value="" />}{field.options.map((option, index) => <option key={`${index}:${option}`} value={option}>{option}</option>)}</select> : <input type={inputType} value={typeof field.defaultValue === "string" ? field.defaultValue : ""} maxLength={10000} disabled={disabled} onChange={event => update({ defaultValue: event.target.value })} />}</FieldLabel>}
        {capabilities.placeholder && <FieldLabel label="الكلمة البديلة"><input value={field.placeholder} maxLength={255} disabled={disabled} onChange={event => update({ placeholder: event.target.value })} /></FieldLabel>}
        {capabilities.autocomplete && <BooleanChoice label="تفعيل التعبئة التلقائية ؟" value={field.autocomplete} disabled={disabled} onChange={value => update({ autocomplete: value })} />}
        {capabilities.quickSearch && <BooleanChoice label="تفعيل البحث السريع ؟" value={field.quickSearch} disabled={disabled} onChange={value => update({ quickSearch: value })} />}
        {capabilities.decimalPlaces && <FieldLabel label="النقاط العشرية"><select value={field.decimalPlaces} disabled={disabled} onChange={event => update({ decimalPlaces: Number(event.target.value) })}>{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></FieldLabel>}
        {capabilities.currency && <FieldLabel label="العملة"><select value={field.currency} disabled={disabled} onChange={event => update({ currency: event.target.value })}>{currencyOptions.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}</select></FieldLabel>}
      </>}
      {tab === "validation" && <>
        {capabilities.required && <BooleanChoice label="مطلوب" value={field.required} disabled={disabled} onChange={value => update({ required: value })} />}
        {capabilities.unique && <BooleanChoice label="عدم السماح بالتكرار" value={field.unique} disabled={disabled} onChange={value => update({ unique: value })} />}
        {capabilities.filterable && <BooleanChoice label="فلترة باستخدام هذا الحقل ؟" value={field.filterable} disabled={disabled} onChange={value => update({ filterable: value })} />}
        {capabilities.showInList && <BooleanChoice label="عرض باستخدام هذا الحقل ؟" value={field.showInList} disabled={disabled} onChange={value => update({ showInList: value })} />}
        {capabilities.range && <div className={local.range}><FieldLabel label={capabilities.rangeKind === "date" || capabilities.rangeKind === "datetime" ? "التاريخ الأدنى" : "الحجم الأدنى"}><input type={capabilities.rangeKind === "date" ? "date" : capabilities.rangeKind === "datetime" ? "datetime-local" : "number"} step="any" value={field.minimum ?? ""} disabled={disabled} onChange={event => update({ minimum: event.target.value || null })} /></FieldLabel><FieldLabel label={capabilities.rangeKind === "date" || capabilities.rangeKind === "datetime" ? "التاريخ الأقصى" : "الحجم الأقصى"}><input type={capabilities.rangeKind === "date" ? "date" : capabilities.rangeKind === "datetime" ? "datetime-local" : "number"} step="any" value={field.maximum ?? ""} disabled={disabled} onChange={event => update({ maximum: event.target.value || null })} /></FieldLabel></div>}
        {capabilities.numberRangeMode && <FieldLabel label="النوع"><select value={field.numberRangeMode} disabled={disabled} onChange={event => update({ numberRangeMode: event.target.value as InvoiceCustomField["numberRangeMode"] })}><option value="digits">أرقام</option><option value="value">القيم</option></select></FieldLabel>}
        {capabilities.fileTypes && <FieldLabel label="أنواع الملفات"><select multiple value={field.fileTypes} disabled={disabled} onChange={event => update({ fileTypes: Array.from(event.target.selectedOptions).map(option => option.value) as InvoiceCustomField["fileTypes"] })}>{fileTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></FieldLabel>}
        {capabilities.compressImage && <><label className={local.compress}><input type="checkbox" checked={field.image.enabled} disabled={disabled} onChange={event => update({ image: { ...field.image, enabled: event.target.checked } })} />تعديل وضغط تلقائي</label>{field.image.enabled && <div className={local.imageSettings}>{([{ key: "large", label: "نسخة أكبر" }, { key: "thumbnail", label: "النسخة المصغرة" }] as const).map(({ key, label }) => <fieldset key={key} disabled={disabled}><legend>{label}</legend><div className={local.range}><FieldLabel label="العرض الأقصى"><input type="number" min={0} max={8192} value={field.image[key].width} onChange={event => update({ image: { ...field.image, [key]: { ...field.image[key], width: Number(event.target.value) } } })} /></FieldLabel><FieldLabel label="الطول الأقصى"><input type="number" min={0} max={8192} value={field.image[key].height} onChange={event => update({ image: { ...field.image, [key]: { ...field.image[key], height: Number(event.target.value) } } })} /></FieldLabel></div><label className={local.compress}><input type="checkbox" checked={field.image[key].crop} onChange={event => update({ image: { ...field.image, [key]: { ...field.image[key], crop: event.target.checked } } })} />قص الصورة</label></fieldset>)}</div>}</>}
      </>}
      {tab === "layout" && <>{capabilities.size && <Choice label="حجم الحقل" value={field.size} disabled={disabled} options={sizeOptions} onChange={value => update({ size: value as InvoiceCustomField["size"] })} />}{capabilities.newLine && <BooleanChoice label="إظهار في سطر جديد ؟" value={field.newLine} disabled={disabled} onChange={value => update({ newLine: value })} />}{capabilities.hidden && <BooleanChoice label="إخفاء الحقل ؟" value={field.hidden} disabled={disabled} onChange={value => update({ hidden: value })} />}</>}
    </div>
    <div className={local.modalActions}><button type="button" className={local.save} disabled={disabled} onClick={submit}><ChevronLeft size={17} aria-hidden="true" />حفظ</button></div>
  </Modal>;
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) { return <label className={local.modalField}><span>{label}</span>{children}</label>; }
function BooleanChoice({ label, value, disabled, onChange }: { label: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) { return <Choice label={label} value={value ? "yes" : "no"} disabled={disabled} options={[{ value: "yes", label: "نعم" }, { value: "no", label: "لا" }]} onChange={next => onChange(next === "yes")} />; }
function Choice({ label, value, options, disabled, onChange }: { label: string; value: string; options: readonly { value: string; label: string }[]; disabled: boolean; onChange: (value: string) => void }) { const id = useId(); return <fieldset className={local.choice} disabled={disabled}><legend>{label}</legend><div>{options.map(option => <label key={option.value} className={option.value === value ? local.chosen : ""}><input type="radio" checked={option.value === value} name={id} value={option.value} onChange={() => onChange(option.value)} /><span>{option.label}</span></label>)}</div></fieldset>; }
