"use client";

import { useCallback, useRef, useState } from "react";
import { Plus, Save, Printer } from "lucide-react";
import { InvoiceCustomerSearch } from "@/components/finance/invoice-customer-search";
import { CompanyInvoiceLines } from "@/components/finance/company-invoice-lines";
import { AldeemCustomerForm } from "@/components/finance/aldeem-customer-form";
import { Modal } from "@/components/dashboard/ui/modal";
import { useAldeemCustomerCredit } from "@/components/finance/use-aldeem-customer-credit";
import { getAldeemInvoicePaymentOptions, searchAldeemInvoiceProducts } from "@/app/actions/aldeem-invoice-lookups";
import { companyInvoiceIssuerAction, issueCompanyInvoiceAction } from "@/app/actions/finance-company-invoices";
import { saveInvoiceDraftAction } from "@/app/actions/finance-invoice-drafts";
import { companyAmounts, moneyRound } from "@/lib/finance/company-invoice";
import type { InvoiceDraftPayload } from "@/lib/finance/invoice-draft";
import type { InvoiceCatalogProduct } from "@/lib/finance/inventory-sales";
import type { FinanceParty, FinanceSnapshot } from "@/lib/finance/brand-finance";
import form from "@/components/finance/aldeem-customer-form.module.css";
import css from "./aldeem-invoice-editor.module.css";

const slug = "khayal-aldeem";
type Options = Pick<FinanceSnapshot, "accounts" | "warehouses" | "settings">;
type Props = { snapshot: FinanceSnapshot; pending: boolean; error: string; onCancel: () => void; onCreateCustomer: (payload: Record<string, unknown>) => Promise<boolean>; onIssued: () => void };
const money = (value: number) => new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

/** Aldeem owns its editor lifecycle. No legacy bootstrap, settings or optional-module hooks. */
export function AldeemInvoiceEditor({ snapshot, pending, error: parentError, onCancel, onCreateCustomer, onIssued }: Props) {
  const [customer, setCustomer] = useState<FinanceParty>();
  const [customerOpen, setCustomerOpen] = useState(false);
  const [products, setProducts] = useState<InvoiceCatalogProduct[]>([]);
  const [lines, setLines] = useState<InvoiceDraftPayload["invoice"]["lines"]>([{ key: 1, productId: "", quantity: 1 }]);
  const [options, setOptions] = useState<Options | null>(null);
  const optionsRequest = useRef<Promise<Options> | null>(null);
  const [warehouse, setWarehouse] = useState("");
  const [account, setAccount] = useState("");
  const [method, setMethod] = useState<"cash" | "pos" | "bank" | "credit">("cash");
  const [partial, setPartial] = useState(false), [cash, setCash] = useState(0);
  const [note, setNote] = useState("");
  const [taxRate, setTaxRate] = useState(15), [inclusive, setInclusive] = useState(true);
  const [discount, setDiscount] = useState(0);
  const [template, setTemplate] = useState<"standard" | "thermal">("standard");
  const [busy, setBusy] = useState(false), [optionsBusy, setOptionsBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [issued, setIssued] = useState<{ id: string; number: number; displayNumber?: string } | null>(null);
  const identity = useRef({ id: "", revision: 0 }), locked = useRef(false);
  const credit = useAldeemCustomerCredit(true, customer?.id || "");
  const totals = companyAmounts(lines, products, discount, "amount", taxRate, inclusive);
  const paid = method === "credit" ? 0 : partial ? cash : totals.total;
  const outstanding = moneyRound(totals.total - paid);
  const disabled = busy || pending || !!issued;
  const loadOptions = () => {
    if (options) return Promise.resolve(options);
    if (optionsRequest.current) return optionsRequest.current;
    setOptionsBusy(true);
    const request = getAldeemInvoicePaymentOptions().then(result => {
      if (!result.ok) throw new Error(result.message);
      setOptions(result.data); return result.data;
    }).finally(() => { optionsRequest.current = null; setOptionsBusy(false); });
    optionsRequest.current = request; return request;
  };
  const requestOptions = () => { void loadOptions().catch(cause => setError(cause.message)); };
  const search = useCallback(async (query: string) => {
    const result = await searchAldeemInvoiceProducts(query);
    if (!result.ok) throw new Error(result.message);
    setProducts(previous => [...new Map([...previous, ...result.data].map(product => [product.id, product])).values()]);
    return result.data.map(product => product.id);
  }, []);
  async function save(issue: boolean) {
    if (locked.current || disabled) return;
    setError(""); setNotice("");
    if (!customer) { setError("اختر العميل قبل الحفظ"); return; }
    if (lines.some(line => !line.productId && !line.name?.trim()) || lines.some(line => line.quantity <= 0)) { setError("أكمل الأصناف والكميات قبل الحفظ"); return; }
    if (paid < 0 || paid > totals.total || (partial && cash <= 0)) { setError("راجع المبلغ المدفوع يجب أن يكون موجبًا وألا يتجاوز إجمالي الفاتورة"); return; }
    if (issue && outstanding > 0 && (!credit.data || credit.error || credit.loading || !credit.data.enabled || credit.data.overdue || outstanding > credit.data.available)) { setError("راجع إتاحة البيع الآجل وحصّل المبلغ الزائد عن حد العميل قبل الإصدار"); return; }
    locked.current = true; setBusy(true);
    try {
      // Only the save action needs settlement accounts and the actual seller identity.
      const [settlement, seller] = await Promise.all([loadOptions(), companyInvoiceIssuerAction(slug)]);
      if (!seller.ok) throw new Error(seller.message);
      const selectedWarehouse = warehouse || settlement.warehouses.find(row => row.active)?.id || "";
      const eligible = settlement.accounts.filter(row => row.active && !row.is_cashier_drawer && row.kind === method);
      const selectedAccount = account || eligible.find(row => row.is_primary)?.id || (eligible.length === 1 ? eligible[0].id : "");
      setWarehouse(selectedWarehouse); setAccount(selectedAccount);
      if (issue && (!selectedWarehouse || (paid > 0 && !eligible.some(row => row.id === selectedAccount)))) throw new Error("اختر المستودع وحساب التحصيل من قسم السداد قبل الإصدار");
      if (!identity.current.id) identity.current.id = crypto.randomUUID();
      const payload: InvoiceDraftPayload = {
        invoice: { lines, warehouseId: selectedWarehouse, partyId: customer.id, accountId: method === "credit" ? "" : selectedAccount, paymentKind: method,
          discountKind: "amount", discountValue: discount, discountEnabled: discount > 0, vatRate: taxRate, taxInclusive: inclusive, note, currency: "SAR", exchangeRate: 1 },
        template, deliveryMethod: "print", issuer: { name: seller.data.name, vatNumber: seller.data.vatNumber, address: seller.data.address },
        deposit: { kind: "amount", value: partial ? cash : 0, paid: partial && cash > 0 }, shipping: "none", delivery: { confirmed: false, date: "" }, attachments: [], extraFields: [],
      };
      const saved = await saveInvoiceDraftAction({ ...identity.current, payload }, slug);
      if (!saved.ok) throw new Error(saved.message);
      identity.current = saved.data;
      if (!issue) { setNotice("تم حفظ المسودة"); return; }
      const posted = await issueCompanyInvoiceAction({ ...saved.data, expectedTotal: totals.total }, slug);
      if (!posted.ok) throw new Error(posted.message);
      setIssued(posted.data); setNotice(`تم إصدار الفاتورة ${posted.data.displayNumber || posted.data.number}`); onIssued();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تأكيد الحفظ أعد المحاولة بنفس الفاتورة"); }
    finally { locked.current = false; setBusy(false); }
  }
  return <>
    <form className={css.editor} dir="rtl" inert={customerOpen} onSubmit={event => { event.preventDefault(); void save(true); }}>
      <header className={css.toolbar}><div>
        <button type="button" disabled={disabled} onClick={() => void save(false)}>حفظ كمسودة</button>
      </div><div>
        {issued ? <a href={`/api/finance/${slug}/company-invoices/${issued.id}/pdf`} target="_blank" rel="noreferrer"><Printer size={16} />طباعة الفاتورة</a> : <button className={css.primary} disabled={disabled} type="submit"><Save size={16} />{busy ? "جار الحفظ" : "إصدار الفاتورة"}</button>}
        <button type="button" disabled={busy} onClick={onCancel}>إلغاء</button>
      </div></header>
      {(error || parentError) && <p className={css.error} role="alert">{error || parentError}</p>}
      {notice && <p className={css.notice} role="status">{notice}</p>}
      <fieldset disabled={disabled}>
        <section className={`${css.card} ${css.template}`}><label>قالب الفاتورة<select value={template} onChange={event => setTemplate(event.target.value as typeof template)}><option value="standard">التصميم الافتراضي للفاتورة</option><option value="thermal">فاتورة حرارية</option></select></label></section>
        <div className={css.topPanels}>
        <section className={css.card}><h3 className={css.heading}><span>01</span>العميل وطريقة الإصدار</h3><div className={css.customerFields}>
          <label>الطريقة<input readOnly value="طباعة" /></label>
          <div><label>العميل</label><div className={css.customer}><InvoiceCustomerSearch customer={customer} disabled={disabled} onSelect={setCustomer} /><button type="button" onClick={() => setCustomerOpen(true)}><Plus size={16} />جديد</button></div></div>
          <label>العملة<input readOnly value="SAR" /></label>
          <details><summary>المستودع وبيانات التوريد</summary><label>المستودع<select value={warehouse} onFocus={requestOptions} onChange={event => setWarehouse(event.target.value)}><option value="">اختر المستودع</option>{options?.warehouses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label></details>
        </div></section>
        <section className={css.card}><h3 className={css.heading}><span>02</span>بيانات الفاتورة</h3><div className={css.documentFields}>
          <label>رقم الفاتورة<input readOnly value={issued?.displayNumber || (issued ? String(issued.number) : "يُحدد عند الإصدار")} /></label>
          <label>تاريخ الفاتورة<input readOnly value="وقت الحفظ بتوقيت الرياض" /></label>
          <label>تاريخ الإصدار<input readOnly value="يُحدد عند الحفظ" /></label>
        </div></section></div>
        <section className={`${css.card} ${css.items}`}><h3>أصناف الفاتورة <span>{lines.length}</span></h3><CompanyInvoiceLines lines={lines} products={products} vatRate={taxRate} disabled={disabled} amounts={totals.rows} onChange={setLines} onSearchProducts={search} summary={<aside className={css.summary} aria-label="ملخص الفاتورة">{[["المجموع الفرعي", totals.subtotal], ["الخصم", totals.discount], ["الضريبة", totals.tax], ["الإجمالي", totals.total], ["المبلغ المدفوع الآن", paid], ["المتبقي على العميل", outstanding]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(Number(value))} ر س</strong></div>)}</aside>} /></section>
        <div className={css.bottom}><section className={css.card}><h3>السداد</h3><div className={css.metadata}>
          <label>طريقة الدفع<select value={method} onChange={event => { setMethod(event.target.value as typeof method); setAccount(""); setPartial(false); }}>{[["cash", "كاش"], ["pos", "شبكة"], ["bank", "تحويل بنكي"], ["credit", "آجل"]].map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>
          <label>حساب التحصيل<select value={account} disabled={method === "credit"} onFocus={requestOptions} onChange={event => setAccount(event.target.value)}><option value="">{optionsBusy ? "جار جلب الحسابات" : "اختر حساب التحصيل"}</option>{options?.accounts.filter(row => row.active && !row.is_cashier_drawer && row.kind === method).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label>المستودع<select value={warehouse} onFocus={requestOptions} onChange={event => setWarehouse(event.target.value)}><option value="">اختر المستودع</option>{options?.warehouses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          {method !== "credit" && <label className={css.check}><input type="checkbox" checked={partial} onChange={event => setPartial(event.target.checked)} />سداد جزئي والباقي آجل</label>}
          {partial && <label>المبلغ المدفوع<input type="number" min="0.01" step="0.01" max={totals.total} value={cash} onChange={event => setCash(Number(event.target.value))} required /></label>}
        </div>
        {customer && <div className={css.credit}>{credit.loading ? "جار التحقق من إتاحة البيع الآجل" : credit.error || (credit.data?.enabled && !credit.data.overdue ? `المتاح للعميل بالآجل ${money(credit.data.available)} ر س` : "البيع الآجل غير متاح لهذا العميل")}{credit.error && <button type="button" onClick={credit.retry}>إعادة المحاولة</button>}</div>}
        <details><summary>الضريبة والخصم والملاحظات</summary><div className={css.metadata}>
          <label>نسبة الضريبة<input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={event => setTaxRate(Number(event.target.value))} /></label>
          <label>خصم الفاتورة<input type="number" min="0" step="0.01" value={discount} onChange={event => setDiscount(Number(event.target.value))} /></label>
          <label className={css.check}><input type="checkbox" checked={inclusive} onChange={event => setInclusive(event.target.checked)} />الأسعار شاملة الضريبة</label>
        </div><label>ملاحظات اختيارية<textarea value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></label></details></section>
        </div>
      </fieldset>
    </form>
    {customerOpen && <Modal open panelClassName={form.modal} title="إضافة عميل" onClose={() => { if (!pending) setCustomerOpen(false); }}><AldeemCustomerForm pending={pending} error={parentError} onCancel={() => setCustomerOpen(false)} onSubmit={async (_operation, payload) => {
      const saved = await onCreateCustomer(payload);
      if (saved) { setCustomer({ id: String(payload.id), name: String(payload.name), kind: "customer", phone: String(payload.phone || ""), email: String(payload.email || ""), tax_number: String(payload.taxNumber || ""), active: true, balance: 0, details: payload.details as Record<string, string> }); setCustomerOpen(false); }
      return saved;
    }} /></Modal>}
  </>;
}
