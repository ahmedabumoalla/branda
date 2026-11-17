"use client";

import { useRef, useState } from "react";
import { ArrowRight, RefreshCw, Search } from "lucide-react";
import { searchAldeemReturnInvoices, getAldeemReturnSettlement } from "@/app/actions/aldeem-sales-returns";
import { readInvoiceDetailAction } from "@/app/actions/finance-invoice-management";
import { executeBrandFinanceAction } from "@/app/actions/brand-finance";
import type { AldeemReturnInvoice } from "@/lib/finance/aldeem-sales-return";
import type { InvoiceDetail } from "@/lib/finance/invoice-management";
import type { FinanceAccount, FinanceShift } from "@/lib/finance/brand-finance";
import { refundPayload, refundPreview } from "@/lib/finance/refund";
import { Modal } from "./ui/modal";
import css from "./aldeem-sales-quotes.module.css";

const money = (value: number) => new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

/** No mount requests. Source lookup, current quantities and settlement options follow explicit intent. */
export function AldeemReturnEditor({ onBack, onPending }: { onBack: () => void; onPending: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AldeemReturnInvoice[]>([]);
  const [searched, setSearched] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<AldeemReturnInvoice | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [settlement, setSettlement] = useState<{ accounts: FinanceAccount[]; shifts: FinanceShift[] } | null>(null);
  const [accountId, setAccountId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [settlementError, setSettlementError] = useState("");
  const [settlementBusy, setSettlementBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const searchKey = useRef("");
  const offset = useRef(0);
  const lock = useRef(false);
  const selection = useRef(0);
  const settlementRequest = useRef<Promise<{ accounts: FinanceAccount[]; shifts: FinanceShift[] }> | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  const preview = detail ? refundPreview(detail.document, quantities) : null;
  const account = settlement?.accounts.find(item => item.id === accountId);

  async function search(more = false) {
    if (busy) return;
    setBusy(true); setError("");
    const term = more ? searchKey.current : query.trim();
    try {
      const response = await searchAldeemReturnInvoices(term, more ? offset.current : 0);
      if (!response.ok) throw new Error(response.message);
      setResults(previous => more ? [...previous, ...response.data.items] : response.data.items);
      offset.current = (more ? offset.current : 0) + response.data.items.length;
      searchKey.current = term; setHasMore(response.data.hasMore); setSearched(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر البحث عن الفاتورة"); }
    finally { setBusy(false); }
  }
  async function choose(invoice: AldeemReturnInvoice) {
    const version = ++selection.current;
    setSelected(invoice); setDetail(null); setQuantities({}); setNote(""); setError(""); setBusy(true);
    try {
      const response = await readInvoiceDetailAction(invoice.id, "khayal-aldeem");
      if (version !== selection.current) return;
      if (!response.ok) throw new Error(response.message);
      if (response.data.document.kind !== "sale" || response.data.document.refunded) throw new Error("الفاتورة غير متاحة للإرجاع أو أُرجعت بالكامل");
      setDetail(response.data); setAccountId(""); setShiftId("");
    } catch (cause) { if (version === selection.current) setError(cause instanceof Error ? cause.message : "تعذر قراءة أصناف الفاتورة"); }
    finally { if (version === selection.current) setBusy(false); }
  }
  function loadSettlement(refresh = false) {
    if (refresh && !settlementBusy) { settlementRequest.current = null; setSettlement(null); setAccountId(""); setShiftId(""); }
    if (settlementRequest.current) return settlementRequest.current;
    setSettlementBusy(true); setSettlementError("");
    settlementRequest.current = getAldeemReturnSettlement().then(result => {
      if (!result.ok) throw new Error(result.message);
      setSettlement(result.data); return result.data;
    }).catch(cause => { settlementRequest.current = null; setSettlementError(cause instanceof Error ? cause.message : "تعذر تحميل حسابات إعادة المبلغ"); throw cause; }).finally(() => setSettlementBusy(false));
    return settlementRequest.current;
  }
  async function submit() {
    if (lock.current || !detail) return;
    lock.current = true; setSaving(true); setError("");
    try {
      const payment = preview!.paid > 0 ? await loadSettlement() : { accounts: [], shifts: [] };
      const payload = refundPayload(detail.document, quantities, accountId, note, { canManage: true, ...payment }, shiftId);
      const key = JSON.stringify(payload);
      if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
      const result = await executeBrandFinanceAction({ operation: "refund", requestId: request.current.id, payload }, "khayal-aldeem");
      if (!result.ok) throw new Error(result.message);
      onPending(result.data.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تأكيد الطلب أعد المحاولة بنفس البيانات"); }
    finally { lock.current = false; setSaving(false); }
  }
  return <div className={css.editor}>
    <header className={css.toolbar}><div><h2>إنشاء مرتجع مبيعات</h2><p>اختر الفاتورة الأصلية وحدد الكميات المراد إرجاعها</p></div><button type="button" disabled={saving} onClick={() => detail && Object.values(quantities).some(value => value > 0) ? setCancelOpen(true) : onBack()}><ArrowRight size={17} aria-hidden="true" />سجل المرتجعات</button></header>
    {error && <p role="alert" className={css.error}>{error}</p>}
    {!selected ? <>
      <form className={css.filters} onSubmit={event => { event.preventDefault(); void search(); }}><label>رقم الفاتورة أو العميل<input type="search" maxLength={100} placeholder="رقم الفاتورة أو اسم العميل أو الجوال" value={query} onChange={event => setQuery(event.target.value)} /></label><div className={css.actions}><button type="submit" className={css.primary} disabled={busy}><Search size={17} aria-hidden="true" />{busy ? "جار البحث" : "بحث عن الفاتورة"}</button></div></form>
      <div className={css.register}>{results.length ? <div className={css.tableScroll}><table><thead><tr>{["الفاتورة", "العميل", "التاريخ", "الإجمالي", "الإجراء"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{results.map(invoice => <tr key={invoice.id}><td>#{invoice.displayNumber || invoice.number}</td><td>{invoice.customerName || "عميل نقدي"}</td><td>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", calendar: "gregory", timeZone: "Asia/Riyadh" }).format(new Date(invoice.createdAt))}</td><td>{money(invoice.total)}</td><td><button type="button" onClick={() => void choose(invoice)}>اختيار الفاتورة</button></td></tr>)}</tbody></table></div> : <div className={css.empty}><h3>{searched ? "لا توجد فواتير متاحة تطابق البحث" : "ابحث عن الفاتورة الأصلية"}</h3><p>تظهر الكميات المتبقية للإرجاع بعد اختيار الفاتورة</p></div>}{hasMore && <footer className={css.footer}><button type="button" disabled={busy} onClick={() => void search(true)}>عرض المزيد</button></footer>}</div>
    </> : <>
      <div className={css.toolbar}><h3>الفاتورة #{selected.displayNumber || selected.number}</h3><div className={css.actions}><button type="button" disabled={saving || busy} onClick={() => void choose(selected)}><RefreshCw size={16} aria-hidden="true" />تحديث كميات الفاتورة</button><button type="button" disabled={saving} onClick={() => { selection.current++; setSelected(null); setDetail(null); setBusy(false); setError(""); }}>اختيار فاتورة أخرى</button></div></div>
      {busy && <p className={css.notice} role="status">جار قراءة الكميات المتاحة للإرجاع</p>}
      {detail && preview && <form className={css.formBody} inert={cancelOpen} onSubmit={event => { event.preventDefault(); void submit(); }}><fieldset disabled={saving} className={css.formBody}>
        <section className={css.card}><div className={css.toolbar}><h3>الأصناف المرتجعة</h3><button type="button" onClick={() => setQuantities(Object.fromEntries(preview.lines.map(row => [row.line.id, row.available])))}>إرجاع كل الكميات المتبقية</button></div><div className={css.tableScroll} role="region" aria-label="الأصناف والكميات المرتجعة" tabIndex={0}><table><thead><tr>{["الصنف", "الكمية المرتجعة", "المباعة", "أُرجعت", "المتبقية", "قيمة المرتجع"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{preview.lines.map(row => <tr key={row.line.id}><td>{row.line.name}</td><td><input aria-label={`الكمية المرتجعة من ${row.line.name}`} type="number" inputMode="decimal" min="0" max={row.available} step="0.001" required disabled={row.available <= 0} value={row.quantity} onChange={event => setQuantities(current => ({ ...current, [row.line.id]: Number(event.target.value) }))} /></td><td>{row.line.quantity}</td><td>{row.line.returned_quantity ?? 0}</td><td>{row.available}</td><td>{money(row.total)}</td></tr>)}</tbody></table></div></section>
        <div className={css.metadata}><section className={css.card}><h3>تسوية المرتجع</h3>{preview.paid > 0 && <><label>حساب إعادة المبلغ<select value={accountId} onFocus={() => { void loadSettlement().catch(() => undefined); }} onChange={event => { setAccountId(event.target.value); setShiftId(""); }}><option value="">{settlementBusy ? "جار قراءة الحسابات" : "اختر الحساب"}</option>{settlement?.accounts.map(item => <option key={item.id} value={item.id}>{item.kind === "bank" ? "تحويل بنكي" : "نقدي"} · {item.name}</option>)}</select></label><button type="button" disabled={settlementBusy} onClick={() => { void loadSettlement(true).catch(() => undefined); }}>????? ?????? ??????? ?????????</button>{settlementError && <p role="alert" className={css.error}>{settlementError}<button type="button" onClick={() => { void loadSettlement().catch(() => undefined); }}>إعادة المحاولة</button></p>}{account?.kind === "cash" && <label>مصدر النقدية<select value={shiftId} onChange={event => setShiftId(event.target.value)}><option value="" disabled={settlement?.shifts.some(shift => shift.account_id === accountId && shift.status === "open")}>رصيد خزينة الصندوق</option>{settlement?.shifts.filter(shift => shift.account_id === accountId && shift.status === "open").map(shift => <option key={shift.id} value={shift.id}>وردية {new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(shift.opened_at))}</option>)}</select></label>}</>}<label>سبب المرتجع<textarea required maxLength={500} rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder="اكتب سبب إرجاع الأصناف" /></label></section>
        <section className={css.card}><h3>ملخص المرتجع</h3><div className={css.totals}>{[["ضريبة المرتجع", preview.tax], ["تخفيض المبلغ الآجل", preview.debt], ["المبلغ المعاد للعميل", preview.paid], ["إجمالي المرتجع", preview.total]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(Number(value))}</strong></div>)}</div><p className={css.notice}>يُحفظ طلب المرتجع للمراجعة ويُعاد المبلغ وتُحدّث الكميات بعد اعتماد المالك</p><button type="submit" className={css.primary} disabled={!preview.lines.some(row => row.quantity > 0) || saving}>{saving ? "جار حفظ الطلب" : "حفظ طلب المرتجع للمراجعة"}</button></section></div>
      </fieldset></form>}
    </>}
    <Modal open={cancelOpen} title="تعديلات غير محفوظة" onClose={() => setCancelOpen(false)} panelClassName={css.dialog}><p>لم يُحفظ طلب المرتجع بعد</p><div className={css.actions}><button type="button" className={css.primary} onClick={() => setCancelOpen(false)}>متابعة التعديل</button><button type="button" onClick={onBack}>العودة دون حفظ</button></div></Modal>
  </div>;
}
