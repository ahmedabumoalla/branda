"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { ArrowRight, CheckCheck, ChefHat, Clock3, ImageIcon, PackageCheck, Plus, RefreshCw, Search, ShieldCheck, Trash2, Truck } from "lucide-react";
import { Modal } from "@/components/dashboard/ui/modal";
import { actLabOrder, createLabOrder, createLabCustomer, getLabOrders, linkLabInvoice, saveLabOperator, saveLabSafetyProfile } from "@/app/actions/erp-lab-orders";
import { labQualitySchema, type LabOrder, type LabSnapshot } from "@/lib/erp/lab-orders";
import { LabSafetyProfiles, approvedOrderProfiles, recordLabels } from "./lab-safety-profiles";
import s from "./lab-workspace.module.css";

type Status = LabOrder["status"];
type Quality = NonNullable<LabOrder["quality"]>;
type QualityDraft = Omit<Quality, "checks"> & { checks: Record<keyof Quality["checks"], boolean> };
const statusLabels: Record<Status, string> = { requested: "طلب جديد", preparing: "قيد التجهيز", prepared: "تم التجهيز", out_for_delivery: "جاري التوصيل", delivered: "تم التسليم", cancelled: "ملغي", on_hold: "موقوف للمراجعة", recalled: "مسحوب" };
const nextStatus: Partial<Record<Status, Status>> = { requested: "preparing", preparing: "prepared", prepared: "out_for_delivery", out_for_delivery: "delivered", on_hold: "preparing" };
const actionLabels: Partial<Record<Status, string>> = { preparing: "بدء التجهيز", prepared: "تم التجهيز", out_for_delivery: "جاري التوصيل", delivered: "تم التسليم", on_hold: "إيقاف للمراجعة", recalled: "سحب المنتج" };
const columns: { key: string; label: string; statuses: Status[] }[] = [
  { key: "new", label: "طلبات جديدة", statuses: ["requested"] },
  { key: "preparing", label: "على طاولة التجهيز", statuses: ["preparing"] },
  { key: "ready", label: "جاهزة للتسليم", statuses: ["prepared"] },
  { key: "delivery", label: "في الطريق", statuses: ["out_for_delivery"] },
  { key: "review", label: "المراجعة وسحب المنتجات", statuses: ["on_hold", "recalled"] },
];
const money = (value: number | null) => value === null ? "لم تفوتر" : new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);
const dateTime = (value: string) => new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value));
const emptyQuality = (): QualityDraft => ({ lotCode: "", producedOn: "", expiresOn: "", allergens: "", storageInstructions: "", ingredientLots: "", temperatureReading: "", processReference: "", temperatureCelsius: NaN, minimumTemperature: NaN, maximumTemperature: NaN, recordReferences: {}, checks: { ingredients: false, cleaning: false, temperature: false, packaging: false } });
const checkLabels: Record<keyof Quality["checks"], string> = { ingredients: "فحص المواد الخام والصلاحية وتوثيق مصادرها", cleaning: "فحص النظافة ومنع التلوث المتبادل", temperature: "تسجيل درجات الحرارة ومطابقتها لخطة المنتج", packaging: "فحص التغليف وبيانات البطاقة والحساسية" };

export function labOrderMatches(order: LabOrder, query: string) {
  return [order.number, order.customerName, order.customerPhone, order.branchName, ...order.lines.map(line => line.name), order.quality?.lotCode, order.quality?.ingredientLots, ...(order.quality?.approvedProfiles ?? []).map(profile => profile.recipeVersion)].join(" ").toLowerCase().includes(query.trim().toLowerCase());
}

function ProductImage({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? <Image src={src} alt={name} width={140} height={140} unoptimized onError={() => setFailed(true)} /> : <span className={s.imageFallback} aria-label="صورة المنتج غير متاحة"><ImageIcon size={28} aria-hidden="true" /></span>;
}

export function LabWorkspace({ initialSnapshot, standalone = false }: { initialSnapshot: LabSnapshot; standalone?: boolean }) {
  const [data, setData] = useState(initialSnapshot);
  const [now, setNow] = useState(Date.parse(initialSnapshot.generatedAt));
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");
  const [archive, setArchive] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [transition, setTransition] = useState<{ order: LabOrder; status: Status } | null>(null);
  const [operatorsOpen, setOperatorsOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const refreshing = useRef(false);
  const refreshSequence = useRef(0);
  const activeOrder = data.orders.find(order => order.id === selected);
  const financeBase = standalone ? `/finance/${data.slug}` : "/dashboard/finance";
  const active = data.orders.filter(order => !["delivered", "cancelled", "recalled"].includes(order.status));
  const overdue = active.filter(order => new Date(order.requiredAt).getTime() < now).length;
  const visible = data.orders.filter(order => (archive ? ["delivered", "cancelled"].includes(order.status) : !["delivered", "cancelled"].includes(order.status)) && (!branch || order.branchId === branch) && labOrderMatches(order, query));

  async function reload(silent = false) {
    const sequence = ++refreshSequence.current;
    refreshing.current = true;
    try {
      const result = await getLabOrders(data.slug);
      if (sequence !== refreshSequence.current) return;
      if (result.ok) { setData(result.data); setNow(Date.parse(result.data.generatedAt)); if (!silent) setError(""); }
      else setError(result.message);
    } catch { if (sequence === refreshSequence.current) setError("تعذر تحديث الطلبات تحقق من الاتصال ثم حاول مجددًا"); }
    finally { if (sequence === refreshSequence.current) refreshing.current = false; }
  }
  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible" || refreshing.current) return;
      const sequence = ++refreshSequence.current;
      refreshing.current = true;
      try { const result = await getLabOrders(initialSnapshot.slug); if (result.ok && sequence === refreshSequence.current) { setData(result.data); setNow(Date.parse(result.data.generatedAt)); } }
      finally { if (sequence === refreshSequence.current) refreshing.current = false; }
    };
    const timer = window.setInterval(() => { void refresh().catch(() => undefined); }, 60000);
    const onFocus = () => { void refresh().catch(() => undefined); };
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [initialSnapshot.slug]);

  async function mutate(operation: () => Promise<{ ok: boolean; message?: string }>, success: string, close?: () => void) {
    setError(""); setNotice("");
    try {
      const result = await operation();
      if (!result.ok) { setError(result.message || "تعذر حفظ التغيير حاول مجددًا"); return false; }
      close?.(); setNotice(success); await reload(); return true;
    } catch { setError("لم نستطع تأكيد الحفظ حدّث الطلبات قبل المحاولة مرة أخرى"); return false; }
  }
  const confirmStatus = (order: LabOrder, status: Status) => setTransition({ order, status });

  function card(order: LabOrder) {
    const line = order.lines[0];
    const next = nextStatus[order.status];
    return <article key={order.id} className={s.card}>
      <div className={s.cardTop}><b>#{order.number}</b><span>{order.branchName}</span></div>
      <div className={s.product}><ProductImage src={line?.imageUrl ?? null} name={line?.name ?? "طلب معمل"} /><div><h3>{line?.name ?? "طلب معمل"}</h3><p><span className={s.quantity}>{line?.quantity ?? 0}</span> قطعة{order.lines.length > 1 ? ` + ${order.lines.length - 1} أصناف` : ""}</p><p>{order.customerName}</p></div></div>
      <div className={s.deadline} data-overdue={!archive && order.status !== "recalled" && new Date(order.requiredAt).getTime() < now}><Clock3 size={15} aria-hidden="true" /><span>التسليم {dateTime(order.requiredAt)}</span></div>
      <div className={s.cardMeta}><span className={s.badge} data-paid={order.total !== null && order.outstanding === 0}>{order.total === null ? "بانتظار الفاتورة" : order.outstanding === 0 ? "مسدد بالكامل" : order.paid > 0 ? "سداد جزئي" : "غير مسدد"}</span><span>{order.total !== null ? `${money(order.outstanding)} ر س متبقي` : statusLabels[order.status]}</span></div>
      <div className={s.cardFooter}><button className={s.button} onClick={() => setSelected(order.id)}>تفاصيل الطلب</button>{next && data.capabilities.prepare && <button className={s.primary} disabled={pending} onClick={() => confirmStatus(order, next)}>{actionLabels[next]}</button>}</div>
    </article>;
  }

  return <main className={s.page} dir="rtl">
    <header className={s.header}><div><p className={s.eyebrow}>{data.cafeName} / المعمل</p><h1 className={s.title}>كل طلب له عناية</h1><p className={s.subtitle}>من طلب الفرع إلى يد العميل مع متابعة التجهيز والسداد في مكان واحد</p></div><div className={s.actions}><Link className={s.button} href={standalone ? `/finance/${data.slug}/pos` : "/dashboard/finance"}><ArrowRight size={17} aria-hidden="true" />{standalone ? "الكاشير" : "المالية"}</Link><button className={s.button} disabled={pending} onClick={() => startTransition(() => reload())}><RefreshCw size={16} aria-hidden="true" />تحديث</button>{data.capabilities.create && <button className={s.primary} onClick={() => { setError(""); setCreating(true); }}><Plus size={18} aria-hidden="true" />طلب للمعمل</button>}</div></header>
    <section className={s.summary} aria-label="ملخص طلبات المعمل"><div className={s.summaryIntro}><ChefHat size={36} aria-hidden="true" /><div><strong>شاشة تشغيل المعمل</strong><p>المواعيد بتوقيت السعودية</p></div></div><div className={s.stat}><span>طلبات تحت التنفيذ</span><b>{active.length}</b></div><div className={s.stat}><span>جاهزة للتسليم</span><b>{active.filter(order => order.status === "prepared").length}</b></div><div className={s.stat} data-alert={overdue > 0}><span>تجاوزت موعد التسليم</span><b>{overdue}</b></div></section>
    {error && <div className={s.error} role="alert">{error}</div>}{notice && <div className={s.notice} role="status">{notice}</div>}
    <div className={s.toolbar}><label className={s.search}><Search size={19} aria-hidden="true" /><input aria-label="البحث في طلبات المعمل" placeholder="ابحث برقم الطلب أو المنتج أو العميل" value={query} onChange={event => setQuery(event.target.value)} /></label><select className={s.select} aria-label="تصفية حسب الفرع" value={branch} onChange={event => setBranch(event.target.value)}><option value="">كل الفروع المتاحة</option>{data.branches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className={s.viewTabs}><button className={s.button} aria-pressed={!archive} onClick={() => setArchive(false)}>قيد التنفيذ</button><button className={s.button} aria-pressed={archive} onClick={() => setArchive(true)}>المكتملة والملغاة</button></div><span className={s.refreshNote}>تحديث تلقائي كل دقيقة</span></div>
    {!data.orders.length ? <section className={s.empty}><ChefHat size={42} aria-hidden="true" /><h2>المعمل جاهز لأول طلب</h2><p>{data.capabilities.create ? "اختر المنتج والفرع والعميل وموعد التسليم لإرسال طلبك إلى المعمل" : "ستظهر هنا الطلبات التي ترسلها الفروع فور تسجيلها"}</p>{data.capabilities.create && <button className={s.primary} onClick={() => setCreating(true)}>إنشاء طلب للمعمل</button>}</section> : archive ? <section className={s.board} aria-label="طلبات المعمل السابقة">{visible.length ? visible.map(card) : <p className={s.columnEmpty}>لا توجد طلبات مطابقة للبحث</p>}</section> : <section className={s.board} aria-label="مراحل تجهيز الطلبات">{columns.map(column => <section className={s.column} key={column.key}><h2 className={s.columnTitle}>{column.label}<span>{visible.filter(order => column.statuses.includes(order.status)).length}</span></h2><div className={s.cards}>{visible.filter(order => column.statuses.includes(order.status)).map(card)}</div>{!visible.some(order => column.statuses.includes(order.status)) && <p className={s.columnEmpty}>لا توجد طلبات في هذه المرحلة</p>}</section>)}</section>}
    {data.capabilities.manageOperators && <details className={s.operators} open={operatorsOpen} onToggle={event => setOperatorsOpen(event.currentTarget.open)}><summary>مسؤولو المعمل وصلاحيات التجهيز</summary><p className={s.hint}>حدد من يتابع تجهيز الطلبات وتسليمها من فريق العلامة</p><div className={s.operatorList}>{data.operators.map(operator => <label className={s.check} key={operator.userId}><input type="checkbox" checked={operator.enabled} disabled={pending} onChange={event => { const enabled = event.target.checked; startTransition(() => mutate(() => saveLabOperator({ userId: operator.userId, enabled }, data.slug), "تم تحديث صلاحية مسؤول المعمل").then(() => undefined)); }} />{operator.name}</label>)}</div>{!data.operators.length && <p className={s.hint}>أضف مستخدمًا من إدارة مستخدمي المالية ثم امنحه صلاحية المعمل هنا</p>}</details>}
    {data.capabilities.manageSafetyProfiles && <LabSafetyProfiles data={data} pending={pending} onSave={input => startTransition(() => mutate(() => saveLabSafetyProfile(input, data.slug), "تم حفظ ملف سلامة المنتج").then(() => undefined))} />}
    <Modal open={creating} title="طلب جديد للمعمل" onClose={() => { if (!pending) setCreating(false); }} panelClassName={s.modal}>{creating && <CreateOrder data={data} onCreateCustomer={async input => { const result = await createLabCustomer(input, data.slug); if (result.ok) await reload(true); return result; }} pending={pending} error={error} onSubmit={input => startTransition(() => mutate(() => createLabOrder(input, data.slug), "وصل طلبك إلى المعمل", () => setCreating(false)).then(() => undefined))} />}</Modal>
    <Modal open={!!transition} title={transition ? actionLabels[transition.status] || "إلغاء طلب المعمل" : "تحديث الطلب"} onClose={() => { if (!pending) setTransition(null); }} panelClassName={s.modal}>{transition && <TransitionOrder data={data} order={transition.order} status={transition.status} pending={pending} error={error} onSubmit={(note, quality) => startTransition(() => mutate(() => actLabOrder({ requestId: crypto.randomUUID(), id: transition.order.id, revision: transition.order.revision, status: transition.status, note, ...(quality ? { quality } : {}) }, data.slug), "تم تحديث حالة الطلب", () => setTransition(null)).then(() => undefined))} />}</Modal>
    <Modal open={!!activeOrder && !transition} title={activeOrder ? `طلب المعمل #${activeOrder.number}` : "تفاصيل الطلب"} onClose={() => { if (!pending) setSelected(null); }} panelClassName={s.modal}>{activeOrder && <OrderDetails order={activeOrder} data={data} financeBase={financeBase} pending={pending} error={error} onStatus={status => confirmStatus(activeOrder, status)} onLink={invoiceId => startTransition(() => mutate(() => linkLabInvoice({ requestId: crypto.randomUUID(), id: activeOrder.id, revision: activeOrder.revision, invoiceId }, data.slug), "تم ربط الفاتورة بالطلب").then(() => undefined))} />}</Modal>
  </main>;
}

function CreateOrder({ data, pending, error, onSubmit, onCreateCustomer }: { data: LabSnapshot; pending: boolean; error: string; onSubmit: (input: Parameters<typeof createLabOrder>[0]) => void; onCreateCustomer: (input: Parameters<typeof createLabCustomer>[0]) => ReturnType<typeof createLabCustomer> }) {
  const requestId = useRef(crypto.randomUUID());
  const [branchId, setBranchId] = useState(data.branches.length === 1 ? data.branches[0].id : "");
  const [lines, setLines] = useState([{ productId: "", quantity: 1 }]);
  const [customerId, setCustomerId] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    onSubmit({ requestId: requestId.current, branchId: String(form.get("branchId")), customerId: String(form.get("customerId")), requiredAt: new Date(String(form.get("requiredAt"))).toISOString(), notes: String(form.get("notes")), lines });
  }
  return <form className={s.body} onSubmit={submit}>{error && <p role="alert" className={s.error}>{error}</p>}<div className={s.formGrid}><label className={s.field}>الفرع المطلوب<select required name="branchId" value={branchId} disabled={addingCustomer} onChange={event => { setBranchId(event.target.value); setCustomerId(""); }}><option value="">اختر الفرع</option>{data.branches.map(branch => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label><label className={s.field}>العميل<select required name="customerId" value={customerId} onChange={event => setCustomerId(event.target.value)}><option value="">اختر العميل</option>{data.customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` — ${customer.phone}` : ""}</option>)}</select><small>يستخدم نفس ملف العميل في المالية لمتابعة الفواتير والسداد</small></label><div className={s.wide}><NewCustomerForm key={branchId} branchId={branchId} open={addingCustomer} onToggle={() => setAddingCustomer(!addingCustomer)} onCreate={onCreateCustomer} onCreated={id => { setCustomerId(id); setAddingCustomer(false); }} /></div><label className={`${s.field} ${s.wide}`}>موعد التسليم المطلوب<input required type="datetime-local" name="requiredAt" /><small>اختر الموعد حسب توقيت جهازك وسيعرض في المعمل بتوقيت السعودية</small></label></div><h3 className={s.sectionTitle}>ماذا نجهز للعميل؟</h3>{lines.map((line, index) => <div className={s.lineEditor} key={index}><label className={s.field}>المنتج<select required value={line.productId} onChange={event => setLines(lines.map((item, i) => i === index ? { ...item, productId: event.target.value } : item))}><option value="">اختر المنتج</option>{data.products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label className={s.field}>الكمية<input required type="number" min="0.001" max="100000" step="0.001" inputMode="decimal" value={line.quantity} onChange={event => setLines(lines.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) } : item))} /></label><button type="button" className={s.remove} disabled={lines.length === 1} aria-label={`حذف الصنف ${index + 1}`} onClick={() => setLines(lines.filter((_, i) => i !== index))}><Trash2 size={18} aria-hidden="true" /></button></div>)}<button type="button" className={s.button} disabled={lines.length >= 50} onClick={() => setLines([...lines, { productId: "", quantity: 1 }])}><Plus size={16} aria-hidden="true" />إضافة منتج</button><label className={s.field} style={{ marginTop: 20 }}>ملاحظات التجهيز<textarea name="notes" maxLength={2000} rows={3} placeholder="الكتابة على الكيك أو التغليف أو تفاصيل الطلب" /></label>{(!data.products.length || !data.customers.length || !data.branches.length) && <p className={s.error}>أكمل المنتجات والعملاء والفروع في لوحة الإدارة قبل إنشاء الطلب</p>}<footer className={s.formFooter}><p className={s.hint}>يربط المحاسب الفاتورة بهذا الطلب لتظهر المبالغ والدفعات</p><button className={s.primary} disabled={pending || addingCustomer || !data.products.length || !data.customers.length || !data.branches.length}>{pending ? "جار إرسال الطلب" : "إرسال إلى المعمل"}<ChefHat size={18} aria-hidden="true" /></button></footer></form>;
}

function NewCustomerForm({ open, branchId, onToggle, onCreate, onCreated }: { open: boolean; branchId: string; onToggle: () => void; onCreate: (input: Parameters<typeof createLabCustomer>[0]) => ReturnType<typeof createLabCustomer>; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  async function save() {
    if (saving || !branchId) return;
    setSaving(true); setError("");
    try {
      const result = await onCreate({ requestId: requestId.current, branchId, name, phone });
      if (!result.ok) { setError(result.message); return; }
      onCreated(result.data.id); setName(""); setPhone(""); requestId.current = crypto.randomUUID();
    } catch { setError("تعذر تأكيد حفظ العميل حاول مجددًا"); }
    finally { setSaving(false); }
  }
  return <div><button className={s.quiet} type="button" disabled={saving || !branchId} aria-expanded={open} onClick={onToggle}><Plus size={16} aria-hidden="true" />{open ? "إغلاق إضافة العميل" : "إضافة عميل جديد"}</button>{open && <div className={s.notes}>{error && <p role="alert" className={s.error}>{error}</p>}<div className={s.formGrid}><label className={s.field}>اسم العميل<input maxLength={150} value={name} onChange={event => setName(event.target.value)} /></label><label className={s.field}>رقم الجوال<input type="tel" inputMode="tel" dir="ltr" maxLength={30} value={phone} onChange={event => setPhone(event.target.value)} /></label></div><p className={s.hint}>يحفظ العميل في المالية ويستخدم الملف الموجود إذا كان الرقم مسجلًا</p><button type="button" className={s.primary} disabled={saving || name.trim().length < 2 || !phone.trim()} onClick={() => void save()}>{saving ? "جار حفظ العميل" : "حفظ العميل واختياره"}</button></div>}</div>;
}

function TransitionOrder({ order, status, data, pending, error, onSubmit }: { order: LabOrder; status: Status; data: LabSnapshot; pending: boolean; error: string; onSubmit: (note: string, quality?: Quality) => void }) {
  const qualityRequired = status === "prepared";
  const reasonRequired = ["cancelled", "on_hold", "recalled"].includes(status) || order.status === "on_hold";
  const approval = approvedOrderProfiles(order.lines.map(line => line.productId), data.safetyProfiles);
  const blocked = qualityRequired && (approval.missing || approval.incompatible);
  const [quality, setQuality] = useState<QualityDraft>(() => ({ ...emptyQuality(), ...order.quality, minimumTemperature: approval.minimum, maximumTemperature: approval.maximum, processReference: approval.approved.map(profile => `${profile.productName}: ${profile.processReference} (${profile.recipeVersion})`).join(" / ").slice(0, 500), allergens: approval.approved.map(profile => `${profile.productName}: ${profile.allergens}`).join(" / ").slice(0, 1000), storageInstructions: approval.approved.map(profile => `${profile.productName}: ${profile.storageInstructions}`).join(" / ").slice(0, 1000) }));
  const [qualityError, setQualityError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) { setQualityError("اعتمد ملفات سلامة المنتجات أولًا أو افصل المنتجات ذات الحدود غير المتوافقة إلى طلبات مستقلة"); return; }
    if (qualityRequired && approval.records.some(key => !quality.recordReferences[key]?.trim())) { setQualityError("أدخل مراجع السجلات المطلوبة في ملفات سلامة المنتجات"); return; }
    const parsed = qualityRequired ? labQualitySchema.safeParse(quality) : null;
    if (parsed && !parsed.success) { const message = parsed.error.issues[0]?.message || ""; setQualityError(/[\u0600-\u06ff]/u.test(message) ? message : "أكمل بيانات التشغيلة وتواريخ الصلاحية ومراجعة الجودة قبل اعتماد التجهيز"); return; }
    setQualityError("");
    onSubmit(String(new FormData(event.currentTarget).get("note") || ""), parsed?.success ? parsed.data : undefined);
  }
  return <form className={s.body} onSubmit={submit}>{(error || qualityError) && <p className={s.error} role="alert">{error || qualityError}</p>}<div className={s.detailHead}><h2>طلب #{order.number}</h2><span className={s.badge}>{order.branchName}</span></div><p className={s.hint}>تسجل هذه الخطوة باسم المستخدم ووقتها في سجل الطلب</p>{qualityRequired && <><h3 className={s.sectionTitle}><ShieldCheck size={20} aria-hidden="true" /> مراجعة التجهيز وسلامة المنتج</h3><ApprovedProfileSummary approval={approval} /><div className={s.formGrid}><label className={s.field}>رقم التشغيلة<input required maxLength={100} value={quality.lotCode} onChange={event => setQuality({ ...quality, lotCode: event.target.value })} /></label><label className={s.field}>المواد المسببة للحساسية<input required readOnly maxLength={1000} value={quality.allergens} onChange={event => setQuality({ ...quality, allergens: event.target.value })} /><small>سجل النتيجة الفعلية وفق وصفة المنتج وبيانات مورديه</small></label><label className={s.field}>تاريخ الإنتاج<input required type="date" value={quality.producedOn} onChange={event => setQuality({ ...quality, producedOn: event.target.value })} /></label><label className={s.field}>تاريخ انتهاء الصلاحية<input required type="date" min={quality.producedOn} value={quality.expiresOn} onChange={event => setQuality({ ...quality, expiresOn: event.target.value })} /></label><label className={`${s.field} ${s.wide}`}>تعليمات الحفظ والنقل<textarea required readOnly maxLength={1000} value={quality.storageInstructions} onChange={event => setQuality({ ...quality, storageInstructions: event.target.value })} /></label><QualityTraceFields quality={quality} onChange={setQuality} /><TemperatureFields quality={quality} onChange={setQuality} /><RequiredRecords approval={approval} quality={quality} onChange={setQuality} /></div><div className={s.checkGrid}>{(Object.keys(checkLabels) as (keyof Quality["checks"])[]).map(key => <label key={key} className={s.check}><input required type="checkbox" checked={quality.checks[key]} onChange={event => setQuality({ ...quality, checks: { ...quality.checks, [key]: event.target.checked } })} />{checkLabels[key]}</label>)}</div><p className={s.hint}>تعتمد الصلاحية ودرجات الحفظ على خطة سلامة الغذاء المعتمدة للمنتج</p></>}<label className={s.field} style={{ marginTop: 20 }}>{status === "cancelled" ? "سبب الإلغاء" : "ملاحظة الإجراء"}<textarea name="note" required={reasonRequired} minLength={reasonRequired ? 5 : undefined} maxLength={2000} rows={3} /></label><footer className={s.formFooter}><span className={s.hint}>الحالة الحالية: {statusLabels[order.status]}</span><button className={s.primary} disabled={pending || blocked}>{pending ? "جار الحفظ" : status === "cancelled" ? "تأكيد إلغاء الطلب" : actionLabels[status]}<CheckCheck size={18} aria-hidden="true" /></button></footer></form>;
}

function ApprovedProfileSummary({ approval }: { approval: ReturnType<typeof approvedOrderProfiles> }) {
  return <>{approval.missing && <p className={s.error}>لا يمكن اعتماد التجهيز قبل أن يعتمد المالك ملف سلامة لكل منتج في الطلب</p>}{approval.incompatible && <p className={s.error}>حدود الحرارة المعتمدة لهذه المنتجات غير متوافقة افصلها إلى طلبات تجهيز مستقلة</p>}<dl className={s.details}>{approval.approved.map(profile => <div key={profile.productId}><dt>{profile.productName}</dt><dd>وصفة {profile.recipeVersion} / إصدار الملف {profile.revision}<br />الحرارة {profile.minimumTemperature} إلى {profile.maximumTemperature} °م<br />الصلاحية القصوى {profile.maxShelfLifeDays} يوم</dd></div>)}</dl></>;
}

function RequiredRecords({ approval, quality, onChange }: { approval: ReturnType<typeof approvedOrderProfiles>; quality: QualityDraft; onChange: (quality: QualityDraft) => void }) {
  return <>{approval.records.map(key => <label className={`${s.field} ${s.wide}`} key={key}>مرجع سجل {recordLabels[key]}<input required maxLength={1000} value={quality.recordReferences[key] || ""} onChange={event => onChange({ ...quality, recordReferences: { ...quality.recordReferences, [key]: event.target.value } })} /><small>أدخل رقم السجل أو مسار الوثيقة المحفوظة في سجلات المنشأة</small></label>)}</>;
}

function QualityTraceFields({ quality, onChange }: { quality: QualityDraft; onChange: (quality: QualityDraft) => void }) {
  return <><label className={`${s.field} ${s.wide}`}>مصدر وتشغيلة المواد الخام<textarea required maxLength={2000} value={quality.ingredientLots} onChange={event => onChange({ ...quality, ingredientLots: event.target.value })} placeholder="المادة ورقم التشغيلة والمورد أو مرجع الاستلام" /></label><label className={`${s.field} ${s.wide}`}>قراءة الحرارة ورقم جهاز القياس<textarea required maxLength={500} value={quality.temperatureReading} onChange={event => onChange({ ...quality, temperatureReading: event.target.value })} placeholder="سجل القراءة الفعلية ووقت القياس ورقم الجهاز والمرحلة" /></label></>;
}

function TemperatureFields({ quality, onChange }: { quality: QualityDraft; onChange: (quality: QualityDraft) => void }) {
  const fields = [{ key: "temperatureCelsius", label: "الحرارة المقاسة °م" }, { key: "minimumTemperature", label: "الحد الأدنى المعتمد °م" }, { key: "maximumTemperature", label: "الحد الأعلى المعتمد °م" }] as const;
  return <><label className={`${s.field} ${s.wide}`}>مرجع خطة سلامة الغذاء أو الوصفة المعتمدة<input required readOnly maxLength={500} value={quality.processReference} onChange={event => onChange({ ...quality, processReference: event.target.value })} /><small>استخدم حدود المرحلة الفعلية وفق الخطة المعتمدة داخل المنشأة</small></label>{fields.map(field => <label key={field.key} className={s.field}>{field.label}<input required readOnly={field.key !== "temperatureCelsius"} type="number" inputMode="decimal" step="0.01" min="-100" max="400" value={Number.isFinite(quality[field.key]) ? quality[field.key] : ""} onChange={event => onChange({ ...quality, [field.key]: event.target.value === "" ? NaN : Number(event.target.value) })} /></label>)}</>;
}

function QualityActions({ order, pending, onStatus }: { order: LabOrder; pending: boolean; onStatus: (status: Status) => void }) {
  return <div className={s.actions}>{["preparing", "prepared"].includes(order.status) && <button className={s.button} disabled={pending} onClick={() => onStatus("on_hold")}>إيقاف للمراجعة</button>}{["prepared", "out_for_delivery", "delivered"].includes(order.status) && <button className={s.quiet} disabled={pending} onClick={() => onStatus("recalled")}>سحب المنتج وتوثيق السبب</button>}</div>;
}

function TemperatureDetails({ quality }: { quality: Quality }) {
  return <dl className={s.details}><div><dt>الحرارة المقاسة</dt><dd>{quality.temperatureCelsius} °م</dd></div><div><dt>الحدود المعتمدة</dt><dd>{quality.minimumTemperature} إلى {quality.maximumTemperature} °م</dd></div><div className={s.wide}><dt>مرجع الخطة</dt><dd>{quality.processReference}</dd></div></dl>;
}

function SavedQualityRecords({ quality }: { quality: Quality }) {
  return <><h3 className={s.sectionTitle}>مراجع السجلات وقت اعتماد التجهيز</h3><dl className={s.details}>{Object.entries(quality.recordReferences).map(([key, value]) => <div key={key}><dt>{recordLabels[key as keyof typeof recordLabels] || key}</dt><dd>{value}</dd></div>)}</dl>{!!quality.approvedProfiles?.length && <ApprovedProfileSummary approval={approvedOrderProfiles(quality.approvedProfiles.map(profile => profile.productId), quality.approvedProfiles)} />}</>;
}

function FinancialAdjustments({ order }: { order: LabOrder }) {
  return <>{order.refunded > 0 && <p className={s.hint}>قيمة المرتجعات والإشعارات الدائنة: {money(order.refunded)} ر س</p>}{order.payments.some(payment => payment.status !== "completed") && <p className={s.hint}>الدفعات المعلقة أو المحذوفة موضحة في السجل ولا تعد تحصيلًا مكتملًا</p>}</>;
}

function QualityTraceDetails({ quality }: { quality: Quality }) {
  return <dl className={s.details}><div className={s.wide}><dt>مصدر وتشغيلة المواد الخام</dt><dd>{quality.ingredientLots}</dd></div><div className={s.wide}><dt>قراءة الحرارة ورقم الجهاز</dt><dd>{quality.temperatureReading}</dd></div></dl>;
}

export function labTimeline(order: LabOrder) {
  const paymentLabels: Record<string, string> = { completed: "مكتملة", pending: "معلقة", deleted: "محذوفة" };
  const events = order.events.map(event => ({ id: `event-${event.id}`, at: event.at, title: statusLabels[event.action as Status] || ({ create: "إنشاء طلب المعمل", invoice: "ربط الفاتورة", link_invoice: "ربط الفاتورة", payment_updated: "تسجيل أو تعديل دفعة", payment_deleted: "إلغاء دفعة" } as Record<string, string>)[event.action] || "تحديث الطلب", note: event.note, actor: event.actorName, payment: false }));
  const payments = order.payments.map(payment => ({ id: `payment-${payment.id}`, at: payment.at, title: `سند قبض #${payment.number} — ${paymentLabels[payment.status] || "غير مؤكدة"}`, note: `${money(payment.amount)} ر س — ${payment.method || "غير محدد"}`, actor: "دفعة مسجلة في المالية", payment: payment.status === "completed" }));
  return [...events, ...payments].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function OrderDetails({ order, data, financeBase, pending, error, onStatus, onLink }: { order: LabOrder; data: LabSnapshot; financeBase: string; pending: boolean; error: string; onStatus: (status: Status) => void; onLink: (invoice: string) => void }) {
  const next = nextStatus[order.status];
  const timeline = labTimeline(order);
  return <div className={s.body}>{error && <p className={s.error} role="alert">{error}</p>}<div className={s.detailHead}><h2>{order.customerName}</h2><span className={s.badge}>{statusLabels[order.status]}</span></div><dl className={s.details}><div><dt>الفرع</dt><dd>{order.branchName}</dd></div><div><dt>موعد التسليم</dt><dd>{dateTime(order.requiredAt)}</dd></div><div><dt>رقم العميل</dt><dd><bdi>{order.customerPhone || "غير مسجل"}</bdi></dd></div></dl><div className={s.detailLines}>{order.lines.map((line, index) => <div className={s.product} key={`${line.productId}-${index}`}><ProductImage src={line.imageUrl} name={line.name} /><div><h3>{line.name}</h3><span className={s.quantity}>{line.quantity} قطعة</span></div></div>)}</div>{order.notes && <><h3 className={s.sectionTitle}>تفاصيل التجهيز</h3><p className={s.notes}>{order.notes}</p></>}<div className={s.totals}><div><small>إجمالي الفاتورة</small><b>{money(order.total)}</b></div><div><small>المدفوع</small><b>{money(order.paid)}</b></div><div><small>المتبقي</small><b>{money(order.outstanding)}</b></div></div><FinancialAdjustments order={order} />{order.invoiceId ? <div className={s.actions}><Link className={s.button} href={`${financeBase}?section=sales&view=invoice&invoice=${encodeURIComponent(order.invoiceId)}`}>الفاتورة #{order.invoiceNumber} ودفعات العميل<ArrowRight size={16} aria-hidden="true" /></Link></div> : data.capabilities.linkInvoice ? <form className={s.linkForm} onSubmit={event => { event.preventDefault(); onLink(String(new FormData(event.currentTarget).get("invoiceId"))); }}><label className={s.field}>ربط فاتورة العميل<select required name="invoiceId" defaultValue=""><option value="">اختر فاتورة هذا العميل</option>{data.invoices.filter(invoice => invoice.customerId === order.customerId).map(invoice => <option key={invoice.id} value={invoice.id}>#{invoice.number} — {money(invoice.total)} ر س</option>)}</select></label><button className={s.primary} disabled={pending}>ربط الفاتورة</button></form> : <p className={s.hint}>لم يربط المحاسب فاتورة بهذا الطلب بعد</p>}{!order.invoiceId && data.capabilities.linkInvoice && <p className={s.hint}>أنشئ الفاتورة بالأصناف والكميات نفسها من المالية ثم اربطها هنا لتتبع التحصيل</p>}<h3 className={s.sectionTitle}>تسلسل الطلب والسداد</h3><ol className={s.timeline}>{timeline.map(item => <li key={item.id}><strong className={item.payment ? s.payment : undefined}>{item.title}</strong>{item.note && <p>{item.note}</p>}<small>{dateTime(item.at)} — {item.actor}</small></li>)}</ol>{order.quality && <><h3 className={s.sectionTitle}>سجل جودة التجهيز</h3><dl className={s.details}><div><dt>التشغيلة</dt><dd>{order.quality.lotCode}</dd></div><div><dt>تاريخ الإنتاج</dt><dd>{order.quality.producedOn}</dd></div><div><dt>انتهاء الصلاحية</dt><dd>{order.quality.expiresOn}</dd></div><div><dt>مسببات الحساسية</dt><dd>{order.quality.allergens}</dd></div><div className={s.wide}><dt>الحفظ والنقل</dt><dd>{order.quality.storageInstructions}</dd></div></dl><QualityTraceDetails quality={order.quality} /><TemperatureDetails quality={order.quality} /><SavedQualityRecords quality={order.quality} /></>}<footer className={s.formFooter}><div className={s.actions}>{next && data.capabilities.prepare && <button className={s.primary} disabled={pending} onClick={() => onStatus(next)}>{next === "out_for_delivery" ? <Truck size={17} aria-hidden="true" /> : <PackageCheck size={17} aria-hidden="true" />}{actionLabels[next]}</button>}{order.status === "prepared" && data.capabilities.prepare && <button className={s.button} disabled={pending} onClick={() => onStatus("delivered")}>تسليم مباشر</button>}</div>{data.capabilities.prepare && ["requested", "preparing"].includes(order.status) && <button className={s.quiet} disabled={pending} onClick={() => onStatus("cancelled")}>إلغاء الطلب</button>}</footer>{data.capabilities.prepare && <QualityActions order={order} pending={pending} onStatus={onStatus} />}</div>;
}
