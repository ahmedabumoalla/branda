"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, CreditCard, RefreshCw, Search, Wallet } from "lucide-react";
import { readHospitalDebtsAction, collectHospitalDebtAction } from "@/app/actions/hospital-orders";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { HospitalDialog, HospitalField, hospitalText, hospitalMoney, hospitalDate, hospitalFailure, type HospitalLanguage } from "./hospital-ui";
import s from "./hospital-pos.module.css";

export type HospitalDebtCustomer = { id: string; name: string; phone: string; debtorType: string; balance: number; documents: { id: string; number: number; total: number; outstanding: number; createdAt: string }[]; receipts: { id: string; number: number; amount: number; paymentMethod: string; createdAt: string; note: string }[] };

/** This is the same financial customer receivable at the dashboard and at the cashier. */
export function HospitalDebtsPanel({ snapshot, language = "ar", onChanged }: { snapshot: FinanceSnapshot; language?: HospitalLanguage; onChanged?: () => void }) {
  const t = (ar: string, en: string) => hospitalText(language, ar, en);
  const [revision, setRevision] = useState(0), [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState<{ key: string; customers?: HospitalDebtCustomer[]; error?: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null), [amount, setAmount] = useState(""), [method, setMethod] = useState<"cash" | "card">("cash"), [accountId, setAccountId] = useState(""), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState(false);
  const lock = useRef(false), retry = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const key = `${snapshot.cafe.slug}:${revision}`;
  useEffect(() => {
    let alive = true;
    readHospitalDebtsAction(snapshot.cafe.slug).then(result => { if (alive) setLoaded(result.ok ? { key, customers: result.customers } : { key, error: result.error }); }).catch(() => { if (alive) setLoaded({ key, error: "unavailable" }); });
    return () => { alive = false; };
  }, [key, snapshot.cafe.slug]);
  const current = loaded?.key === key ? loaded : null;
  const customers = current?.customers ?? [], selected = customers.find(customer => customer.id === selectedId);
  const shift = snapshot.shifts.find(item => item.user_id === snapshot.userId && item.status === "open" && !item.supervisor_paused);
  const accounts = snapshot.accounts.filter(account => account.active && (method === "card" ? account.kind === "pos" : account.kind === "cash" && (shift ? account.id === shift.account_id : snapshot.role !== "cashier" && !account.is_cashier_drawer)));
  const chosenAccount = accounts.find(account => account.id === accountId) ?? accounts.find(account => account.is_primary) ?? accounts[0];
  const filtered = customers.filter(customer => `${customer.name} ${customer.phone}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  async function collect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !selected) return;
    const value = Number(amount);
    if (!amount || !Number.isFinite(value) || value <= 0 || Math.round(value * 100) / 100 !== value || value > selected.balance || !chosenAccount) { setError(t("أدخل مبلغًا صحيحًا لا يتجاوز المديونية واختر حساب التحصيل", "Enter a valid amount within the balance and select a collection account")); return; }
    const payload = { partyId: selected.id, amount: value, paymentMethod: method, accountId: chosenAccount.id, ...(shift ? { shiftId: shift.id } : {}), note: note.trim() };
    const fingerprint = JSON.stringify(payload);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, requestId: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError(""); setSuccess(false);
    try {
      const result = await collectHospitalDebtAction(snapshot.cafe.slug, { ...payload, requestId: retry.current.requestId });
      if (!result.ok) { setError(hospitalFailure(language, result.error, result.code)); return; }
      retry.current = null; setAmount(""); setNote(""); setSuccess(true); setRevision(value => value + 1); onChanged?.();
    } catch { setError(hospitalFailure(language)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className={s.debts} dir={language === "ar" ? "rtl" : "ltr"} lang={language} aria-label={t("العملاء والمديونيات", "Customers and receivables")}>
    <div className={s.sectionTitle}><div><p>{t("سجل مالي موحد", "One financial ledger")}</p><h2><Wallet size={22} />{t("العملاء والمديونيات", "Customers and receivables")}</h2></div><button type="button" className={s.secondary} onClick={() => setRevision(value => value + 1)} disabled={busy}><RefreshCw size={17} />{t("تحديث", "Refresh")}</button></div>
    <div className={s.debtSummary}><span>{t("إجمالي المديونية", "Total outstanding")}</span><strong>{hospitalMoney(customers.reduce((total, customer) => total + Math.max(0, customer.balance), 0), language)}</strong><small>{customers.filter(customer => customer.balance > 0).length} {t("عميل عليه مستحقات", "customers with a balance")}</small></div>
    <label className={s.search}><Search size={19} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("ابحث باسم الدكتور أو العيادة أو الجوال", "Search doctor, clinic or phone")} aria-label={t("بحث العملاء", "Search customers")} /></label>
    {!current && <p role="status" className={s.empty}>{t("جار تحميل الأرصدة", "Loading balances")}</p>}
    {current?.error && <p className={s.error} role="alert">{hospitalFailure(language, current.error)}</p>}
    {current?.customers && <div className={s.tableWrap}><table className={s.table}><thead><tr><th>{t("العميل", "Customer")}</th><th>{t("الحساب", "Account")}</th><th>{t("الجوال", "Phone")}</th><th>{t("المديونية", "Outstanding")}</th><th>{t("الإجراء", "Action")}</th></tr></thead><tbody>{filtered.map(customer => <tr key={customer.id}><td><strong>{customer.name}</strong></td><td>{customer.debtorType === "clinic" ? t("عيادة", "Clinic") : t("دكتور", "Doctor")}</td><td><bdi>{customer.phone || "—"}</bdi></td><td><strong>{hospitalMoney(customer.balance, language)}</strong></td><td><button type="button" className={s.secondary} onClick={() => { setSelectedId(customer.id); setAmount(""); setError(""); setSuccess(false); }}>{t("السجل والتحصيل", "History and collection")}</button></td></tr>)}</tbody></table>{!filtered.length && <p className={s.empty}>{t("لا يوجد عملاء يطابقون البحث", "No matching customers")}</p>}</div>}
    {selected && <HospitalDialog language={language} title={selected.name} busy={busy} wide close={() => setSelectedId(null)}><div className={s.debtSummary}><span>{t("المديونية الحالية", "Current outstanding")}</span><strong>{hospitalMoney(selected.balance, language)}</strong></div>
      {error && <p role="alert" className={s.error}>{error}</p>}{success && <p role="status" className={s.success}>{t("تم تسجيل التحصيل وتحديث المديونية", "Collection recorded and balance updated")}</p>}
      {selected.balance > 0 && <form onSubmit={collect} className={s.form}><h3>{t("تحصيل المديونية", "Collect payment")}</h3><div className={s.paymentMethods}><button type="button" aria-pressed={method === "cash"} onClick={() => { setMethod("cash"); setAccountId(""); }}><Banknote />{t("كاش", "Cash")}</button><button type="button" aria-pressed={method === "card"} onClick={() => { setMethod("card"); setAccountId(""); }}><CreditCard />{t("شبكة", "Card")}</button></div><div className={s.fields}><HospitalField label={t("المبلغ بالريال", "Amount in SAR")}><input required type="number" min="0.01" max={selected.balance} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} /></HospitalField><HospitalField label={t("حساب التحصيل", "Collection account")}><select value={chosenAccount?.id ?? ""} onChange={event => setAccountId(event.target.value)} disabled={busy}><option value="">{t("اختر الحساب", "Select account")}</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></HospitalField></div><HospitalField label={t("ملاحظة اختيارية", "Optional note")}><input value={note} maxLength={500} onChange={event => setNote(event.target.value)} disabled={busy} /></HospitalField><button className={s.primary} disabled={busy || !chosenAccount}>{busy ? t("جار تسجيل التحصيل", "Recording collection") : t("تأكيد استلام المبلغ", "Confirm payment received")}</button></form>}
      <h3 className={s.subheading}>{t("الفواتير الآجلة", "Credit invoices")}</h3><div className={s.tableWrap}><table className={s.table}><thead><tr><th>{t("الفاتورة", "Invoice")}</th><th>{t("التاريخ", "Date")}</th><th>{t("الإجمالي", "Total")}</th><th>{t("المتبقي", "Outstanding")}</th></tr></thead><tbody>{selected.documents.map(document => <tr key={document.id}><td>#{document.number}</td><td>{hospitalDate(document.createdAt, language)}</td><td>{hospitalMoney(document.total, language)}</td><td>{hospitalMoney(document.outstanding, language)}</td></tr>)}</tbody></table></div>
      <h3 className={s.subheading}>{t("سجل التحصيل", "Collection history")}</h3><div className={s.tableWrap}><table className={s.table}><thead><tr><th>{t("السند", "Receipt")}</th><th>{t("التاريخ", "Date")}</th><th>{t("طريقة السداد", "Payment method")}</th><th>{t("المبلغ", "Amount")}</th><th>{t("البيان", "Note")}</th></tr></thead><tbody>{selected.receipts.map(receipt => <tr key={receipt.id}><td>#{receipt.number}</td><td>{hospitalDate(receipt.createdAt, language)}</td><td>{receipt.paymentMethod === "cash" ? t("كاش", "Cash") : t("شبكة", "Card")}</td><td>{hospitalMoney(receipt.amount, language)}</td><td>{receipt.note}</td></tr>)}</tbody></table>{!selected.receipts.length && <p className={s.empty}>{t("لا توجد تحصيلات مسجلة", "No collections recorded")}</p>}</div>
    </HospitalDialog>}
  </section>;
}
