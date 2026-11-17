"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Barcode, Check, ClipboardList, Plus, RefreshCw, Search, ShoppingBasket, Trash2, Truck } from "lucide-react";
import { getAldeemWorkshop, saveAldeemWorkshop } from "@/app/actions/aldeem-workshop";
import type { WorkshopCommand, WorkshopOrder, WorkshopProduct, WorkshopSnapshot, WorkshopStatus } from "@/lib/aldeem/workshop";
import { useAldeemLocation } from "./use-location";
import s from "./branch-order-showcase.module.css";
import css from "./workshop-orders.module.css";
import { WorkshopOrderItems, WorkshopProductPhoto } from "./workshop-order-items";

type View = "employee" | "lab" | "deliveries";
type SearchField = "all" | "name" | "barcode" | "sku" | "flavor" | "shape" | "packaging";
type CartLine = WorkshopProduct & { quantity: number };
type Draft = { branch: string; requiredDate: string; notes: string; cart: CartLine[] };
const views: Record<View, string> = { employee: "طلب منتجات للفرع", lab: "لوحة تجهيز المعمل", deliveries: "الإرسال والاستلام" };
const fields: Record<SearchField, string> = { all: "كل بيانات الصنف", name: "الاسم", barcode: "الباركود", sku: "رقم الصنف", flavor: "النكهة", shape: "الشكل", packaging: "التغليف" };
const labels: Record<WorkshopStatus, string> = { requested: "طلب جديد", preparing: "قيد التجهيز", prepared: "جاهز للإرسال", out_for_delivery: "في الطريق للفرع", delivered: "تم استلام الفرع", cancelled: "ملغي" };
const archiveLabels: Record<string, string> = { ...labels, on_hold: "موقوف للمراجعة", recalled: "مسترجع" };
const flow: WorkshopStatus[] = ["requested", "preparing", "prepared", "out_for_delivery", "delivered"];
const nextStatus: Partial<Record<WorkshopStatus, WorkshopStatus>> = { requested: "preparing", preparing: "prepared", prepared: "out_for_delivery", out_for_delivery: "delivered" };
const nextLabel: Partial<Record<WorkshopStatus, string>> = { requested: "استلام الطلب وبدء التجهيز", preparing: "تأكيد اكتمال التجهيز", prepared: "تأكيد إرسال الطلب للفرع", out_for_delivery: "تأكيد استلام الفرع" };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dateLabel = (value: string) => new Date(value).toLocaleString("ar-SA-u-ca-gregory", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
const number = (value: number) => value.toLocaleString("ar-SA", { maximumFractionDigits: 3 });
// In-memory recovery only for an unconfirmed write, including an in-app navigation away
let unconfirmed: { command: WorkshopCommand; draft: Draft } | null = null;

function QuantityInput({ line, onChange }: { line: CartLine; onChange: (quantity: number) => void }) {
  const [text, setText] = useState(String(line.quantity));
  useEffect(() => { setText(String(line.quantity)); }, [line.quantity]);
  return <input aria-label={`كمية ${line.name}`} type="number" min={0.001} max={100000} step={0.001} required value={text} onChange={event => { const value = event.target.value; setText(value); if (value !== "" && Number(value) > 0) onChange(Number(value)); }} />;
}

export function AldeemWorkshopOrders({ initialView = "lab", onPendingChange }: { initialView?: View; onPendingChange?: (pending: boolean) => void }) {
  const headingId = useId();
  const [view, setView, locationReady] = useAldeemLocation<View>("workshopView", initialView, Object.keys(views) as View[]);
  const [snapshot, setSnapshot] = useState<WorkshopSnapshot | null>(null);
  const [query, setQuery] = useState(""), [field, setField] = useState<SearchField>("all");
  const [filters, setFilters] = useState<{ branchId: string | null; status: WorkshopStatus | null; query: string; searchField: SearchField; offset: number; legacyOffset: number }>({ branchId: null, status: view === "deliveries" ? "out_for_delivery" : null, query: "", searchField: "all", offset: 0, legacyOffset: 0 });
  const [selectedId, setSelectedId] = useAldeemLocation("workshopOrder", "", ["", ...(snapshot?.orders.map(order => order.id) ?? [])]);
  const [draft, setDraft] = useState<Draft>(() => unconfirmed?.draft ?? { branch: "", requiredDate: today(), notes: "", cart: [] });
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [formError, setFormError] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(!!unconfirmed), [refresh, setRefresh] = useState(0), [actionNote, setActionNote] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const command = useRef<WorkshopCommand | null>(unconfirmed?.command ?? null), saving = useRef(false), mounted = useRef(false);
  const request = useRef<{ key: string; promise: ReturnType<typeof getAldeemWorkshop> } | null>(null);
  const blocked = busy || uncertain;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onPendingChange?.(blocked); return () => onPendingChange?.(false); }, [blocked, onPendingChange]);
  useEffect(() => {
    if (!locationReady) return;
    let active = true;
    const key = JSON.stringify({ filters, refresh });
    setLoading(true); setError("");
    if (request.current?.key !== key) request.current = { key, promise: getAldeemWorkshop(filters) };
    request.current.promise.then(result => { if (!active) return; if (result.ok) setSnapshot(result.data); else setError(result.message); })
      .catch(() => { if (active) setError("تعذر قراءة الطلبات أعد المحاولة"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [locationReady, filters, refresh]);
  useEffect(() => {
    if (!blocked) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [blocked]);
  const editable = !blocked && !loading && !error;
  const orders = snapshot?.orders ?? [];
  const selected = orders.find(order => order.id === selectedId) ?? orders[0];
  useEffect(() => { setActionNote(""); }, [selected?.id]);
  function changeView(next: View) {
    if (blocked) return;
    setView(next); setSelectedId(""); setActionNote("");
    setFilters(current => ({ ...current, status: next === "deliveries" ? "out_for_delivery" : null, offset: 0 }));
  }
  function quantity(product: WorkshopProduct, value: number) {
    if (!editable || !Number.isFinite(value)) return;
    setDraft(current => ({ ...current, cart: value <= 0 ? current.cart.filter(line => line.id !== product.id) : current.cart.some(line => line.id === product.id) ? current.cart.map(line => line.id === product.id ? { ...line, quantity: value } : line) : [...current.cart, { ...product, quantity: value }] }));
  }
  async function execute(next?: WorkshopCommand) {
    if (saving.current) return;
    if (!uncertain && next) command.current = next;
    const submitted = command.current;
    if (!submitted) return;
    unconfirmed = { command: submitted, draft };
    saving.current = true; setBusy(true); setFormError(""); setNotice("");
    try {
      const result = await saveAldeemWorkshop(submitted);
      if (!result.ok) {
        const unknown = uncertain || result.uncertain;
        if (!unknown && unconfirmed?.command.requestId === submitted.requestId) unconfirmed = null;
        if (mounted.current) { setUncertain(unknown); setFormError(result.message); }
        return;
      }
      if (unconfirmed?.command.requestId === submitted.requestId) unconfirmed = null;
      if (!mounted.current) return;
      command.current = null; setUncertain(false); setActionNote("");
      if (submitted.action === "create") setDraft(current => ({ ...current, cart: [], notes: "" }));
      setNotice(submitted.action === "create" ? "تم إرسال طلب الفرع إلى المعمل وحفظه في الحساب" : `تم تحديث الطلب إلى ${labels[result.data.status]}`);
      setRefresh(value => value + 1);
    } catch { if (mounted.current) { setUncertain(true); setFormError("تعذر تأكيد الحفظ تحقق من نفس الطلب قبل إجراء تعديل جديد"); } }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editable || !snapshot?.canCreate) return;
    if (!draft.branch || !draft.cart.length) { setFormError("اختر الفرع وأضف صنفًا واحدًا على الأقل"); return; }
    if (!draft.requiredDate || draft.requiredDate < today()) { setFormError("اختر تاريخ احتياج يبدأ من اليوم"); return; }
    if (draft.cart.some(line => line.quantity <= 0 || line.quantity > 100000 || Math.abs(line.quantity * 1000 - Math.round(line.quantity * 1000)) > 0.00001)) { setFormError("راجع الكميات بحد أقصى ثلاث منازل عشرية"); return; }
    void execute({ action: "create", requestId: crypto.randomUUID(), id: crypto.randomUUID(), branchId: draft.branch, requiredAt: `${draft.requiredDate}T23:59:00+03:00`, notes: draft.notes, lines: draft.cart.map(line => ({ itemId: line.id, quantity: line.quantity })) });
  }
  function update(order: WorkshopOrder, status: WorkshopStatus) {
    if (!editable) return;
    void execute({ action: "status", requestId: crypto.randomUUID(), id: order.id, revision: order.revision, status, note: actionNote });
  }
  const canAdvance = selected && (selected.status === "out_for_delivery" ? snapshot?.canReceive : snapshot?.canPrepare) && nextStatus[selected.status];
  return <div className={`${s.workspace} ${css.root}`} dir="rtl">
    <div className={css.toolbar}><p className={css.muted}>طلبات الفروع المحفوظة في الحساب</p><button type="button" disabled={blocked || loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={17} aria-hidden="true" />تحديث السجل</button></div>
    <nav className={s.tabs} aria-label="واجهات المعمل">{(Object.keys(views) as View[]).map(key => <button type="button" key={key} disabled={blocked} aria-pressed={view === key} onClick={() => changeView(key)}>{views[key]}</button>)}</nav>
    {notice && <div className={s.notice} role="status"><Check size={18} aria-hidden="true" /><span>{notice}</span><button type="button" onClick={() => setNotice("")}>إخفاء</button></div>}
    {formError && <p role="alert" className={s.formError}>{formError}</p>}
    {uncertain && <div className={`${css.warning} ${css.recovery}`} role="status"><span>هناك عملية حفظ لم تتأكد نتيجتها أعد التحقق بنفس البيانات دون إنشاء طلب آخر</span><button type="button" disabled={busy} onClick={() => void execute()}>{busy ? "جار التحقق" : "التحقق وإعادة المحاولة"}</button></div>}
    {error && <div className={s.formError} role="alert">{error} <button type="button" disabled={blocked || loading} onClick={() => setRefresh(value => value + 1)}>إعادة المحاولة</button></div>}
    {loading && <p className={css.loading} role="status">جار قراءة المنتجات وطلبات الفروع</p>}
    {!loading && !error && snapshot && <>
    {view === "employee" ? <div className={s.orderLayout}><section className={s.catalog} aria-labelledby={headingId}>
      <div className={s.sectionHead}><h3 id={headingId}>منتجات الديم</h3><span>{number(snapshot.products.length)} من {number(snapshot.productCount)} صنف مطابق</span></div>
      <form className={s.searchRow} onSubmit={event => { event.preventDefault(); if (!blocked) setFilters(current => ({ ...current, query, searchField: field, offset: 0 })); }}><label>البحث بواسطة<select disabled={blocked} value={field} onChange={event => setField(event.target.value as SearchField)}>{Object.entries(fields).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label><label className={s.search}>ابحث أو امسح الباركود<span><Search size={17} aria-hidden="true" /><input type="search" maxLength={100} disabled={blocked} value={query} onChange={event => setQuery(event.target.value)} placeholder="الاسم أو رقم الصنف أو مواصفاته" /></span></label><button type="submit" disabled={blocked}>بحث المنتجات</button></form>
      {snapshot.productCount > snapshot.productLimit && <p className={css.muted}>تظهر أول {number(snapshot.productLimit)} نتيجة حدد جزءًا من الاسم أو المواصفات للوصول للصنف المطلوب</p>}
      <div className={s.products}>{snapshot.products.map(product => <article key={product.id} className={s.product}><WorkshopProductPhoto name={product.name} imageUrl={product.imageUrl} /><div className={`${s.productBody} ${css.productMeta}`}><div className={s.productTitle}><h4>{product.name}</h4><bdi>{product.sku || "رقم الصنف غير مسجل"}</bdi></div><p>{[product.flavor, product.shape, product.packaging].filter(Boolean).join(" / ") || "لم تسجل مواصفات إضافية"}</p><small><Barcode size={14} aria-hidden="true" /><bdi>{product.barcode || "بدون باركود مسجل"}</bdi></small><button type="button" className={s.add} disabled={!editable || !snapshot.canCreate || draft.cart.length >= 100 && !draft.cart.some(line => line.id === product.id)} onClick={() => quantity(product, (draft.cart.find(line => line.id === product.id)?.quantity ?? 0) + 1)}><Plus size={16} aria-hidden="true" />أضف للطلب{draft.cart.some(line => line.id === product.id) && <span>{number(draft.cart.find(line => line.id === product.id)!.quantity)}</span>}</button></div></article>)}</div>
      {!snapshot.products.length && <div className={s.empty}><Search size={28} aria-hidden="true" /><h4>لا توجد منتجات مطابقة</h4><p>جرب الاسم أو الباركود أو مواصفات أخرى</p></div>}
    </section><form className={s.cart} onSubmit={submit}><div className={s.sectionHead}><h3><ShoppingBasket size={20} aria-hidden="true" />طلب الفرع</h3><span>{number(draft.cart.length)} أصناف</span></div><div className={s.cartBody}>
      {!snapshot.canCreate && <p className={css.disabledNotice}>الحساب الحالي متاح له استعراض الطلبات ولا يملك صلاحية إنشاء طلب</p>}
      <fieldset className={css.fieldset} disabled={!editable || !snapshot.canCreate}><label>الفرع المستلم<select required value={draft.branch} onChange={event => setDraft(current => ({ ...current, branch: event.target.value }))}><option value="">اختر الفرع</option>{snapshot.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>تاريخ الاحتياج<input required type="date" min={today()} value={draft.requiredDate} onChange={event => setDraft(current => ({ ...current, requiredDate: event.target.value }))} /></label>
      <div className={s.cartLines}>{draft.cart.length ? draft.cart.map(line => <div className={s.cartLine} key={line.id}><div><strong>{line.name}</strong><small>{line.packaging}</small></div><label className={s.quantity}>الكمية / {line.unit}<QuantityInput line={line} onChange={value => quantity(line, value)} /></label><button type="button" className={s.remove} aria-label={`إزالة ${line.name}`} onClick={() => quantity(line, 0)}><Trash2 size={17} aria-hidden="true" /></button></div>) : <div className={s.cartEmpty}><ShoppingBasket size={30} aria-hidden="true" /><p>أضف الأصناف والكميات المطلوبة للفرع</p></div>}</div>
      <label>ملاحظات التجهيز والتسليم<textarea rows={3} maxLength={2000} value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} /></label><button type="submit" className={s.primary} disabled={!draft.cart.length}>{busy ? "جار إرسال الطلب" : "إرسال طلب الفرع للمعمل"}</button></fieldset><p className={s.smallNote}>يحفظ الطلب باسم الموظف المسجل في الحساب والكميات بالوحدات الموضحة</p>
    </div></form></div> : <>
      <div className={s.listTools}><label>الفرع<select disabled={blocked} value={filters.branchId ?? ""} onChange={event => { setSelectedId(""); setFilters(current => ({ ...current, branchId: event.target.value || null, offset: 0, legacyOffset: 0 })); }}><option value="">جميع الفروع المتاحة</option>{snapshot.branches.map(branch => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label><label>حالة الطلب<select disabled={blocked} value={filters.status ?? ""} onChange={event => { setSelectedId(""); setFilters(current => ({ ...current, status: event.target.value as WorkshopStatus || null, offset: 0 })); }}><option value="">كل الحالات</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><p>{number(snapshot.total)} طلب مطابق للفلاتر من السجلات الفعلية</p></div>
      <div className={s.boardLayout}><section className={s.orderList} aria-label="طلبات الفروع">{orders.map(order => <button type="button" key={order.id} className={s.orderCard} disabled={blocked} aria-pressed={selected?.id === order.id} onClick={() => { setSelectedId(order.id); setActionNote(""); }}><span className={s.orderTop}><bdi>#{order.number}</bdi><span className={s.status} data-stage={flow.indexOf(order.status)}>{labels[order.status]}</span></span><strong>{order.branchName}</strong><span>الاحتياج {dateLabel(order.requiredAt)}</span><small>{number(order.lines.length)} أصناف / {order.createdByName || "موظف الحساب"}</small></button>)}{!orders.length && <div className={s.empty}><ClipboardList size={28} aria-hidden="true" /><h4>لا توجد طلبات مطابقة</h4><p>اختر حالة أو فرعًا آخر أو أرسل أول طلب من صفحة طلب المنتجات</p></div>}</section>
      {selected && <section className={s.orderDetail} aria-label={`تفاصيل طلب ${selected.number}`}><header className={s.detailHead}><div><span>طلب فرع محفوظ</span><h3>{selected.branchName}</h3><bdi>#{selected.number}</bdi></div><Truck size={28} aria-hidden="true" /></header><dl className={s.orderMeta}><div><dt>مقدم الطلب</dt><dd>{selected.createdByName || "موظف الحساب"}</dd></div><div><dt>تاريخ الاحتياج</dt><dd>{dateLabel(selected.requiredAt)}</dd></div><div><dt>إنشاء الطلب</dt><dd>{dateLabel(selected.createdAt)}</dd></div><div><dt>الحالة الحالية</dt><dd>{labels[selected.status]}</dd></div></dl>
      {selected.status !== "cancelled" && <ol className={`${s.progress} ${css.steps}`}>{flow.map((status, index) => <li key={status} data-complete={index < flow.indexOf(selected.status)} aria-current={status === selected.status ? "step" : undefined}><span>{index < flow.indexOf(selected.status) ? <Check size={14} aria-hidden="true" /> : index + 1}</span>{labels[status]}</li>)}</ol>}
      <WorkshopOrderItems lines={selected.lines} />
      {selected.notes && <div className={s.orderNotes}><strong>ملاحظات الفرع</strong><p>{selected.notes}</p></div>}
      <div className={s.nextStep}>{canAdvance ? <><div className={css.actionFields}><label>ملاحظات هذه الخطوة<textarea rows={2} maxLength={2000} disabled={!editable} value={actionNote} onChange={event => setActionNote(event.target.value)} placeholder={selected.status === "out_for_delivery" ? "ملاحظات الاستلام ومطابقة الكميات" : "تفاصيل التجهيز أو تسليم الطلب للنقل"} /></label></div><p>{selected.status === "out_for_delivery" ? "أكد الاستلام بعد مراجعة الأصناف والكميات مع طلب الفرع" : "انتقل للخطوة التالية بعد اكتمالها فعليًا"}</p><button type="button" className={s.primary} disabled={!editable} onClick={() => update(selected, nextStatus[selected.status]!)}>{busy ? "جار الحفظ" : nextLabel[selected.status]}</button></> : <p>{selected.status === "delivered" ? "اكتمل الطلب باستلام الفرع" : selected.status === "cancelled" ? "هذا الطلب ملغي" : "تحديث هذه الخطوة متاح للموظف المخول"}</p>}</div>
      <details className={css.details}><summary>سجل متابعة الطلب</summary><ul className={css.audit}>{selected.events.map(event => <li key={event.id}><strong>{labels[event.status]}</strong><small>{event.actorName || "موظف الحساب"} / {dateLabel(event.at)}</small>{event.note && <p>{event.note}</p>}</li>)}</ul>{!selected.events.length && <p className={css.muted}>لا توجد خطوات مسجلة بعد</p>}</details></section>}
      </div><footer className={css.pagination}><span>عرض {number(orders.length)} من {number(snapshot.total)} طلب</span><div><button type="button" disabled={blocked || snapshot.offset === 0} onClick={() => { setSelectedId(""); setFilters(current => ({ ...current, offset: Math.max(0, snapshot.offset - snapshot.pageSize) })); }}>السابق</button><span>صفحة {number(Math.floor(snapshot.offset / snapshot.pageSize) + 1)}</span><button type="button" disabled={blocked || snapshot.offset + snapshot.pageSize >= snapshot.total} onClick={() => { setSelectedId(""); setFilters(current => ({ ...current, offset: snapshot.offset + snapshot.pageSize })); }}>التالي</button></div></footer>
      <details className={`${s.orderDetail} ${css.details}`} open={archiveOpen} onToggle={event => setArchiveOpen(event.currentTarget.open)}><summary>أرشيف الطلبات السابقة للقراءة فقط — {number(snapshot.legacyTotal)} طلب</summary><p className={css.muted}>طلبات محفوظة من المسار السابق وتعرض ببياناتها الأصلية مستقلة عن طلبات الفروع الجديدة</p><p className={css.muted}>المعروض {number(snapshot.legacyOrders.length)} من {number(snapshot.legacyTotal)} طلب سابق</p>{snapshot.legacyOrders.length ? <div className={`${s.tableWrap} ${css.table}`} role="region" tabIndex={0} aria-label="أرشيف طلبات المعمل السابقة"><table><thead><tr><th>الطلب والفرع</th><th>العميل المسجل سابقًا</th><th>الموعد</th><th>الحالة</th><th>الأصناف والملاحظات</th></tr></thead><tbody>{snapshot.legacyOrders.map(order => <tr key={order.id}><td><strong>#{order.number}</strong><small>{order.branchName}</small></td><td>{order.customerName || "غير مسجل"}</td><td>{dateLabel(order.requiredAt)}</td><td>{archiveLabels[order.status] ?? "حالة سابقة"}</td><td>{order.lines.map((line, index) => <small key={index}>{line.name} / {number(line.quantity)}</small>)}{order.notes && <small>{order.notes}</small>}</td></tr>)}</tbody></table></div> : <p className={css.muted}>لا توجد طلبات سابقة ضمن هذا العرض</p>}<footer className={css.pagination}><span>صفحة الأرشيف {number(Math.floor(snapshot.legacyOffset / snapshot.pageSize) + 1)}</span><div><button type="button" disabled={blocked || snapshot.legacyOffset === 0} onClick={() => setFilters(current => ({ ...current, legacyOffset: Math.max(0, snapshot.legacyOffset - snapshot.pageSize) }))}>السابق في الأرشيف</button><button type="button" disabled={blocked || snapshot.legacyOffset + snapshot.pageSize >= snapshot.legacyTotal} onClick={() => setFilters(current => ({ ...current, legacyOffset: snapshot.legacyOffset + snapshot.pageSize }))}>التالي في الأرشيف</button></div></footer></details>
    </>}
    </>}
  </div>;
}
