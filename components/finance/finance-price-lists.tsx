"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Copy, Download, FileText, History, Plus, RefreshCw, Save, Search, Settings, Trash2, Upload } from "lucide-react";
import { getFinanceInvoiceSettings, saveFinanceInvoiceSettings } from "@/app/actions/finance-invoice-settings";
import { Modal } from "@/components/dashboard/ui/modal";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { InvoiceSettingsState, AdvancedInvoiceSettings } from "@/lib/finance/invoice-settings";
import { mergeImportedPrices, parsePriceListCsv, priceListAmount, type ImportedPrice, type PriceListCatalogItem } from "@/lib/finance/price-list-csv";
import { useInventorySalesCatalog } from "./use-inventory-sales-catalog";
import type { InvoiceCatalogProduct } from "@/lib/finance/inventory-sales";
import { FinancePriceListActivity } from "./finance-price-list-activity";
import { downloadFinanceCsv, Field } from "./finance-ui";
import styles from "./finance.module.css";
import css from "./finance-credit-notes.module.css";
import local from "./finance-price-lists.module.css";

type PriceList = AdvancedInvoiceSettings["priceLists"][number];
type Props = { slug: string; snapshot: FinanceSnapshot; canEdit: boolean; disabled: boolean; onBack: () => void };
type ListDraft = { id: string; name: string; active: boolean };
const priceText = (value: number) => new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 6 }).format(value);

export function navigatePriceLists(view: "list" | "create" | "detail" | "edit" = "list", id?: string, replace = false) {
  const url = new URL(window.location.href);
  url.searchParams.set("section", "sales"); url.searchParams.set("view", "sales-settings"); url.searchParams.set("settings", "price-lists");
  if (id) url.searchParams.set("priceList", id); else url.searchParams.delete("priceList");
  if (view === "list") url.searchParams.delete("priceListView"); else url.searchParams.set("priceListView", view);
  window.history[replace ? "replaceState" : "pushState"](null, "", `${url.pathname}${url.search}`);
}

export function FinancePriceLists(props: Props) {
  const inventoryCatalog = useInventorySalesCatalog(props.slug);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; data?: InvoiceSettingsState; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    getFinanceInvoiceSettings(props.slug).then(response => {
      if (active) setResult({ attempt, ...(response.ok ? { data: response.data } : { error: response.message }) });
    }).catch(() => { if (active) setResult({ attempt, error: "تعذر تحميل قوائم الأسعار أعد المحاولة" }); });
    return () => { active = false; };
  }, [props.slug, attempt]);
  const current = result?.attempt === attempt ? result : null;
  if (!current?.data) return <section className={css.page} dir="rtl"><div className={css.bar}><h2>قوائم الأسعار</h2><button type="button" className={styles.secondary} onClick={props.onBack}><ArrowRight size={16} aria-hidden="true" />إعدادات المبيعات</button></div>{!current ? <p role="status">جار تحميل قوائم الأسعار</p> : <div role="alert" className={styles.error}><p>{current.error}</p><button type="button" className={styles.secondary} onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div>}</section>;
  return <>{inventoryCatalog.error && <div role="alert"><p>{inventoryCatalog.error}</p><button type="button" onClick={inventoryCatalog.retry}>إعادة المحاولة</button></div>}<PriceListsManager key={`${props.slug}:${attempt}`} {...props} snapshot={{...props.snapshot, products:[...props.snapshot.products,...inventoryCatalog.products]}} initial={current.data} onReload={() => setAttempt(value => value + 1)} /></>;
}

function InlinePrice({ price, name, blocked, onSave }: { price: number; name: string; blocked: boolean; onSave: (value: number) => Promise<boolean> }) {
  const [value, setValue] = useState(String(price));
  const amount = priceListAmount(value);
  return <form className={local.inlinePrice} onSubmit={event => { event.preventDefault(); if (!blocked && amount !== null && amount !== price) void onSave(amount); }}><input aria-label={`سعر الوحدة للبند ${name}`} inputMode="decimal" required maxLength={24} value={value} disabled={blocked} onChange={event => setValue(event.target.value)} aria-invalid={amount === null} /><button type="submit" className={styles.secondary} disabled={blocked || amount === null || amount === price} aria-label={`حفظ سعر ${name}`} title="حفظ سعر الوحدة"><Save size={15} aria-hidden="true" /></button>{amount === null && <small role="status">أدخل سعرًا صالحًا حتى ٦ منازل عشرية</small>}</form>;
}

function PriceListsManager({ slug, snapshot, canEdit, disabled, onBack, initial, onReload }: Props & { initial: InvoiceSettingsState; onReload: () => void }) {
  const [saved, setSaved] = useState(initial), savedRef = useRef(initial);
  const params = useSearchParams();
  const selectedId = params.get("priceList") ?? "";
  const requestedView = params.get("priceListView");
  const view = requestedView === "create" ? "create" : selectedId ? requestedView === "edit" ? "edit" : "detail" : "list";
  const lists = saved.settings.advanced.priceLists;
  const selected = lists.find(list => list.id === selectedId);
  const routeKey = `${view}:${selectedId}`;
  const [draftRoute, setDraftRoute] = useState(routeKey);
  const [draft, setDraft] = useState<ListDraft>(() => selected ? { id: selected.id, name: selected.name, active: selected.active } : { id: crypto.randomUUID(), name: "", active: true });
  const [pending, setPending] = useState(false), lock = useRef(false), mounted = useRef(true);
  const pendingUrl = useRef("");
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [modal, setModal] = useState<"item" | "import" | "delete" | "activity" | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<string | null>(null);
  const [productId, setProductId] = useState(""), [itemPrice, setItemPrice] = useState("");
  const [filterDraft, setFilterDraft] = useState({ query: "", category: "" }), [filters, setFilters] = useState({ query: "", category: "" });
  const [listQuery, setListQuery] = useState(""), [listStatus, setListStatus] = useState("");
  const [importText, setImportText] = useState(""), [importRows, setImportRows] = useState<ImportedPrice[] | null>(null), [importTarget, setImportTarget] = useState<string | undefined>();
  const [reading, setReading] = useState(false), fileRead = useRef(0);
  const [pdfPending, setPdfPending] = useState(false), pdfLock = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const guardPendingNavigation = (event: PopStateEvent) => {
      if (!lock.current || !pendingUrl.current) return;
      event.stopImmediatePropagation();
      window.history.pushState(null, "", pendingUrl.current);
    };
    window.addEventListener("popstate", guardPendingNavigation, true);
    return () => window.removeEventListener("popstate", guardPendingNavigation, true);
  }, []);
  if (draftRoute !== routeKey) {
    setDraftRoute(routeKey);
    setDraft(selected ? { id: selected.id, name: selected.name, active: selected.active } : { id: crypto.randomUUID(), name: "", active: true });
    setModal(null);
    setFilters({ query: "", category: "" }); setFilterDraft({ query: "", category: "" });
  }
  const blocked = disabled || pending || reading || !canEdit;
  const catalog: PriceListCatalogItem[] = snapshot.products.map(product => ({ id: product.id, name: (product as InvoiceCatalogProduct).catalogSource === "inventory" ? `${product.name} (${(product as InvoiceCatalogProduct).unitName})` : product.name, category: product.category, sku: (product as InvoiceCatalogProduct).sku ?? snapshot.items.find(item => item.id === product.itemId || item.menu_product_id === product.id)?.sku ?? "" }));
  const catalogById = new Map(catalog.map(product => [product.id, product]));
  const draftDirty = (view === "create" && !!draft.name) || (view === "edit" && !!selected && (selected.name !== draft.name || selected.active !== draft.active)) || (modal === "item" && (!!productId || !!itemPrice)) || (modal === "import" && !!importText);
  useEffect(() => {
    if (!draftDirty && !pending) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [draftDirty, pending]);
  async function persist(transform: (current: PriceList[]) => PriceList[], success: string): Promise<boolean> {
    if (lock.current || disabled || !canEdit) return false;
    lock.current = true; pendingUrl.current = window.location.href; setPending(true); setError(""); setMessage("");
    try {
      const current = savedRef.current;
      const priceLists = transform(current.settings.advanced.priceLists).map(list => ({...list, prices:list.prices.map(row => ({...row, ...((snapshot.products as InvoiceCatalogProduct[]).find(product => product.id === row.productId)?.catalogSource === "inventory" ? {catalogSource: "inventory" as const} : {})}))}));
      if (priceLists.length > 30 || new Set(priceLists.map(list => list.id)).size !== priceLists.length) throw new Error("الحد الأقصى ٣٠ قائمة أسعار دون تكرار");
      for (const list of priceLists) {
        if (!list.name.trim() || list.name.length > 80 || list.prices.length > 500 || new Set(list.prices.map(row => row.productId)).size !== list.prices.length || list.prices.some(row => !Number.isFinite(row.price) || row.price < 0 || row.price > 1_000_000_000)) throw new Error("راجع اسم القائمة وأسعار بنودها والحد الأقصى ٥٠٠ بند دون تكرار");
      }
      const response = await saveFinanceInvoiceSettings(slug, { ...current.settings, advanced: { ...current.settings.advanced, priceLists } }, current.revision);
      if (!mounted.current) return false;
      if (!response.ok) { setError(response.message); return false; }
      savedRef.current = response.data; setSaved(response.data); setMessage(success); return true;
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : "تعذر تأكيد الحفظ أعد تحميل البيانات قبل المحاولة مجددًا");
      return false;
    } finally { lock.current = false; if (mounted.current) setPending(false); }
  }
  function updateList(id: string, update: (list: PriceList) => PriceList, success: string) {
    return persist(current => {
      if (!current.some(list => list.id === id)) throw new Error("قائمة الأسعار لم تعد متاحة أعد تحميل البيانات");
      return current.map(list => list.id === id ? update(list) : list);
    }, success);
  }
  function openList(list: PriceList) {
    if (lock.current) return;
    navigatePriceLists("detail", list.id); setFilters({ query: "", category: "" }); setFilterDraft({ query: "", category: "" }); setError(""); setMessage("");
  }
  function openForm(list?: PriceList) {
    if (blocked) return;
    navigatePriceLists(list ? "edit" : "create", list?.id); setError(""); setMessage("");
  }
  async function saveList() {
    if (blocked || !draft.name.trim()) return;
    const name = draft.name.trim();
    const ok = await persist(current => {
      if (current.some(list => list.id !== draft.id && list.name.trim().toLocaleLowerCase("ar") === name.toLocaleLowerCase("ar"))) throw new Error("يوجد اسم قائمة مطابق اختر اسمًا مختلفًا");
      if (view === "edit") {
        if (!current.some(list => list.id === draft.id)) throw new Error("القائمة لم تعد متاحة أعد تحميل البيانات");
        return current.map(list => list.id === draft.id ? { ...list, name, active: draft.active } : list);
      }
      if (current.some(list => list.id === draft.id)) throw new Error("القائمة موجودة بالفعل أعد تحميل البيانات");
      return [...current, { ...draft, name, prices: [], partyIds: [] }];
    }, view === "edit" ? "تم حفظ قائمة الأسعار" : "تم إنشاء قائمة الأسعار");
    if (ok) { navigatePriceLists("detail", draft.id, true); setFilters({ query: "", category: "" }); setFilterDraft({ query: "", category: "" }); }
  }
  async function copyList() {
    if (!selected || blocked) return;
    const id = crypto.randomUUID();
    const ok = await persist(current => {
      const source = current.find(list => list.id === selectedId);
      if (!source) throw new Error("القائمة لم تعد متاحة أعد تحميل البيانات");
      let index = 1, name = `${source.name.slice(0, 66)} — نسخة ${index}`;
      while (current.some(list => list.name === name)) name = `${source.name.slice(0, 66)} — نسخة ${++index}`;
      return [...current, { ...source, id, name, prices: source.prices.map(row => ({ ...row })), partyIds: [...source.partyIds] }];
    }, "تم نسخ قائمة الأسعار");
    if (ok) navigatePriceLists("detail", id);
  }
  function closeModal() { if (!lock.current && !reading) { fileRead.current++; setModal(null); setError(""); } }
  function openItem() { if (!blocked) { setProductId(""); setItemPrice(""); setError(""); setMessage(""); setModal("item"); } }
  async function addItem() {
    const amount = priceListAmount(itemPrice);
    if (!selected || blocked || amount === null || !catalogById.has(productId)) return;
    const ok = await updateList(selected.id, list => {
      if (list.prices.some(row => row.productId === productId)) throw new Error("البند موجود في القائمة عدّل سعره من الجدول");
      return { ...list, prices: [...list.prices, { productId, price: amount }] };
    }, "تم حفظ البند يمكنك إضافة بند آخر");
    if (ok) { setProductId(""); setItemPrice(""); }
  }
  async function confirmDelete() {
    if (!selected || blocked) return;
    const ok = deleteProduct ? await updateList(selected.id, list => ({ ...list, prices: list.prices.filter(row => row.productId !== deleteProduct) }), "تم حذف البند من قائمة الأسعار") : await persist(current => current.filter(list => list.id !== selected.id), "تم حذف قائمة الأسعار");
    if (ok) { setModal(null); if (!deleteProduct) navigatePriceLists("list", undefined, true); }
  }
  function exportLists(values: PriceList[], template = false) {
    const rows: (string | number)[][] = [["list_id", "list_name", "product_id", "sku", "name", "category", "price"]];
    for (const list of values) {
      const prices = template ? catalog.slice(0, 500).map(item => ({ productId: item.id, price: list.prices.find(row => row.productId === item.id)?.price ?? snapshot.products.find(product => product.id === item.id)!.price })) : list.prices;
      for (const row of prices) { const item = catalogById.get(row.productId); rows.push([list.id, list.name, row.productId, item?.sku ?? "", item?.name ?? "صنف غير متاح", item?.category ?? "", row.price]); }
    }
    downloadFinanceCsv(template ? "branda-price-list-template.csv" : "branda-price-lists.csv", rows);
  }
  function openImport(target?: string) {
    if (blocked) return;
    setImportTarget(target); setImportText(""); setImportRows(null); setError(""); setMessage(""); setModal("import");
  }
  async function readFile(file?: File) {
    if (!file || blocked || lock.current) return;
    const sequence = ++fileRead.current;
    setReading(true); setError(""); setImportRows(null); setImportText("");
    try {
      if (file.size > 5_000_000) throw new Error("اختر ملفًا لا يتجاوز ٥ ميجابايت");
      const text = await file.text();
      if (!mounted.current || sequence !== fileRead.current) return;
      const rows = parsePriceListCsv(text, catalog, lists.map(list => list.id), importTarget);
      mergeImportedPrices(lists, rows);
      setImportText(text); setImportRows(rows);
    } catch (failure) { if (mounted.current && sequence === fileRead.current) setError(failure instanceof Error ? failure.message : "تعذر قراءة الملف"); }
    finally { if (mounted.current && sequence === fileRead.current) setReading(false); }
  }
  async function applyImport() {
    if (blocked || !importRows?.length) return;
    const ok = await persist(current => mergeImportedPrices(current, parsePriceListCsv(importText, catalog, current.map(list => list.id), importTarget)), "تم حفظ الأسعار المستوردة");
    if (ok) { setImportRows(null); setImportText(""); setModal(null); }
  }
  async function downloadPdf() {
    if (!selected || pdfLock.current) return;
    pdfLock.current = true; setPdfPending(true); setError("");
    try {
      const { createFinancePriceListPdf } = await import("@/lib/export/finance-price-list-pdf");
      const blob = await createFinancePriceListPdf({ brand: snapshot.cafe.name, name: selected.name, active: selected.active, rows: selected.prices.map(row => { const item = catalogById.get(row.productId); return { code: item?.sku || "غير مسجل", name: item?.name ?? "صنف غير متاح", category: item?.category ?? "", price: row.price }; }) });
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = "branda-price-list.pdf"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { if (mounted.current) setError("تعذر تجهيز ملف قائمة الأسعار أعد المحاولة"); }
    finally { pdfLock.current = false; if (mounted.current) setPdfPending(false); }
  }
  const feedback = <>{error && <div className={styles.error} role="alert"><p>{error}</p><button type="button" className={styles.secondary} disabled={pending || reading} onClick={onReload}>إعادة التحميل وتجاهل التغييرات غير المحفوظة</button></div>}{message && <p className={styles.success} role="status">{message}</p>}</>;
  const shownLists = lists.filter(list => (!listStatus || String(list.active) === listStatus) && list.name.toLocaleLowerCase("ar").includes(listQuery.trim().toLocaleLowerCase("ar")));
  const rows = selected?.prices.filter(row => { const product = catalogById.get(row.productId); return (!filters.category || product?.category === filters.category) && (!filters.query.trim() || `${product?.name ?? ""} ${product?.sku ?? ""} ${row.productId}`.toLocaleLowerCase("ar").includes(filters.query.trim().toLocaleLowerCase("ar"))); }) ?? [];
  const categories = [...new Set(selected?.prices.map(row => catalogById.get(row.productId)?.category).filter((category): category is string => !!category))];
  return <section className={`${css.page} ${local.page}`} dir="rtl" aria-label="قوائم الأسعار" aria-busy={pending}>
    <header className={local.header}><div className={local.title}><h2>{view === "create" ? "أضف قائمة أسعار" : view === "edit" ? "تعديل قائمة الأسعار" : selected && view === "detail" ? selected.name : "قوائم الأسعار"}</h2>{selected && view === "detail" && <><span className={css.badge} data-status={selected.active ? "issued" : undefined}>{selected.active ? "نشط" : "غير نشط"}</span><button type="button" className={styles.secondary} disabled={blocked} onClick={() => openForm(selected)} title="تعديل الاسم والحالة" aria-label="تعديل اسم قائمة الأسعار وحالتها"><Settings size={16} aria-hidden="true" /></button></>}</div><button type="button" className={styles.secondary} disabled={pending || reading} onClick={() => { if (view === "list") onBack(); else if (view === "edit") navigatePriceLists("detail", selectedId, true); else navigatePriceLists(); }}><ArrowRight size={16} aria-hidden="true" />{view === "list" ? "إعدادات المبيعات" : view === "create" || view === "edit" ? "إلغاء" : "قوائم الأسعار"}</button></header>
    {!saved.settings.advanced.priceListsEnabled && <p className={css.hint}>اختيار قوائم الأسعار في الفواتير غير مفعّل يمكنك إدارتها هنا وتفعيل استخدامها من إعدادات الفواتير</p>}
    {!canEdit && <p className={css.hint}>يمكنك عرض قوائم الأسعار وتصديرها تعديلها متاح للحساب المصرح له</p>}
    {!modal && feedback}
    {(view === "create" || view === "edit") ? <form className={`${css.panel} ${local.editor}`} onSubmit={event => { event.preventDefault(); void saveList(); }}><div className={css.toolbar}><button type="submit" className={styles.primary} disabled={blocked || !draft.name.trim()}><Save size={16} aria-hidden="true" />{pending ? "جار الحفظ" : "حفظ"}</button><button type="button" className={styles.secondary} disabled={pending} onClick={() => navigatePriceLists(view === "edit" ? "detail" : "list", view === "edit" ? selectedId : undefined, true)}>إلغاء</button></div><div className={css.fields}><Field label="الاسم *"><input required maxLength={80} value={draft.name} disabled={blocked} onChange={event => setDraft({ ...draft, name: event.target.value })} /></Field><Field label="الحالة"><select value={String(draft.active)} disabled={blocked} onChange={event => setDraft({ ...draft, active: event.target.value === "true" })}><option value="true">نشط</option><option value="false">غير نشط</option></select></Field></div></form> : view === "list" ? <>
      <div className={css.bar}><div className={css.actions}><button type="button" className={styles.secondary} disabled={blocked || !lists.length} onClick={() => openImport()}><RefreshCw size={16} aria-hidden="true" />تحديث جماعي</button><button type="button" className={styles.secondary} disabled={blocked || !lists.length} onClick={() => openImport()}><Upload size={16} aria-hidden="true" />استيراد</button><button type="button" className={styles.secondary} disabled={!lists.some(list => list.prices.length)} onClick={() => exportLists(lists)}><Download size={16} aria-hidden="true" />تصدير</button></div><button type="button" className={styles.primary} disabled={blocked || lists.length >= 30} onClick={() => openForm()}><Plus size={16} aria-hidden="true" />أضف قائمة أسعار</button></div>
      <section className={css.panel}><div className={css.fields}><Field label="اسم القائمة"><input value={listQuery} onChange={event => setListQuery(event.target.value)} /></Field><Field label="الحالة"><select value={listStatus} onChange={event => setListStatus(event.target.value)}><option value="">الكل</option><option value="true">نشط</option><option value="false">غير نشط</option></select></Field></div>{!shownLists.length ? <div className={css.empty}><strong>{lists.length ? "لا توجد قوائم تطابق البحث" : "لم تضف قوائم أسعار بعد"}</strong><p>{lists.length ? "غيّر الاسم أو الحالة لعرض القوائم" : "أنشئ قائمة ثم أضف الأصناف وأسعار الوحدة"}</p></div> : <div className={css.tableWrap}><table className={css.table}><thead><tr><th scope="col">الاسم</th><th scope="col">الحالة</th><th scope="col">عدد البنود</th><th scope="col">الإجراءات</th></tr></thead><tbody>{shownLists.map(list => <tr key={list.id}><td><button type="button" className={css.number} disabled={pending} onClick={() => openList(list)}>{list.name}</button></td><td><span className={css.badge} data-status={list.active ? "issued" : undefined}>{list.active ? "نشط" : "غير نشط"}</span></td><td>{list.prices.length}</td><td><button type="button" className={styles.secondary} disabled={pending} onClick={() => openList(list)}>عرض</button></td></tr>)}</tbody></table></div>}<p className={css.hint}>{lists.length} من ٣٠ قائمة أسعار</p></section>
    </> : selected ? <section className={`${css.panel} ${local.panel}`}>
      <div className={local.toolbar}><button type="button" className={styles.primary} disabled={blocked || selected.prices.length >= 500} onClick={openItem}><Plus size={16} aria-hidden="true" />إضافة عنصر</button><button type="button" className={styles.secondary} disabled={blocked} onClick={() => openImport(selected.id)}><Upload size={16} aria-hidden="true" />استيراد</button><button type="button" className={styles.secondary} disabled={!selected.prices.length} onClick={() => exportLists([selected])}><Download size={16} aria-hidden="true" />تصدير</button><button type="button" className={styles.secondary} disabled={blocked || lists.length >= 30} onClick={() => void copyList()}><Copy size={16} aria-hidden="true" />نسخ</button><button type="button" className={styles.secondary} disabled={pdfPending} onClick={() => void downloadPdf()}><FileText size={16} aria-hidden="true" />{pdfPending ? "جار التجهيز" : "PDF"}</button><button type="button" className={styles.danger} disabled={blocked} onClick={() => { setDeleteProduct(null); setError(""); setModal("delete"); }}><Trash2 size={16} aria-hidden="true" />حذف</button><button type="button" className={styles.secondary} disabled={blocked} onClick={() => void updateList(selected.id, list => ({ ...list, active: !list.active }), selected.active ? "تم تعطيل القائمة" : "تم تفعيل القائمة")}>{selected.active ? "تعطيل" : "تفعيل"}</button><button type="button" className={styles.secondary} onClick={() => setModal("activity")}><History size={16} aria-hidden="true" />سجل النشاطات</button></div>
      <div className={css.panelHead}><h3>العناصر</h3><span>{rows.length ? 1 : 0}–{rows.length} من {selected.prices.length}</span></div><form onSubmit={event => { event.preventDefault(); setFilters(filterDraft); }}><div className={`${css.fields} ${local.filters}`}><Field label="منتج"><input placeholder="اسم المنتج أو كوده أو معرفه" value={filterDraft.query} onChange={event => setFilterDraft({ ...filterDraft, query: event.target.value })} /></Field><Field label="تصنيف"><select value={filterDraft.category} onChange={event => setFilterDraft({ ...filterDraft, category: event.target.value })}><option value="">الكل</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select></Field><Field label="ماركة" hint="الماركة غير مسجلة في بيانات المنتجات الحالية"><select disabled value=""><option value="">غير مسجل</option></select></Field></div><div className={`${css.footer} ${local.filterActions}`}><div className={css.actions}><button type="submit" className={styles.secondary}><Search size={16} aria-hidden="true" />بحث</button><button type="button" className={styles.secondary} onClick={() => { setFilterDraft({ query: "", category: "" }); setFilters({ query: "", category: "" }); }}>إعادة تعيين</button></div></div></form>
        {!rows.length ? <div className={css.empty}><strong>{selected.prices.length ? "لا توجد بنود تطابق البحث" : "لا توجد عناصر في قائمة الأسعار"}</strong>{!selected.prices.length && <button type="button" className={styles.primary} disabled={blocked} onClick={openItem}>إضافة عنصر</button>}</div> : <div className={css.tableWrap} tabIndex={0} role="region" aria-label="بنود قائمة الأسعار"><table className={css.table}><thead><tr>{["كود", "بند", "ماركة", "تصنيف", "سعر الوحدة", "إجراءات"].map(title => <th scope="col" key={title}>{title}</th>)}</tr></thead><tbody>{rows.map(row => { const product = catalogById.get(row.productId); return <tr key={row.productId}><td><bdi className={local.code}>{product?.sku || "غير مسجل"}</bdi></td><td>{product?.name ?? "صنف غير متاح"}</td><td>غير مسجل</td><td>{product?.category || "غير مسجل"}</td><td>{canEdit ? <InlinePrice key={`${row.productId}:${row.price}`} price={row.price} name={product?.name ?? row.productId} blocked={blocked} onSave={price => updateList(selected.id, list => ({ ...list, prices: list.prices.map(item => item.productId === row.productId ? { ...item, price } : item) }), "تم حفظ سعر الوحدة")} /> : priceText(row.price)}</td><td><button type="button" className={styles.secondary} disabled={blocked} aria-label={`حذف ${product?.name ?? "البند"} من القائمة`} onClick={() => { setDeleteProduct(row.productId); setError(""); setModal("delete"); }}><Trash2 size={16} aria-hidden="true" /></button></td></tr>; })}</tbody></table></div>}
        <p className={css.hint}>أسعار الوحدة بالريال السعودي حفظ القائمة لا يغيّر أسعار الكتالوج أو الفواتير السابقة{selected.partyIds.length > 0 ? ` والقائمة مرتبطة بـ ${selected.partyIds.length} عميل وتبقى هذه الروابط محفوظة` : ""}</p>
      </section>
    : <p role="alert">القائمة غير متاحة أعد تحميل البيانات</p>}
    <Modal open={modal !== null} title={modal === "item" ? "إضافة عنصر" : modal === "import" ? "استيراد أسعار البنود" : modal === "activity" ? "سجل النشاطات" : deleteProduct ? "حذف البند" : "حذف قائمة الأسعار"} onClose={closeModal} panelClassName={local.dialog}>
      <div className={local.modalBody}>{feedback}
      {modal === "import" && catalog.length > 500 && <p className={css.hint}>قالب التنزيل يشمل أول ٥٠٠ منتج من الكتالوج يمكنك استبدال البنود بمعرفات منتجات أخرى ضمن حد ٥٠٠ بند لكل قائمة</p>}
      {modal === "item" && <form onSubmit={event => { event.preventDefault(); void addItem(); }} className={local.modalForm}><Field label="بند *"><select required aria-invalid={false} value={productId} disabled={blocked} onChange={event => { setProductId(event.target.value); setItemPrice(String(snapshot.products.find(product => product.id === event.target.value)?.price ?? "")); }}><option value="">اختر بندًا</option>{catalog.filter(item => !selected?.prices.some(row => row.productId === item.id)).map(item => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` — ${item.sku}` : ""}</option>)}</select></Field><Field label="سعر الوحدة *" hint="ريال سعودي حتى ٦ منازل عشرية"><input required inputMode="decimal" maxLength={24} disabled={blocked} value={itemPrice} onChange={event => setItemPrice(event.target.value)} aria-invalid={!!itemPrice && priceListAmount(itemPrice) === null} /></Field><div className={css.actions}><button type="submit" className={styles.primary} disabled={blocked || !productId || priceListAmount(itemPrice) === null || (selected?.prices.length ?? 0) >= 500}>حفظ ومتابعة</button><button type="button" className={styles.secondary} disabled={pending} onClick={closeModal}>إلغاء</button></div></form>}
      {modal === "import" && <div className={local.modalForm}><p>اختر ملف أسعار مطابقًا للقالب ثم راجع المعاينة قبل الحفظ البنود الموجودة تُحدّث والجديدة تُضاف دون حذف بقية البنود</p><p className={css.hint}>استخدم معرف المنتج أو كود المخزون المطابق وسعرًا رقميًا دون معادلات أو فواصل آلاف التحديث الجماعي يحتاج معرف القائمة لكل سطر</p><div className={css.actions}><button type="button" className={styles.secondary} disabled={!lists.length} onClick={() => exportLists(importTarget ? lists.filter(list => list.id === importTarget) : lists, true)}>تنزيل قالب من المنتجات الحالية</button></div><Field label="ملف الأسعار CSV"><input type="file" accept=".csv,text/csv" disabled={blocked} onChange={event => { void readFile(event.target.files?.[0]); event.target.value = ""; }} /></Field>{reading && <p role="status">جار قراءة الملف والتحقق من البنود</p>}{importRows && <><p role="status">{importRows.length} بندًا في {new Set(importRows.map(row => row.listId)).size} قائمة جاهزة للحفظ</p><div className={css.tableWrap}><table className={css.table}><thead><tr><th scope="col">القائمة</th><th scope="col">البند</th><th scope="col">السعر الحالي</th><th scope="col">السعر الجديد</th></tr></thead><tbody>{importRows.slice(0, 50).map(row => <tr key={`${row.listId}:${row.productId}`}><td>{lists.find(list => list.id === row.listId)?.name}</td><td>{catalogById.get(row.productId)?.name}</td><td>{(() => { const old = lists.find(list => list.id === row.listId)?.prices.find(item => item.productId === row.productId); return old ? priceText(old.price) : "بند جديد"; })()}</td><td>{priceText(row.price)}</td></tr>)}</tbody></table></div>{importRows.length > 50 && <p className={css.hint}>تعرض المعاينة أول ٥٠ بندًا وسيُحفظ الملف كاملًا بعد التحقق</p>}</>}<div className={css.actions}><button type="button" className={styles.primary} disabled={blocked || !importRows?.length} onClick={() => void applyImport()}>حفظ الأسعار المستوردة</button><button type="button" className={styles.secondary} disabled={pending || reading} onClick={closeModal}>إلغاء</button></div></div>}
      {modal === "delete" && <div className={local.modalForm}><p>{deleteProduct ? "هل تريد حذف هذا البند من قائمة الأسعار؟ يبقى المنتج في الكتالوج" : `هل تريد حذف قائمة «${selected?.name}»؟ لن تتغير الفواتير السابقة ولن تتاح القائمة للفواتير الجديدة`}</p><div className={css.actions}><button type="button" className={styles.danger} disabled={blocked} onClick={() => void confirmDelete()}>تأكيد الحذف</button><button type="button" className={styles.secondary} disabled={pending} onClick={closeModal}>إلغاء</button></div></div>}
      {modal === "activity" && selected && <FinancePriceListActivity key={selected.id} slug={slug} listId={selected.id} catalog={catalog} />}
      </div>
    </Modal>
  </section>;
}
