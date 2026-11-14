"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpDown, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CloudUpload, FileText, MoreHorizontal, PieChart, Plus, RefreshCw, Search, Settings, SlidersHorizontal, Sparkles, X } from "lucide-react";
import type { FinanceDocument, FinanceParty, FinanceStaff, FinanceShift } from "@/lib/finance/brand-finance";
import { downloadFinanceCsv, financeDate, financeDocumentStatus, Numeric } from "./finance-ui";
import styles from "./finance-invoices.module.css";

type Filters = { customer: string; number: string; from: string; to: string; item: string; currency: string; min: string; max: string; payment: string; createdFrom: string; createdTo: string; customerType: string; creator: string; shift: string };
const emptyFilters: Filters = { customer: "", number: "", from: "", to: "", item: "", currency: "", min: "", max: "", payment: "all", createdFrom: "", createdTo: "", customerType: "", creator: "", shift: "" };
const remaining = (document: FinanceDocument) => document.refunded ? 0 : document.outstanding;
const collected = (document: FinanceDocument) => document.refunded ? 0 : Math.max(0, document.total - (document.refunded_total ?? 0) - document.outstanding);
const invoicePaymentStatus = (document: FinanceDocument) => document.sync_status === "queued" || document.sync_status === "conflict"
  ? financeDocumentStatus(document) : remaining(document) > .009 ? collected(document) >= .01 ? "مدفوعة جزئيًا" : "غير مدفوعة" : "مدفوعة";
const paymentStatus = (document: FinanceDocument) => document.refunded || (document.refunded_total ?? 0) > 0 ? financeDocumentStatus(document) : invoicePaymentStatus(document);
const sortOptions = [
  { id: "customer", label: "العميل" },
  { id: "created", label: "تاريخ الإنشاء" },
  { id: "number", label: "رقم" },
  { id: "payment", label: "حالة الدفع" },
  { id: "date", label: "التاريخ" },
] as const;
type InvoiceSort = typeof sortOptions[number]["id"];

export function FinanceInvoices({ documents, parties, staff = [], shifts = [], currentUserId, pending, disabled, hasMore, onRefresh, onLoadMore, onCreate, onReceipt, onSettle, onRefund, onSettings, onReports, onImport }: {
  documents: FinanceDocument[]; parties: FinanceParty[]; pending: boolean; disabled: boolean; hasMore: boolean;
  staff?: FinanceStaff[]; shifts?: FinanceShift[];
  currentUserId?: string;
  onRefresh: () => void; onLoadMore: () => void; onCreate?: () => void; onReceipt: (id: string) => void;
  onSettle?: (document: FinanceDocument) => void; onRefund?: (document: FinanceDocument) => void;
  onSettings?: () => void; onReports?: () => void;
  onImport?: (mode: "sheet" | "ai") => void;
}) {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [advanced, setAdvanced] = useState(false);
  const [sort, setSort] = useState<InvoiceSort>("created");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [sortOpen, setSortOpen] = useState(false);
  const sortMenuId = useId();
  const sortContainer = useRef<HTMLDivElement>(null);
  const sortToggle = useRef<HTMLButtonElement>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const selectionMenuId = useId();
  const selectionContainer = useRef<HTMLDivElement>(null);
  const selectionToggle = useRef<HTMLButtonElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreMenuId = useId();
  const moreContainer = useRef<HTMLDivElement>(null);
  const moreToggle = useRef<HTMLButtonElement>(null);
  const addMenuId = useId();
  const addContainer = useRef<HTMLDivElement>(null);
  const addToggle = useRef<HTMLButtonElement>(null);
  const [rowOpen, setRowOpen] = useState<string | null>(null);
  const rowMenuPrefix = useId();
  const rowContainer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!addOpen && !moreOpen && !sortOpen && !selectionOpen && !rowOpen) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !addContainer.current?.contains(event.target)) setAddOpen(false);
      if (event.target instanceof Node && !moreContainer.current?.contains(event.target)) setMoreOpen(false);
      if (event.target instanceof Node && !sortContainer.current?.contains(event.target)) setSortOpen(false);
      if (event.target instanceof Node && !selectionContainer.current?.contains(event.target)) setSelectionOpen(false);
      if (event.target instanceof Node && !rowContainer.current?.contains(event.target)) setRowOpen(null);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [addOpen, moreOpen, sortOpen, selectionOpen, rowOpen]);
  const partyName = (id: string | null) => parties.find(party => party.id === id)?.name ?? "عميل نقدي";
  const creatorName = (id?: string) => !id ? "غير محدد" : id === currentUserId ? "المستخدم الحالي" : staff.find(member => member.user_id === id)?.name || "مستخدم غير متاح";
  const invoiceDate = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
  const sales = documents.filter(document => document.kind === "sale");
  const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });
  const statusMatch = (document: FinanceDocument, value: string) => value === "all"
    || (value === "due" && remaining(document) > .009)
    || (value === "unpaid" && remaining(document) > .009 && collected(document) < .01)
    || (value === "partial" && remaining(document) > .009 && collected(document) >= .01)
    || (value === "paid" && !document.refunded && remaining(document) <= .009)
    || (value === "returned" && document.refunded)
    || (value === "partially-returned" && !document.refunded && (document.refunded_total ?? 0) > .009);
  const matching = sales.filter(document => {
    const date = dateFormat.format(new Date(document.created_at));
    return (!filters.customer || (filters.customer === "cash" ? !document.party_id : document.party_id === filters.customer))
      && (!filters.number || (document.display_number || String(document.number)).toLocaleLowerCase().includes(filters.number.trim().replace(/^#/, "").toLocaleLowerCase()))
      && (!filters.currency || (document.currency || "SAR") === filters.currency)
      && (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to)
      && (!filters.createdFrom || date >= filters.createdFrom) && (!filters.createdTo || date <= filters.createdTo)
      && (!filters.item.trim() || document.lines.some(line => line.name.toLocaleLowerCase("ar").includes(filters.item.trim().toLocaleLowerCase("ar"))))
      && (filters.min === "" || document.total > Number(filters.min)) && (filters.max === "" || document.total < Number(filters.max))
      && (!filters.customerType || (filters.customerType === "cash" ? !document.party_id : !!document.party_id))
      && (!filters.creator || document.created_by === filters.creator) && (!filters.shift || document.shift_id === filters.shift)
      && statusMatch(document, filters.payment);
  });
  const results = matching.sort((a, b) => {
    const direction = sortDirection === "asc" ? 1 : -1;
    const comparison = sort === "customer" ? partyName(a.party_id).localeCompare(partyName(b.party_id), "ar", { numeric: true })
      : sort === "payment" ? paymentStatus(a).localeCompare(paymentStatus(b), "ar")
      : sort === "number" ? (a.display_number || String(a.number)).localeCompare(b.display_number || String(b.number), "en", { numeric: true })
      : new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return direction * (comparison || a.number - b.number || a.id.localeCompare(b.id));
  });
  const pageCount = Math.ceil(results.length / 20);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const rows = results.slice(currentPage * 20, (currentPage + 1) * 20);
  const exportRows = results.filter(document => selected.length === 0 || selected.includes(document.id));
  const allSelected = rows.length > 0 && rows.every(document => selected.includes(document.id));
  const partiallySelected = !allSelected && rows.some(document => selected.includes(document.id));
  const selectedCount = results.filter(document => selected.includes(document.id)).length;
  function togglePageSelection() {
    setSelected(previous => allSelected ? previous.filter(id => !rows.some(document => document.id === id)) : [...new Set([...previous, ...rows.map(document => document.id)])]);
  }
  function chooseSelection(scope: "none" | "page" | "all") {
    setSelected(scope === "none" ? [] : (scope === "page" ? rows : results).map(document => document.id));
    setSelectionOpen(false);
    selectionToggle.current?.focus();
  }
  function reset() { setDraft(emptyFilters); setFilters(emptyFilters); setPage(0); setSelected([]); }
  function setField(field: keyof Filters, value: string) { setDraft(previous => ({ ...previous, [field]: value })); }
  function dateRange(label: string, fromKey: "from" | "createdFrom", toKey: "to" | "createdTo") {
    const today = dateFormat.format(new Date());
    const weekStart = new Date(`${today}T12:00:00Z`);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const week = weekStart.toISOString().slice(0, 10);
    const month = `${today.slice(0, 7)}-01`;
    const preset = draft[toKey] === today ? draft[fromKey] === today ? "today" : draft[fromKey] === week ? "week" : draft[fromKey] === month ? "month" : "custom" : "custom";
    return <fieldset className={styles.dateField}><legend>{label}</legend><div className={styles.dateRange}>
      <select aria-label={`فترة ${label}`} value={preset} onChange={event => {
        const from = event.target.value === "week" ? week : event.target.value === "month" ? month : today;
        setDraft(previous => ({ ...previous, [fromKey]: event.target.value === "custom" ? "" : from, [toKey]: event.target.value === "custom" ? "" : today }));
      }}><option value="custom">تخصيص</option><option value="today">اليوم</option><option value="week">آخر ٧ أيام</option><option value="month">هذا الشهر</option></select>
      <input aria-label={`${label} من`} type="date" value={draft[fromKey]} onChange={event => setField(fromKey, event.target.value)} />
      <input aria-label={`${label} إلى`} type="date" min={draft[fromKey] || undefined} value={draft[toKey]} onChange={event => setField(toKey, event.target.value)} />
    </div></fieldset>;
  }
  function unavailableField(label: string, input = false) {
    return <label><span className={styles.fieldLabel}>{label}<small>غير مفعّل</small></span>{input ? <input disabled placeholder="غير متاح حاليًا" /> : <select disabled defaultValue=""><option value="">الكل</option></select>}</label>;
  }
  function exportInvoices() {
    downloadFinanceCsv("branda-invoices.csv", [["رقم الفاتورة", "العميل", "التاريخ", "الإجمالي", "المحصّل بعد الاسترداد", "المتبقي", "الحالة"],
      ...exportRows.map(document => [document.display_number || document.number, partyName(document.party_id), financeDate(document.created_at), document.total, collected(document), remaining(document), paymentStatus(document)])]);
  }
  const pagination = <nav className={styles.pagination} aria-label="صفحات الفواتير">
    <span aria-live="polite">{results.length ? currentPage * 20 + 1 : 0}–{Math.min((currentPage + 1) * 20, results.length)} من {results.length}</span>
    <button type="button" className={styles.iconButton} aria-label="الصفحة السابقة" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronRight size={17} /></button>
    <span className={styles.pageNumber}>صفحة {pageCount ? currentPage + 1 : 0} من {pageCount}</span>
    <button type="button" className={styles.iconButton} aria-label="الصفحة التالية" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronLeft size={17} /></button>
  </nav>;

  const sortControl = <div className={styles.addContainer} ref={sortContainer}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSortOpen(false); }}
        onKeyDown={event => { if (event.key === "Escape" && sortOpen) { event.preventDefault(); setSortOpen(false); sortToggle.current?.focus(); } }}>
        <button type="button" ref={sortToggle} className={`${styles.sortButton} ${styles.listSort}`} aria-label="ترتيب الفواتير" aria-expanded={sortOpen} aria-controls={sortMenuId} onClick={() => { setSortOpen(!sortOpen); setAddOpen(false); setMoreOpen(false); }}><ArrowUpDown size={16} aria-hidden="true" />ترتيب<span className={styles.srOnly}>{sortOptions.find(option => option.id === sort)?.label}</span>{sortDirection === "asc" ? <ArrowUp size={14} aria-label="تصاعدي" /> : <ArrowDown size={14} aria-label="تنازلي" />}</button>
        {sortOpen && <div id={sortMenuId} className={`${styles.addMenu} ${styles.moreMenu}`} role="group" aria-label="ترتيب الفواتير">
          {sortOptions.map(option => <button type="button" key={option.id} aria-pressed={sort === option.id} title={sort === option.id ? "اضغط لعكس اتجاه الترتيب" : `ترتيب حسب ${option.label}`} onClick={() => {
            setSort(option.id); setSortDirection(sort === option.id ? sortDirection === "asc" ? "desc" : "asc" : option.id === "customer" || option.id === "payment" ? "asc" : "desc"); setPage(0); setSortOpen(false); sortToggle.current?.focus();
          }}>{sort === option.id ? sortDirection === "asc" ? <ArrowUp size={16} aria-hidden="true" /> : <ArrowDown size={16} aria-hidden="true" /> : <ArrowUpDown size={16} aria-hidden="true" />}<span>{option.label}</span>{sort === option.id && <Check size={14} className={styles.sortCheck} aria-hidden="true" />}</button>)}
        </div>}
      </div>;

  return <section className={styles.manager} aria-label="إدارة الفواتير">
    <div className={styles.topbar}>
      <div className={styles.selectionToolbar}>
        <div className={styles.addContainer} ref={selectionContainer}
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSelectionOpen(false); }}
          onKeyDown={event => { if (event.key === "Escape" && selectionOpen) { event.preventDefault(); setSelectionOpen(false); selectionToggle.current?.focus(); } }}>
          <div className={styles.selectionControl}>
            <label className={styles.selectionCheckbox}><input type="checkbox" aria-label="تحديد كل فواتير الصفحة الحالية" disabled={!rows.length} checked={allSelected} ref={node => { if (node) node.indeterminate = partiallySelected; }} onChange={togglePageSelection} /></label>
            <button type="button" ref={selectionToggle} className={styles.iconButton} aria-label="خيارات تحديد الفواتير" aria-expanded={selectionOpen} aria-controls={selectionMenuId} onClick={() => { setSelectionOpen(!selectionOpen); setAddOpen(false); setMoreOpen(false); setSortOpen(false); }}><ChevronDown size={17} aria-hidden="true" /></button>
          </div>
          {selectionOpen && <div id={selectionMenuId} className={`${styles.addMenu} ${styles.selectionMenu}`} role="group" aria-label="تحديد الفواتير">
            <button type="button" disabled={!selected.length} onClick={() => chooseSelection("none")}><X size={17} aria-hidden="true" /><span>لا شيء</span></button>
            <button type="button" disabled={!rows.length} onClick={() => chooseSelection("page")}><Check size={17} aria-hidden="true" /><span>الكل (الصفحة الحالية)</span></button>
            <button type="button" disabled={!results.length} onClick={() => chooseSelection("all")}><CheckCheck size={17} aria-hidden="true" /><span>{hasMore ? "الكل (جميع الصفحات المحمّلة)" : "الكل (جميع الصفحات)"}</span></button>
            {hasMore && <p className={styles.selectionHint}>التحديد يشمل النتائج المحمّلة فقط حمّل الفواتير الأقدم لتضمينها</p>}
          </div>}
        </div>
        {pagination}
        {selectedCount > 0 && <span className={styles.selectionCount} role="status">{selectedCount} فاتورة محددة</span>}
      </div>
      <div className={styles.actions}>
        <div className={styles.addContainer} ref={moreContainer}
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMoreOpen(false); }}
          onKeyDown={event => { if (event.key === "Escape" && moreOpen) { event.preventDefault(); setMoreOpen(false); moreToggle.current?.focus(); } }}>
          <button type="button" ref={moreToggle} className={styles.iconButton} aria-label="المزيد من خيارات الفواتير" aria-expanded={moreOpen} aria-controls={moreMenuId} onClick={() => { setMoreOpen(!moreOpen); setAddOpen(false); }}><MoreHorizontal size={20} aria-hidden="true" /></button>
          {moreOpen && <div id={moreMenuId} className={`${styles.addMenu} ${styles.moreMenu}`} role="group" aria-label="المزيد من خيارات الفواتير">
            {onSettings && <button type="button" onClick={() => { setMoreOpen(false); onSettings(); }}><Settings size={17} aria-hidden="true" /><span>الإعدادات</span></button>}
            <button type="button" disabled={!exportRows.length} onClick={() => { setMoreOpen(false); exportInvoices(); }}><ArrowDownToLine size={16} aria-hidden="true" /><span>{selected.length ? `تصدير المحدد (${exportRows.length})` : "تصدير"}</span></button>
            <button type="button" disabled={pending} onClick={() => { setMoreOpen(false); onRefresh(); }}><RefreshCw size={17} aria-hidden="true" className={pending ? styles.spin : undefined} /><span>{pending ? "جار تحديث الفواتير" : "تحديث الفواتير"}</span></button>
          </div>}
        </div>
        {onReports && <button type="button" className={styles.iconButton} title="تقارير الفواتير" aria-label="تقارير الفواتير" onClick={() => { setMoreOpen(false); setAddOpen(false); onReports(); }}><PieChart size={20} aria-hidden="true" /></button>}
        {onCreate && <div className={styles.addContainer} ref={addContainer}
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setAddOpen(false); }}
          onKeyDown={event => { if (event.key === "Escape" && addOpen) { event.preventDefault(); setAddOpen(false); addToggle.current?.focus(); } }}>
          <div className={styles.splitButton}>
            <button type="button" className={styles.primary} disabled={disabled} onClick={() => { setAddOpen(false); onCreate(); }}><Plus size={18} aria-hidden="true" />إضافة فاتورة</button>
            <button type="button" ref={addToggle} className={styles.addToggle} disabled={disabled} aria-label="خيارات إضافة فاتورة" aria-expanded={addOpen && !disabled} aria-controls={addMenuId} onClick={() => setAddOpen(!addOpen)}><ChevronDown size={17} aria-hidden="true" /></button>
          </div>
          {addOpen && !disabled && <div id={addMenuId} className={styles.addMenu} role="group" aria-label="خيارات إضافة فاتورة">
            <button type="button" onClick={() => { setAddOpen(false); onCreate(); }}><Plus size={17} aria-hidden="true" /><span>فاتورة جديدة</span></button>
            <button type="button" disabled={!onImport} onClick={() => { setAddOpen(false); onImport?.("sheet"); }}><CloudUpload size={17} aria-hidden="true" /><span>استيراد</span></button>
            <button type="button" disabled={!onImport} className={styles.aiOption} onClick={() => { setAddOpen(false); onImport?.("ai"); }}><Sparkles size={17} aria-hidden="true" /><span>رفع بالذكاء الاصطناعي</span></button>
          </div>}
        </div>}
      </div>
    </div>
    <form className={styles.searchPanel} onSubmit={event => { event.preventDefault(); setFilters(draft); setPage(0); setSelected([]); }}>
      <div className={styles.searchHeading}><h2>بحث</h2></div>
      <div className={styles.searchBody}>
        <div className={`${styles.fields} ${styles.basicFields}`}>
          <label>العميل<select value={draft.customer} onChange={event => setDraft({ ...draft, customer: event.target.value })}><option value="">أي عميل</option><option value="cash">عميل نقدي</option>{parties.filter(party => party.kind === "customer").map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></label>
          <label>رقم الفاتورة<input inputMode="numeric" placeholder="أدخل رقم الفاتورة" value={draft.number} onChange={event => setDraft({ ...draft, number: event.target.value })} /></label>
          <label>حالة الدفع<select value={draft.payment} onChange={event => setField("payment", event.target.value)}><option value="all">أي</option><option value="unpaid">غير مدفوعة</option><option value="partial">مدفوعة جزئيًا</option><option value="paid">مدفوعة</option><option value="returned">مرتجع</option><option value="partially-returned">مرتجع جزئيًا</option><option value="due">مستحقة الدفع</option></select></label>
        </div>
        <fieldset id="invoice-advanced-search" className={`${styles.fields} ${styles.advancedFields}`} hidden={!advanced} disabled={!advanced}>
          <legend className={styles.srOnly}>فلاتر البحث المتقدم</legend>
          <label>تحتوي على البند<input value={draft.item} onChange={event => setField("item", event.target.value)} placeholder="اسم الصنف في الفاتورة" /></label>
          <label>العملة<select value={draft.currency} onChange={event => setField("currency", event.target.value)}><option value="">أي عملة</option><option value="SAR">ريال سعودي</option><option value="USD">دولار أمريكي</option><option value="EUR">يورو</option><option value="GBP">جنيه إسترليني</option><option value="AED">درهم إماراتي</option></select></label>
          <div className={styles.amountFields}><label>الإجمالي أكبر من<input type="number" min="0" step="0.01" value={draft.min} onChange={event => setField("min", event.target.value)} /></label><label>الإجمالي أقل من<input type="number" min={draft.min || "0"} step="0.01" value={draft.max} onChange={event => setField("max", event.target.value)} /></label></div>
          {dateRange("التاريخ", "from", "to")}
          {unavailableField("تاريخ الاستحقاق", true)}
          {unavailableField("المصدر")}
          {unavailableField("حقل مخصص", true)}
          {dateRange("تاريخ الإنشاء", "createdFrom", "createdTo")}
          {unavailableField("نوع الفاتورة")}
          <label>نوع العميل<select value={draft.customerType} onChange={event => setField("customerType", event.target.value)}><option value="">الكل</option><option value="cash">عميل نقدي</option><option value="registered">عميل مسجل</option></select></label>
          <label>أضيفت بواسطة<select value={draft.creator} onChange={event => setField("creator", event.target.value)}><option value="">أي موظف</option>{staff.map(member => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}</select></label>
          {unavailableField("مسؤول مبيعات")}
          <label>جلسة<select value={draft.shift} onChange={event => setField("shift", event.target.value)}><option value="">كل الجلسات</option>{shifts.map(shift => <option key={shift.id} value={shift.id}>{shift.shift_number ? `وردية #${shift.shift_number}` : "وردية"} — {financeDate(shift.opened_at)}</option>)}</select></label>
          {unavailableField("خيارات الشحن")}
          {unavailableField("مصدر الطلب")}
        </fieldset>
        <div className={styles.searchFooter}>
          <button type="button" className={styles.secondary} aria-expanded={advanced} aria-controls="invoice-advanced-search" onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={16} aria-hidden="true" />{advanced ? "إخفاء البحث المتقدم" : "بحث متقدم"}</button>
          <div className={styles.actions}><button type="button" className={styles.secondary} onClick={reset}>إلغاء الفلاتر</button><button type="submit" className={styles.searchButton}><Search size={15} aria-hidden="true" />بحث</button></div>
        </div>
      </div>
    </form>
    {!results.length ? <div className={styles.empty} role="status"><FileText size={22} aria-hidden="true" /><div><strong>{sales.length ? "لا توجد فواتير تطابق البحث" : "لا توجد فواتير مبيعات حتى الآن"}</strong><p>{sales.length ? "جرّب تغيير العميل أو رقم الفاتورة أو إلغاء الفلاتر" : "ابدأ بإضافة أول فاتورة وستظهر تفاصيلها وحالة سدادها هنا"}</p></div>{sales.length ? <button type="button" className={styles.secondary} onClick={reset}>إلغاء الفلاتر</button> : onCreate && <button type="button" className={styles.primary} disabled={disabled} onClick={onCreate}>إضافة فاتورة</button>}</div>
      : <div className={styles.invoiceList}><table className={styles.listTable}><caption className={styles.srOnly}>سجل فواتير المبيعات</caption><thead><tr>
        <th scope="col" className={styles.identityColumn}>رقم الفاتورة</th><th scope="col" className={styles.creatorColumn}>أُنشئ بواسطة</th><th scope="col" className={styles.stateColumn}>الحالة</th><th scope="col" className={styles.amountColumn}>المبلغ</th><th scope="col" className={styles.menuColumn}>{sortControl}</th>
      </tr></thead><tbody>{rows.map(document => {
        const partial = !document.refunded && remaining(document) > .009 && collected(document) >= .01;
        const refundedTotal = document.refunded_total ?? (document.refunded ? document.total : 0);
        return <tr key={document.id} data-selected={selected.includes(document.id)} tabIndex={0} aria-label={`فتح تفاصيل الفاتورة ${document.display_number || document.number}`} onClick={event => { if (!(event.target as HTMLElement).closest("button,a,input,label,select,textarea")) onReceipt(document.id); }} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onReceipt(document.id); } }}>
          <td className={styles.identityColumn}><div className={styles.invoiceIdentity}>
            <label className={styles.invoiceSelect}><input type="checkbox" aria-label={`تحديد فاتورة ${document.display_number || document.number}`} checked={selected.includes(document.id)} onChange={() => setSelected(previous => previous.includes(document.id) ? previous.filter(id => id !== document.id) : [...previous, document.id])} /></label>
            <button type="button" className={styles.invoiceLink} aria-label={`عرض فاتورة ${document.display_number || document.number} للعميل ${partyName(document.party_id)}`} onClick={() => onReceipt(document.id)}><strong>{partyName(document.party_id)}</strong><span className={styles.invoiceMeta}><bdi>#{document.display_number || String(document.number).padStart(6, "0")}</bdi><span aria-hidden="true"> – </span><time dateTime={document.created_at} dir="ltr">{invoiceDate(document.created_at)}</time></span></button>
          </div></td>
          <td className={styles.creatorColumn}><span className={styles.mobileLabel}>أُنشئ بواسطة</span><span className={styles.invoiceCreator}>{creatorName(document.created_by)}</span></td>
          <td className={styles.stateColumn} />
          <td className={styles.amountColumn}><div className={styles.invoiceAmounts}><strong className={styles.invoiceAmount}><Numeric value={document.total} money /></strong><div className={styles.invoiceStatuses}>{!document.refunded && <span className={styles.status} data-partial={partial} data-paid={remaining(document) <= .009}>{partial && <CircleAlert size={12} aria-hidden="true" />}{invoicePaymentStatus(document)}</span>}{(document.refunded || refundedTotal > .009) && <span className={styles.status} data-returned="true">{document.refunded ? "مرتجع" : "مرتجع جزئيًا"}</span>}</div>{refundedTotal > .009 && <span className={styles.invoiceRefund}>مرتجع: <Numeric value={refundedTotal} money /></span>}{remaining(document) > .009 && <span className={styles.invoiceDue}>المبلغ المستحق: <Numeric value={remaining(document)} money /></span>}</div></td>
          <td className={styles.menuColumn}><div className={styles.rowMenuContainer} ref={rowOpen === document.id ? rowContainer : undefined}
            onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setRowOpen(null); }}
            onKeyDown={event => { if (event.key === "Escape" && rowOpen === document.id) { event.preventDefault(); event.stopPropagation(); setRowOpen(null); event.currentTarget.querySelector<HTMLButtonElement>("button")?.focus(); } }}>
            <button type="button" className={styles.invoiceMenuToggle} aria-label={`إجراءات فاتورة ${document.display_number || document.number}`} aria-expanded={rowOpen === document.id} aria-controls={`${rowMenuPrefix}-${document.id}`} onClick={() => { setRowOpen(rowOpen === document.id ? null : document.id); setSortOpen(false); setAddOpen(false); setMoreOpen(false); setSelectionOpen(false); }}><MoreHorizontal size={21} aria-hidden="true" /></button>
            {rowOpen === document.id && <div id={`${rowMenuPrefix}-${document.id}`} className={`${styles.addMenu} ${styles.rowMenu}`} role="group" aria-label={`خيارات فاتورة ${document.display_number || document.number}`}>
              <button type="button" onClick={() => { setRowOpen(null); onReceipt(document.id); }}>التفاصيل</button>
              {onSettle && !document.refunded && document.outstanding > .009 && <button type="button" disabled={disabled} onClick={() => { setRowOpen(null); onSettle(document); }}>تسجيل دفعة</button>}
              {onRefund && !document.refunded && <button type="button" disabled={disabled} onClick={() => { setRowOpen(null); onRefund(document); }}>مرتجع</button>}
            </div>}
          </div></td>
        </tr>;
      })}</tbody></table></div>}

    {hasMore && <div className={styles.history}><span>البحث يشمل الفواتير المحمّلة حاليًا</span><button type="button" className={styles.secondary} disabled={pending} onClick={onLoadMore}>{pending ? "جار تحميل الفواتير" : "تحميل فواتير أقدم"}</button></div>}
  </section>;
}
