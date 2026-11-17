"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Search, Pencil, UsersRound } from "lucide-react";
import { searchAldeemInvoiceCustomers } from "@/app/actions/aldeem-invoice-lookups";
import { executeBrandFinanceAction } from "@/app/actions/brand-finance";
import { AldeemCustomerForm } from "@/components/finance/aldeem-customer-form";
import customerDesign from "@/components/finance/aldeem-customer-form.module.css";
import { Modal } from "./ui/modal";
import type { FinanceParty } from "@/lib/finance/brand-finance";
import styles from "./aldeem-sales-invoices.module.css";
import { readAldeemCustomerAccount } from "@/app/actions/aldeem-pos";
import type { AldeemCustomerAccount } from "@/lib/aldeem/pos";
import { AldeemCustomerAccountView } from "./aldeem-customer-account";

export function AldeemCustomers() {
  const [account, setAccount] = useState<AldeemCustomerAccount | null>(null), [accountLoading, setAccountLoading] = useState(false);
  async function openAccount(id: string) {
    setAccountLoading(true); setError("");
    try { const result = await readAldeemCustomerAccount(id); if (result.ok) setAccount(result.data); else setError(result.message); }
    catch { setError("تعذر قراءة حساب العميل أعد المحاولة"); }
    finally { setAccountLoading(false); }
  }
  const [query, setQuery] = useState("");
  const [request, setRequest] = useState({ query: "", revision: 0 });
  const [rows, setRows] = useState<FinanceParty[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [editing, setEditing] = useState<FinanceParty | "new" | null>(null), [saving, setSaving] = useState(false), [saveError, setSaveError] = useState("");
  const saveIdentity = useRef({ signature: "", id: "" });
  useEffect(() => {
    let current = true;
    setLoading(true); setError("");
    void searchAldeemInvoiceCustomers(request.query).then(result => {
      if (!current) return;
      if (result.ok) setRows(result.data); else setError(result.message);
    }).catch(() => { if (current) setError("تعذر عرض العملاء أعد المحاولة"); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [request]);
  const search = () => setRequest(previous => ({ query: query.trim(), revision: previous.revision + 1 }));
  return <div className={styles.page}>
    <header className={styles.toolbar}><div><h2>عملاء الديم</h2><p>بيانات التواصل والعناوين وسياسة البيع الآجل لكل عميل</p></div><button type="button" className={styles.primary} onClick={() => { setSaveError(""); setEditing("new"); }}><Plus size={17} />إضافة عميل</button></header>
    <div className={styles.filters}><label className={styles.search}><Search size={17} aria-hidden="true" /><input aria-label="البحث عن العميل" placeholder="اسم العميل أو رقمه أو الباركود" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") search(); }} /></label><button type="button" disabled={loading} onClick={search}>بحث</button></div>
    {error && <div role="alert" className={styles.error}>{error}<button type="button" onClick={search}>إعادة المحاولة</button></div>}
    <section className={styles.register} aria-label="عملاء الديم" aria-busy={loading}>
      <div className={styles.tableScroll}><table><thead><tr><th>العميل</th><th>الجوال</th><th>البريد الإلكتروني</th><th>البيع الآجل</th><th>الحد الائتماني</th><th>مدة السداد</th><th>الإجراء</th></tr></thead><tbody>{rows.map(party => <tr key={party.id}>
        <td><strong>{party.name}</strong></td><td dir="ltr">{party.phone || "—"}</td><td>{party.email || "—"}</td><td><span className={party.details?.creditEnabled === "true" ? styles.paid : styles.neutral}>{party.details?.creditEnabled === "true" ? "مفعّل" : "غير مفعّل"}</span></td><td>{party.details?.creditEnabled === "true" ? `${Number(party.details.creditLimit ?? 0).toLocaleString("ar-SA")} ر س` : "—"}</td><td>{party.details?.creditEnabled === "true" ? `${party.details.creditDays ?? 0} يوم` : "—"}</td><td><button type="button" disabled={accountLoading} onClick={() => openAccount(party.id)}>حساب العميل</button><button type="button" onClick={() => { setSaveError(""); setEditing(party); }}><Pencil size={15} />تعديل</button></td>
      </tr>)}</tbody></table></div>
      {!rows.length && <div className={styles.empty}><UsersRound size={28} aria-hidden="true" /><p role="status">{loading ? "جار عرض العملاء" : error ? "تعذر عرض السجل" : "لا توجد نتائج مطابقة"}</p></div>}
      <footer className={styles.footer}>يعرض البحث حتى ٢٠ عميلًا حدّد الاسم أو الرقم للوصول إلى العميل المطلوب</footer>
    </section>
    <Modal open={editing !== null} title={editing === "new" ? "إضافة عميل" : "تعديل العميل"} onClose={() => { if (!saving) setEditing(null); }} panelClassName={customerDesign.dialog}>
      {editing && <AldeemCustomerForm values={editing === "new" ? {} : editing} pending={saving} error={saveError} onCancel={() => { if (!saving) setEditing(null); }} onSaved={id => { setEditing(null); void searchAldeemInvoiceCustomers("", [id]).then(result => { if (result.ok) setRows(previous => [...result.data, ...previous.filter(party => party.id !== id)].slice(0, 20)); }); }} onSubmit={async (operation, payload) => {
        setSaving(true); setSaveError("");
        const signature = JSON.stringify(payload);
        if (saveIdentity.current.signature !== signature) saveIdentity.current = { signature, id: crypto.randomUUID() };
        try { const result = await executeBrandFinanceAction({ operation, payload, requestId: saveIdentity.current.id }, "khayal-aldeem"); if (!result.ok) { setSaveError(result.message); return false; } saveIdentity.current = { signature: "", id: "" }; return true; }
        catch { setSaveError("تعذر تأكيد حفظ العميل أعد المحاولة"); return false; }
        finally { setSaving(false); }
      }} />}
    </Modal>
    {account && <Modal open title="حساب العميل" onClose={() => setAccount(null)} panelClassName={customerDesign.dialog}><AldeemCustomerAccountView account={account} /></Modal>}
  </div>;
}
