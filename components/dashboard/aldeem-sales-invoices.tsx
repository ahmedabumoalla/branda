"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Plus, Search, ReceiptText, RefreshCw, ArrowRight, Monitor, Landmark } from "lucide-react";
import { executeBrandFinanceAction, fetchBrandFinanceHistoryAction } from "@/app/actions/brand-finance";
import { getAldeemInvoiceShell, searchAldeemInvoiceCustomers } from "@/app/actions/aldeem-invoice-lookups";
import type { FinanceDocument, FinanceParty, FinanceSnapshot } from "@/lib/finance/brand-finance";
import styles from "./aldeem-sales-invoices.module.css";
import { AldeemSalesInvoiceDetail } from "./aldeem-sales-invoice-detail";

const loadForm = () => import("../finance/finance-sale-form").then(module => module.FinanceSaleForm);
function InvoiceSkeleton() {
  return <div className={styles.skeleton} role="status" aria-label="تجهيز بيانات الفاتورة"><div className={styles.skeletonToolbar} /><div className={styles.skeletonColumns}>{[0, 1].map(column => <div key={column}>{[0, 1, 2].map(row => <span key={row} />)}</div>)}</div><div className={styles.skeletonTable}>{[0, 1, 2, 3].map(row => <span key={row} />)}</div><span className={styles.srOnly}>جار تجهيز بيانات الفاتورة</span></div>;
}
const InvoiceForm = dynamic(loadForm, { loading: InvoiceSkeleton });
const slug = "khayal-aldeem";
const amount = (value: number) => new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

/** One ledger for POS and accounting invoices; pagination never creates parallel copies. */
export function AldeemSalesInvoices() {
  const [snapshot, setSnapshot] = useState<FinanceSnapshot | null>(null);
  const [documents, setDocuments] = useState<FinanceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<FinanceDocument | null>(null);
  const registerReturn = useRef<{ button: HTMLButtonElement | null; scrollY: number } | null>(null);
  const [formVisited, setFormVisited] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const formIssued = useRef(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const offset = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(false);
  const customerRequest = useRef<{ key: string; id: string } | null>(null);
  const registerParties = useRef<FinanceParty[]>([]);
  async function load(more = false) {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError("");
    try {
      const history = await fetchBrandFinanceHistoryAction("documents", more ? offset.current : 0, slug);
      if (!mounted.current) return;
      if (!history.ok) throw new Error(history.message);
      const rows = history.data.rows as FinanceDocument[];
      setDocuments(previous => [...new Map([...(more ? previous : []), ...rows].map(row => [row.id, row])).values()]);
      offset.current = (more ? offset.current : 0) + rows.length;
      setHasMore(history.data.hasMore);
      const partyIds = [...new Set(rows.flatMap(row => row.party_id ? [row.party_id] : []))];
      if (partyIds.length) {
        const parties = await searchAldeemInvoiceCustomers("", partyIds.slice(0, 100));
        if (parties.ok && mounted.current) {
          registerParties.current = [...new Map([...registerParties.current, ...parties.data].map(party => [party.id, party])).values()];
          setSnapshot(previous => previous ? { ...previous, parties: [...new Map([...previous.parties, ...registerParties.current].map(party => [party.id, party])).values()] } : previous);
        }
      }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "تعذر تحميل الفواتير أعد المحاولة"); }
    finally { busy.current = false; if (mounted.current) setLoading(false); }
  }
  useEffect(() => {
    mounted.current = true;
    // Authorization shell is independent of register history and customer names.
    void getAldeemInvoiceShell().then(result => {
      if (!mounted.current) return;
      if (result.ok) setSnapshot(previous => ({ ...result.data, parties: previous?.parties ?? registerParties.current }));
      else setFormError(result.message);
    }).catch(() => { if (mounted.current) setFormError("تعذر التحقق من صلاحية إنشاء الفاتورة"); });
    void load();
    return () => { mounted.current = false; };
  }, []);
  async function createCustomer(payload: Record<string, unknown>) {
    if (savingCustomer) return false;
    setSavingCustomer(true); setFormError("");
    const key = JSON.stringify(payload);
    if (customerRequest.current?.key !== key) customerRequest.current = { key, id: crypto.randomUUID() };
    try {
      const result = await executeBrandFinanceAction({ operation: "party", requestId: customerRequest.current.id, payload: { ...payload, kind: "customer" } }, slug);
      if (!result.ok) { setFormError(result.message); return false; }
      const saved: FinanceParty = { id: result.data.id, kind: "customer", name: String(payload.name ?? "").trim(), phone: String(payload.phone ?? "").trim(), email: String(payload.email ?? "").trim(), tax_number: String(payload.taxNumber ?? ""), active: payload.active !== false, balance: 0, details: payload.details as Record<string, string> };
      setSnapshot(previous => previous ? { ...previous, parties: [...previous.parties.filter(row => row.id !== saved.id), saved] } : previous); customerRequest.current = null; return true;
    } catch { setFormError("تعذر تأكيد حفظ العميل أعد المحاولة"); return false; }
    finally { setSavingCustomer(false); }
  }
  const sales = documents.filter(row => row.kind === "sale" && row.document_type !== "debit");
  const customer = (row: FinanceDocument) => snapshot?.parties.find(party => party.id === row.party_id)?.name || "عميل نقدي";
  const filtered = sales.filter(row => (source === "all" || (source === "pos" ? !!row.shift_id : !row.shift_id)) && `${row.display_number || row.number} ${customer(row)} ${row.customer_phone || ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  function openInvoice(invoice: FinanceDocument, button: HTMLButtonElement | null) {
    registerReturn.current = { button, scrollY: window.scrollY };
    setSelectedInvoice(invoice);
  }
  function closeInvoice() {
    setSelectedInvoice(null);
    requestAnimationFrame(() => {
      if (!mounted.current) return;
      registerReturn.current?.button?.focus({ preventScroll: true });
      window.scrollTo({ top: registerReturn.current?.scrollY ?? 0, behavior: "instant" });
    });
  }
  return <div className={styles.page}>
    {selectedInvoice && <AldeemSalesInvoiceDetail key={selectedInvoice.id} initialInvoice={selectedInvoice} initialCustomer={snapshot?.parties.find(party => party.id === selectedInvoice.party_id)} slug={slug} onBack={closeInvoice} />}
    <div hidden={!!selectedInvoice}>
    <header className={styles.toolbar}><div><span className={styles.eyebrow}>سجل موحد</span><h2>{creating ? "إنشاء فاتورة مبيعات" : "فواتير نقاط البيع والمالية"}</h2><p>{creating ? "فاتورة مالية تُحفظ ضمن سجل المبيعات نفسه" : "راجع فواتير الديم ومصدرها والمبالغ المحصلة والمتبقية"}</p></div>
      {creating ? <button type="button" onClick={() => setCreating(false)}><ArrowRight size={17} />سجل الفواتير</button> : <button className={styles.primary} type="button" disabled={!snapshot?.canManage} onPointerEnter={() => { void loadForm().catch(() => undefined); }} onFocus={() => { void loadForm().catch(() => undefined); }} onClick={() => { if (formIssued.current) { setFormVersion(value => value + 1); formIssued.current = false; } setFormVisited(true); setCreating(true); }}><Plus size={18} />إنشاء فاتورة مبيعات</button>}
    </header>
    {!creating && error && <div className={styles.error} role="alert">{error}<button type="button" disabled={loading} onClick={() => void load()}>إعادة المحاولة</button></div>}
    {!snapshot && formError && <div className={styles.error} role="alert">{formError}</div>}
    {formVisited && snapshot && <section hidden={!creating} className={styles.editor} aria-label="نموذج فاتورة مالية"><InvoiceForm key={formVersion} appearance="aldeem" stale={false} snapshot={snapshot} pending={savingCustomer} error={formError} onCancel={() => setCreating(false)} onCreateCustomer={createCustomer} onIssued={() => { formIssued.current = true; void load(); }} /></section>}
    <div hidden={creating}>
      <div className={styles.filters}><div className={styles.tabs} aria-label="مصدر الفاتورة">{([["all", "كل الفواتير", ReceiptText], ["pos", "نقاط البيع", Monitor], ["finance", "المالية", Landmark]] as const).map(([value, label, Icon]) => <button type="button" key={value} aria-pressed={source === value} onClick={() => setSource(value)}><Icon size={16} aria-hidden="true" />{label}</button>)}</div><label className={styles.search}><Search size={17} aria-hidden="true" /><input aria-label="البحث برقم الفاتورة أو العميل" placeholder="رقم الفاتورة أو اسم العميل" value={search} onChange={event => setSearch(event.target.value)} /></label><button type="button" disabled={loading} onClick={() => void load()} aria-label="تحديث سجل الفواتير"><RefreshCw size={17} /></button></div>
      <section className={styles.register} aria-label="سجل فواتير المبيعات" aria-busy={loading}>
        <div className={styles.tableScroll}><table><thead><tr><th>الفاتورة والتاريخ</th><th>العميل</th><th>المصدر</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id} className={styles.invoiceRow} onClick={event => openInvoice(row, event.currentTarget.querySelector<HTMLButtonElement>("button"))}><td><button type="button" className={styles.invoiceLink} aria-label={`عرض تفاصيل الفاتورة ${row.display_number || row.number}`} onClick={event => { event.stopPropagation(); openInvoice(row, event.currentTarget); }}><strong>#{row.display_number || row.number}</strong></button><small>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", calendar: "gregory", timeZone: "Asia/Riyadh" }).format(new Date(row.created_at))}</small></td><td>{customer(row)}</td><td><span className={styles.source}>{row.shift_id ? "نقطة بيع" : "المالية"}</span></td><td className={styles.money}>{amount(row.total)}</td><td className={styles.money}>{amount(row.paid)}</td><td className={styles.money}>{amount(row.outstanding)}</td><td><span className={row.refunded ? styles.neutral : row.outstanding > 0 ? styles.unpaid : styles.paid}>{row.refunded ? "مرتجعة" : row.outstanding <= 0 ? "مدفوعة" : row.paid > 0 ? "مدفوعة جزئيًا" : "آجلة"}</span></td></tr>)}</tbody></table></div>
        {!filtered.length && (loading ? <div className={styles.skeletonTable} role="status" aria-label="تحميل سجل الفواتير">{[0, 1, 2, 3].map(row => <span key={row} />)}</div> : <div className={styles.empty}><ReceiptText size={32} strokeWidth={1.4} aria-hidden="true" /><h3>{error ? "تعذر عرض السجل" : search || source !== "all" ? "لا توجد فواتير مطابقة ضمن النتائج المحملة" : "لا توجد فواتير في السجل المحمل"}</h3><p>تظهر هنا فواتير نقاط البيع والفواتير المنشأة من المالية</p></div>)}
        <footer className={styles.footer}><span>{filtered.length} فاتورة معروضة · المبالغ بالريال السعودي</span>{hasMore && <button type="button" disabled={loading} onClick={() => void load(true)}>{loading ? "جار التحميل" : "تحميل المزيد من السجل"}</button>}</footer>
      </section>
    </div>
    </div>
  </div>;
}
