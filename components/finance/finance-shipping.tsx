"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDownUp, ArrowRight, ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, Save, Settings, Trash2, X } from "lucide-react";
import { deleteFinanceShippingOption, getFinanceShippingOption, getFinanceShippingSettings, listFinanceShippingOptions, saveFinanceShippingOption, saveFinanceShippingSettings } from "@/app/actions/finance-shipping";
import { defaultShippingQuery, shippingListQuerySchema, shippingOptionInputSchema, type ShippingContext, type ShippingListQuery, type ShippingOption, type ShippingOptionInput } from "@/lib/finance/shipping";
import { FinanceShippingActivity } from "./finance-shipping-activity";
import { Modal } from "@/components/dashboard/ui/modal";
import styles from "./finance.module.css";
import local from "./finance-shipping.module.css";

type View = "settings" | "cod-settings" | "list" | "create" | "detail" | "edit";
type Props = { slug: string; canEdit: boolean; disabled: boolean; onBack: () => void };
type ManagerProps = Props & { context: ShippingContext; onReload: () => void };
type Result<T> = { ok: true; data: T } | { ok: false; message: string };
const money = (value: number) => new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
export const shippingUrlKeys = ["shippingView", "shippingOption", "shippingTab", "shippingQuery", "shippingStatus", "shippingPage", "shippingSort", "shippingDirection"];
export function navigateShipping(view: View = "settings", id?: string, replace = false) {
  const url = new URL(window.location.href);
  url.searchParams.set("section", "sales"); url.searchParams.set("view", "sales-settings"); url.searchParams.set("settings", "shipping"); url.searchParams.set("shippingView", view);
  if (id) url.searchParams.set("shippingOption", id); else url.searchParams.delete("shippingOption");
  url.searchParams.delete("shippingTab");
  window.history[replace ? "replaceState" : "pushState"](null, "", `${url.pathname}${url.search}`);
}

function useMutation() {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const lock = useRef(false), mounted = useRef(true), pendingUrl = useRef("");
  useEffect(() => {
    mounted.current = true;
    const unload = (event: BeforeUnloadEvent) => { if (lock.current) event.preventDefault(); };
    const pop = (event: PopStateEvent) => { if (lock.current) { event.stopImmediatePropagation(); window.history.pushState(null, "", pendingUrl.current); } };
    window.addEventListener("beforeunload", unload); window.addEventListener("popstate", pop, true);
    return () => { mounted.current = false; window.removeEventListener("beforeunload", unload); window.removeEventListener("popstate", pop, true); };
  }, []);
  async function run<T,>(operation: () => Promise<Result<T>>): Promise<T | null> {
    if (lock.current) return null;
    lock.current = true; pendingUrl.current = window.location.href; setPending(true); setError("");
    try {
      const response = await operation();
      if (!mounted.current) return null;
      if (!response.ok) { setError(response.message); return null; }
      return response.data;
    } catch { if (mounted.current) setError("تعذر تأكيد العملية أعد المحاولة بنفس البيانات"); return null; }
    finally { lock.current = false; if (mounted.current) setPending(false); }
  }
  return { pending, error, setError, run };
}

export function FinanceShipping(props: Props) {
  const params = useSearchParams(), [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ slug: string; attempt: number; data?: ShippingContext; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    getFinanceShippingSettings(props.slug).then(result => { if (active) setLoaded({ slug: props.slug, attempt, ...(result.ok ? { data: result.data } : { error: result.message }) }); }).catch(() => { if (active) setLoaded({ slug: props.slug, attempt, error: "تعذر تحميل إعدادات الشحن" }); });
    return () => { active = false; };
  }, [props.slug, attempt]);
  const current = loaded?.slug === props.slug && loaded.attempt === attempt ? loaded : null;
  const onReload = () => setAttempt(value => value + 1);
  if (!current?.data) return <section className={local.page} dir="rtl"><header className={local.top}><h2>خيارات الشحن</h2><button type="button" className={styles.secondary} onClick={props.onBack}>إعدادات المبيعات</button></header>{current?.error ? <div className={styles.error} role="alert"><p>{current.error}</p><button type="button" className={styles.secondary} onClick={onReload}>إعادة المحاولة</button></div> : <p role="status">جار تحميل بيانات الشحن</p>}</section>;
  const view = params.get("shippingView") ?? "settings", id = params.get("shippingOption");
  const common = { ...props, context: current.data, onReload };
  if (view === "list") return <ShippingList key={`${props.slug}:${attempt}`} {...common} />;
  if (view === "create") return <ShippingEditor key={`${props.slug}:create:${attempt}`} {...common} />;
  if ((view === "detail" || view === "edit") && id) return <ShippingOptionView key={`${props.slug}:${id}:${view}:${attempt}`} {...common} id={id} edit={view === "edit"} />;
  return <ShippingSettings key={`${props.slug}:${view}:${attempt}`} {...common} codOnly={view === "cod-settings"} />;
}

function ShippingSettings({ slug, canEdit, disabled, onBack, context, onReload, codOnly }: ManagerProps & { codOnly: boolean }) {
  const [settings, setSettings] = useState(context.settings), [saved, setSaved] = useState(context), [message, setMessage] = useState("");
  const mutation = useMutation(), blocked = disabled || !canEdit || mutation.pending;
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved.settings);
  const cancel = () => { if (!mutation.pending && (!dirty || window.confirm("توجد تعديلات غير محفوظة هل تريد إلغاءها؟"))) { if (codOnly) navigateShipping("list"); else onBack(); } };
  return <section className={local.page} dir="rtl"><form noValidate onSubmit={event => { event.preventDefault(); if (blocked) return; if (codOnly && !settings.codServiceId) { mutation.setError("اختر خدمة رسوم الدفع عند الاستلام"); return; } void mutation.run(() => saveFinanceShippingSettings(slug, settings, saved.revision)).then(result => { if (result) { setSaved(result); setSettings(result.settings); setMessage("تم حفظ إعدادات الشحن"); } }); }}>
    <header className={local.top}><h2>{codOnly ? "إعدادات خيارات الشحن" : "إعدادات الشحن"}</h2><div className={local.actions}><button type="submit" className={styles.primary} disabled={blocked || !dirty}><Save size={16} aria-hidden="true" />{mutation.pending ? "جار الحفظ" : "حفظ"}</button><button type="button" className={styles.secondary} disabled={mutation.pending} onClick={cancel}><X size={16} aria-hidden="true" />إلغاء</button></div></header>
    <MutationError error={mutation.error} pending={mutation.pending} onReload={onReload} />{message && <p role="status" className={styles.success}>{message}</p>}
    <div className={`${local.panel} ${local.settingsPanel}`}>
      {!codOnly && <label className={local.enable}><input type="checkbox" role="switch" checked={settings.enabled} disabled={blocked} onChange={event => { setSettings({ ...settings, enabled: event.target.checked }); setMessage(""); }} />تفعيل خيارات الشحن</label>}
      {!codOnly && <button type="button" className={local.link} disabled={mutation.pending} onClick={() => { if (!dirty || window.confirm("توجد تعديلات غير محفوظة هل تريد مغادرة الإعدادات؟")) navigateShipping("list"); }}>إدارة خيارات الشحن</button>}
      <label className={local.field}>رسوم الدفع عند الاستلام {codOnly && <span aria-hidden="true">*</span>}<select value={settings.codServiceId ?? ""} required={codOnly} disabled={blocked} onChange={event => { setSettings({ ...settings, codServiceId: event.target.value || null }); setMessage(""); }}><option value="">اختر خدمة</option>{context.services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}{settings.codServiceId && !context.services.some(service => service.id === settings.codServiceId) && <option value={settings.codServiceId} disabled>الخدمة المحفوظة غير متاحة</option>}</select></label>
      {!codOnly && <p className={local.hint}>أضف منتجًا من نوع خدمة أولًا ثم اختره هنا وأضفه يدويًا كبند في الفاتورة عند الحاجة إلى رسوم الدفع عند الاستلام</p>}
      {!canEdit && <p className={local.hint}>تعديل إعدادات الشحن يتطلب صلاحية إدارة الإعدادات</p>}
    </div>
  </form></section>;
}

function MutationError({ error, pending, onReload }: { error: string; pending: boolean; onReload: () => void }) {
  return error ? <div className={styles.error} role="alert"><span>{error}</span><button type="button" className={styles.secondary} disabled={pending} onClick={() => { if (window.confirm("إعادة التحميل تستبدل التعديلات غير المحفوظة هل تريد المتابعة؟")) onReload(); }}>إعادة تحميل البيانات</button></div> : null;
}

function ShippingList(props: ManagerProps) {
  const params = useSearchParams();
  const parsed = shippingListQuerySchema.safeParse({ query: params.get("shippingQuery") ?? "", status: params.get("shippingStatus") ?? "all", page: Number(params.get("shippingPage") ?? 1), sort: params.get("shippingSort") ?? "displayOrder", direction: params.get("shippingDirection") ?? "asc" });
  const query = parsed.success ? parsed.data : defaultShippingQuery, queryKey = JSON.stringify(query);
  const [filters, setFilters] = useState({ query: query.query, status: query.status }), [filterKey, setFilterKey] = useState(`${query.query}:${query.status}`);
  if (filterKey !== `${query.query}:${query.status}`) { setFilterKey(`${query.query}:${query.status}`); setFilters({ query: query.query, status: query.status }); }
  const [result, setResult] = useState<{ queryKey: string; data?: { items: ShippingOption[]; total: number; page: number; limit: 30 }; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    listFinanceShippingOptions(props.slug, JSON.parse(queryKey) as ShippingListQuery).then(response => { if (active) setResult({ queryKey, ...(response.ok ? { data: response.data } : { error: response.message }) }); }).catch(() => { if (active) setResult({ queryKey, error: "تعذر تحميل خيارات الشحن" }); });
    return () => { active = false; };
  }, [props.slug, queryKey]);
  const current = result?.queryKey === queryKey ? result : null, data = current?.data;
  function navigateQuery(next: ShippingListQuery) {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries({ shippingQuery: next.query, shippingStatus: next.status, shippingPage: next.page, shippingSort: next.sort, shippingDirection: next.direction })) url.searchParams.set(key, String(value));
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
  }
  const sort = (field: ShippingListQuery["sort"]) => navigateQuery({ ...query, page: 1, sort: field, direction: query.sort === field && query.direction === "asc" ? "desc" : "asc" });
  return <section className={local.page} dir="rtl"><header className={local.top}><h2>خيارات الشحن</h2><button type="button" className={styles.secondary} onClick={() => navigateShipping("settings")}><ArrowRight size={16} aria-hidden="true" />إعدادات الشحن</button></header>
    <div className={local.listToolbar}><div className={local.pagination}><button type="button" disabled={!data || data.page <= 1} onClick={() => navigateQuery({ ...query, page: data!.page - 1 })} aria-label="الصفحة السابقة"><ChevronRight size={17} aria-hidden="true" /></button><span>{data ? data.total ? `${(data.page - 1) * 30 + 1} - ${Math.min(data.page * 30, data.total)} من ${data.total}` : "٠ من ٠" : "جار التحميل"}</span><button type="button" disabled={!data || data.page * 30 >= data.total} onClick={() => navigateQuery({ ...query, page: data!.page + 1 })} aria-label="الصفحة التالية"><ChevronLeft size={17} aria-hidden="true" /></button></div><div className={local.actions}><button type="button" className={styles.secondary} onClick={() => navigateShipping("cod-settings")} aria-label="إعدادات خيارات الشحن" title="إعدادات خيارات الشحن"><Settings size={17} aria-hidden="true" /></button><button type="button" className={styles.primary} disabled={props.disabled || !props.canEdit} onClick={() => navigateShipping("create")}><Plus size={17} aria-hidden="true" />أضف خيار شحن</button></div></div>
    <form className={local.filters} onSubmit={event => { event.preventDefault(); navigateQuery({ ...query, ...filters, page: 1 }); }}><div className={local.filterFields}><label className={local.field}>الاسم<input list="shipping-option-names" value={filters.query} maxLength={160} onChange={event => setFilters({ ...filters, query: event.target.value })} /><datalist id="shipping-option-names">{props.context.optionNames.map(option => <option key={option.id} value={option.name} />)}</datalist></label><label className={local.field}>الحالة<select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value as ShippingListQuery["status"] })}><option value="all">الكل</option><option value="inactive">غير نشط</option><option value="active">نشط</option></select></label></div><div className={local.filterActions}><button type="submit" className={styles.primary}>بحث</button><button type="button" className={styles.secondary} onClick={() => { setFilters({ query: "", status: "all" }); navigateQuery(defaultShippingQuery); }}>إعادة تعيين</button></div></form>
    {!current && <p role="status">جار تحميل خيارات الشحن</p>}{current?.error && <div className={styles.error} role="alert"><p>{current.error}</p><button type="button" className={styles.secondary} onClick={props.onReload}>إعادة المحاولة</button></div>}
    {data && <div className={local.tableWrap}><table className={local.table}><thead><tr>{(["name", "fee", "active"] as const).map((field, index) => <th key={field} aria-sort={query.sort === field ? query.direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" onClick={() => sort(field)}>{["الاسم", "الرسوم", "الحالة"][index]}<ArrowDownUp size={13} aria-hidden="true" /></button></th>)}<th aria-label="الإجراءات" /></tr></thead><tbody>{data.items.map(option => <tr key={option.id}><td><button type="button" className={local.link} onClick={() => navigateShipping("detail", option.id)}>{option.name}</button></td><td>{money(option.fee)} ر س</td><td><Status active={option.active} /></td><td><details className={local.menu}><summary aria-label={`خيارات ${option.name}`}><MoreHorizontal size={20} aria-hidden="true" /></summary><div><button type="button" onClick={() => navigateShipping("detail", option.id)}>عرض</button><button type="button" disabled={!props.canEdit || props.disabled} onClick={() => navigateShipping("edit", option.id)}>تعديل</button><DeleteOption slug={props.slug} option={option} disabled={!props.canEdit || props.disabled} onDeleted={props.onReload} /></div></details></td></tr>)}{data.items.length === 0 && <tr><td colSpan={4} className={local.empty}>لا توجد خيارات شحن تطابق البحث</td></tr>}</tbody></table></div>}
  </section>;
}

function Status({ active }: { active: boolean }) { return <span className={active ? local.active : local.inactive}>{active ? "نشط" : "غير نشط"}</span>; }

function ShippingOptionView(props: ManagerProps & { id: string; edit: boolean }) {
  const [result, setResult] = useState<{ data?: ShippingOption; error?: string } | null>(null);
  useEffect(() => { let active = true; getFinanceShippingOption(props.slug, props.id).then(response => { if (active) setResult(response.ok ? { data: response.data } : { error: response.message }); }).catch(() => { if (active) setResult({ error: "تعذر تحميل خيار الشحن" }); }); return () => { active = false; }; }, [props.slug, props.id]);
  if (!result?.data) return <section className={local.page} dir="rtl"><header className={local.top}><h2>خيار الشحن</h2><button type="button" className={styles.secondary} onClick={() => navigateShipping("list")}>خيارات الشحن</button></header>{result?.error ? <div className={styles.error} role="alert"><p>{result.error}</p><button type="button" className={styles.secondary} onClick={props.onReload}>إعادة المحاولة</button></div> : <p role="status">جار تحميل خيار الشحن</p>}</section>;
  if (props.edit) return <ShippingEditor {...props} initial={result.data} />;
  return <ShippingDetail {...props} option={result.data} />;
}

const emptyOption: ShippingOptionInput = { name: "", active: true, fee: 0, taxRate: null, displayOrder: 0, accountId: null, description: "" };
function ShippingEditor({ slug, canEdit, disabled, context, onReload, initial }: ManagerProps & { initial?: ShippingOption }) {
  const [id] = useState(() => initial?.id ?? crypto.randomUUID()), [draft, setDraft] = useState<ShippingOptionInput>(initial ? shippingOptionInputSchema.parse({ name: initial.name, active: initial.active, fee: initial.fee, taxRate: initial.taxRate, displayOrder: initial.displayOrder, accountId: initial.accountId, description: initial.description }) : emptyOption);
  const [fee, setFee] = useState(String(initial?.fee ?? 0)), [order, setOrder] = useState(String(initial?.displayOrder ?? 0)), [tried, setTried] = useState(false);
  const mutation = useMutation(), blocked = disabled || !canEdit || mutation.pending;
  const validation = shippingOptionInputSchema.safeParse({ ...draft, fee: fee.trim() ? Number(fee) : NaN, displayOrder: order.trim() ? Number(order) : NaN });
  const dirty = JSON.stringify({ ...draft, fee, displayOrder: order }) !== JSON.stringify({ ...(initial ? { name: initial.name, active: initial.active, fee: initial.fee, taxRate: initial.taxRate, displayOrder: initial.displayOrder, accountId: initial.accountId, description: initial.description } : emptyOption), fee: String(initial?.fee ?? 0), displayOrder: String(initial?.displayOrder ?? 0) });
  const cancel = () => { if (!mutation.pending && (!dirty || window.confirm("توجد تعديلات غير محفوظة هل تريد إلغاءها؟"))) navigateShipping(initial ? "detail" : "list", initial?.id); };
  const invalid = (field: string) => tried && !validation.success && validation.error.issues.some(issue => issue.path[0] === field);
  return <section className={local.page} dir="rtl"><form noValidate onSubmit={event => { event.preventDefault(); if (blocked) return; setTried(true); if (!validation.success) { mutation.setError(validation.error.issues[0]?.message ?? "راجع بيانات خيار الشحن"); return; } void mutation.run(() => saveFinanceShippingOption(slug, id, validation.data, initial?.revision ?? 0)).then(result => { if (result) { navigateShipping("detail", result.id, true); onReload(); } }); }}>
    <header className={local.top}><h2>{initial ? "تعديل خيار الشحن" : "إضافة خيار شحن"}</h2><div className={local.actions}><button type="submit" className={styles.primary} disabled={blocked || Boolean(initial && !dirty)}><Save size={16} aria-hidden="true" />{mutation.pending ? "جار الحفظ" : "حفظ"}</button><button type="button" className={styles.secondary} disabled={mutation.pending} onClick={cancel}>إلغاء</button></div></header>
    <MutationError error={mutation.error} pending={mutation.pending} onReload={onReload} />
    <div className={`${local.panel} ${local.editor}`}><div className={local.twoColumns}>
      <label className={local.field}>الاسم <span aria-hidden="true">*</span><input value={draft.name} maxLength={160} required disabled={blocked} aria-invalid={invalid("name")} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className={local.field}>الحالة<select value={draft.active ? "active" : "inactive"} disabled={blocked} onChange={event => setDraft({ ...draft, active: event.target.value === "active" })}><option value="active">نشط</option><option value="inactive">غير نشط</option></select></label>
      <label className={local.field}>الضريبة<select value={draft.taxRate ?? ""} disabled={blocked} onChange={event => setDraft({ ...draft, taxRate: event.target.value ? 15 : null })}><option value="">بدون ضريبة</option><option value="15">القيمة المضافة ١٥٪</option></select></label>
      <label className={local.field}>رسوم الشحن<input value={fee} inputMode="decimal" maxLength={12} required disabled={blocked} aria-invalid={invalid("fee")} onChange={event => setFee(event.target.value)} /></label>
      <label className={local.field}>ترتيب العرض<input value={order} inputMode="numeric" maxLength={6} disabled={blocked} aria-invalid={invalid("displayOrder")} onChange={event => setOrder(event.target.value)} /></label>
      <label className={local.field}>الحساب<select value={draft.accountId ?? ""} disabled={blocked} onChange={event => setDraft({ ...draft, accountId: event.target.value || null })}><option value="">افتراضي</option>{context.accounts.map(account => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}{draft.accountId && !context.accounts.some(account => account.id === draft.accountId) && <option value={draft.accountId} disabled>الحساب المحفوظ غير متاح</option>}</select></label>
      <label className={local.field}>الوصف<textarea rows={5} maxLength={1000} value={draft.description} disabled={blocked} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
    </div></div>
  </form></section>;
}

function DeleteOption({ slug, option, disabled, onDeleted }: { slug: string; option: ShippingOption; disabled: boolean; onDeleted: () => void }) {
  const [open, setOpen] = useState(false), mutation = useMutation();
  return <><button type="button" disabled={disabled || mutation.pending} onClick={() => { mutation.setError(""); setOpen(true); }}><Trash2 size={15} aria-hidden="true" />حذف</button><Modal open={open} title="حذف خيار الشحن" onClose={() => { if (!mutation.pending) setOpen(false); }} panelClassName={local.dialog}><p>هل تريد حذف خيار الشحن «{option.name}»؟</p>{mutation.error && <p role="alert" className={styles.error}>{mutation.error}</p>}<div className={local.actions}><button type="button" className={styles.danger} disabled={disabled || mutation.pending} onClick={() => { void mutation.run(() => deleteFinanceShippingOption(slug, option.id, option.revision)).then(result => { if (result) { setOpen(false); onDeleted(); } }); }}>{mutation.pending ? "جار الحذف" : "حذف"}</button><button type="button" className={styles.secondary} disabled={mutation.pending} onClick={() => setOpen(false)}>إلغاء</button></div></Modal></>;
}

function ShippingDetail(props: ManagerProps & { option: ShippingOption }) {
  const params = useSearchParams(), activity = params.get("shippingTab") === "activity";
  const currentIndex = props.context.optionNames.findIndex(option => option.id === props.option.id);
  const previous = currentIndex > 0 ? props.context.optionNames[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex + 1 < props.context.optionNames.length ? props.context.optionNames[currentIndex + 1] : null;
  const tab = (value: string) => { const url = new URL(window.location.href); if (value === "activity") url.searchParams.set("shippingTab", value); else url.searchParams.delete("shippingTab"); window.history.pushState(null, "", `${url.pathname}${url.search}`); };
  return <section className={local.page} dir="rtl"><header className={local.top}><div className={local.title}><h2>{props.option.name}</h2><Status active={props.option.active} /></div><nav className={local.pagination} aria-label="التنقل بين خيارات الشحن"><button type="button" disabled={!previous} title={previous?.name} aria-label="خيار الشحن السابق" onClick={() => { if (previous) navigateShipping("detail", previous.id); }}><ChevronRight size={16} aria-hidden="true" /></button><button type="button" disabled={!next} title={next?.name} aria-label="خيار الشحن التالي" onClick={() => { if (next) navigateShipping("detail", next.id); }}><ChevronLeft size={16} aria-hidden="true" /></button></nav><button type="button" className={styles.secondary} onClick={() => navigateShipping("list")}><ArrowRight size={16} aria-hidden="true" />خيارات الشحن</button></header><div className={`${local.panel} ${local.detail}`}><div className={local.detailToolbar}><button type="button" disabled={!props.canEdit || props.disabled} onClick={() => navigateShipping("edit", props.option.id)}><Pencil size={15} aria-hidden="true" />تعديل</button><DeleteOption slug={props.slug} option={props.option} disabled={!props.canEdit || props.disabled} onDeleted={() => { navigateShipping("list", undefined, true); props.onReload(); }} /></div><div className={local.tabs} role="tablist" aria-label="بيانات خيار الشحن"><button type="button" role="tab" aria-selected={!activity} onClick={() => tab("details")}>التفاصيل</button><button type="button" role="tab" aria-selected={activity} onClick={() => tab("activity")}>سجل النشاطات</button></div>{activity ? <FinanceShippingActivity slug={props.slug} id={props.option.id} name={props.option.name} context={props.context} disabled={props.disabled} onView={() => tab("details")} /> : <div className={local.detailBody} role="tabpanel"><h3>معلومات خيار الشحن</h3><dl><div><dt>الاسم</dt><dd>{props.option.name}</dd></div><div><dt>الحالة</dt><dd><Status active={props.option.active} /></dd></div><div><dt>رسوم الشحن</dt><dd>{money(props.option.fee)} ر س</dd></div><div><dt>ترتيب العرض</dt><dd>{props.option.displayOrder}</dd></div><div><dt>الوصف</dt><dd className={local.description}>{props.option.description || "غير مسجل"}</dd></div></dl></div>}</div></section>;
}
