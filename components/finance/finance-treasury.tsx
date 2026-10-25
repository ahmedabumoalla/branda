"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Archive, ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, Banknote, Building2, CalendarDays, Check, ChevronLeft, CreditCard, Download, History, Plus, RefreshCw, Search, Settings2, ShieldCheck, Wallet } from "lucide-react";
import { Modal } from "@/components/dashboard/ui/modal";
import { executeFinanceTreasuryAction, executeFinanceTreasuryCorrectionAction, fetchFinanceAccountStatementAction, fetchFinanceTreasuryAction, fetchFinanceTreasuryHistoryAction } from "@/app/actions/finance-treasury";
import { getPrimaryFinanceAccount, type FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { TreasuryAccount, TreasuryAudit, TreasuryHistory, TreasuryReconciliation, TreasurySnapshot, TreasuryStatement } from "@/lib/finance/treasury";
import { treasuryVoucherCategories, treasuryExpenseSubcategories } from "@/lib/finance/treasury-vouchers";
import { downloadFinanceCsv, financeDate, Numeric } from "./finance-ui";
import { FinanceTreasuryAttachments } from "./finance-treasury-attachments";
import { TreasuryDraftFiles } from "./finance-treasury-draft-files";
import { FinanceTerminalFees } from "./finance-terminal-fees";
import { FinanceReceiptDialog } from "./finance-receipt-dialog";
import { FinanceCashHandovers } from "./finance-cash-handovers";
import styles from "./finance-treasury.module.css";

type FormKind = "account_save" | "opening" | "voucher" | "transfer" | "pos_settle" | "pos_fee_pay" | "reconcile" | "reverse" | "reset" | "reconcile_adjust";
type FormState = { operation: FormKind; values: Record<string, string>; title: string };
type DocumentSelection = { id: string; number?: number; kind: string; note: string; category?: string; subcategory?: string; costCenter?: string; canReverse?: boolean; createdAt?: string; actor?: string; debit?: number; credit?: number; balance?: number };
type Props = { snapshot: FinanceSnapshot; slug?: string; onRefresh: () => void; initialAccountId?: string; onCloseAccount?: () => void; detailOnly?: boolean };
const groups = [
  { kind: "cash" as const, label: "النقدية والخزائن", single: "خزينة", limit: 3, icon: Wallet, hint: "الرصيد النقدي المحفوظ في الصناديق" },
  { kind: "bank" as const, label: "الحسابات البنكية", single: "حساب بنكي", limit: 5, icon: Building2, hint: "المبالغ المستلمة والمسجلة في البنك" },
  { kind: "pos" as const, label: "نقاط الشبكة", single: "نقطة شبكة", limit: 3, icon: CreditCard, hint: "تحصيلات الشبكة بانتظار التسوية البنكية" },
];
const operationLabels: Record<string, string> = { account_save: "تحديث الحساب", account_primary: "تعيين الحساب الرئيسي", account_archive: "تغيير حالة الحساب", opening: "رصيد افتتاحي", voucher: "سند مالي", transfer: "تحويل داخلي", pos_settle: "تسوية شبكة", pos_fee_pay: "سداد رسوم الشبكة", reconcile: "مطابقة رصيد", reversal: "قيد عكسي", reset: "تصفير موثق" };
const documentLabels: Record<string, string> = { sale: "مبيعات", purchase: "مشتريات", refund: "مرتجع", receipt: "سند قبض", expense: "سند صرف", transfer: "تحويل", opening: "رصيد افتتاحي", pos_settle: "تسوية شبكة", pos_fee_pay: "سداد رسوم الشبكة", settlement: "سداد", journal: "قيد محاسبي", reversal: "قيد عكسي" };
const message = (error: unknown) => error instanceof Error ? error.message : "تعذر إتمام الطلب أعد المحاولة";
const amount = (value: string | undefined) => Number(value || 0);
const accountLabel = (account?: TreasuryAccount) => account
  ? [...new Set([account.kind === "bank" ? account.bank_name?.trim() : "", account.name.trim()].filter(Boolean))].join(" — ")
  : "";
const accountCaption = (account: FinanceSnapshot["accounts"][number]) => account.code.startsWith("T-")
  ? ({ cash: "خزينة نقدية", bank: "حساب بنكي", pos: "نقطة شبكة" }[account.kind as "cash" | "bank" | "pos"] ?? "حساب مالي")
  : `حساب ${account.code}`;

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className={styles.field}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function Balance({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return <div className={highlight ? styles.balanceHighlight : styles.balance}><span>{label}</span><strong><Numeric value={value} money /></strong></div>;
}
function FormSection({ title, hint, children, icon }: { title: string; hint?: string; children: ReactNode; icon?: ReactNode }) {
  return <section className={styles.formSection} aria-label={title}><header className={styles.sectionHeading}>{icon && <span aria-hidden="true">{icon}</span>}<div><h3>{title}</h3>{hint && <p>{hint}</p>}</div></header><div className={styles.sectionContent}>{children}</div></section>;
}

/** Treasury views are local state transitions; only their data is fetched. */
export function FinanceTreasury({ snapshot, slug, onRefresh, initialAccountId, onCloseAccount, detailOnly = false }: Props) {
  const [data, setData] = useState<TreasurySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stale, setStale] = useState(false);
  const [selected, setSelected] = useState<string | null>(initialAccountId ?? null);
  const [tab, setTab] = useState<"statement" | "fees" | "reconciliations" | "audit" | "settings">("statement");
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [statement, setStatement] = useState<TreasuryStatement | null>(null);
  const [statementBusy, setStatementBusy] = useState(false);
  const [statementError, setStatementError] = useState("");
  const [period, setPeriod] = useState({ from: "", to: "" });
  const [appliedPeriod, setAppliedPeriod] = useState({ from: "", to: "" });
  const [offset, setOffset] = useState(0);
  const [history, setHistory] = useState<(TreasuryHistory & { accountId: string; kind: string; offset: number }) | null>(null);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyRetry, setHistoryRetry] = useState(0);
  const [form, setForm] = useState<FormState | null>(null);
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [documentFiles, setDocumentFiles] = useState<{ id: string; files: File[] } | null>(null);
  const [document, setDocument] = useState<DocumentSelection | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [handoverReceiptOpen, setHandoverReceiptOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const statementSequence = useRef(0);
  const accounts: TreasuryAccount[] = data?.accounts ?? snapshot.accounts.map((account) => ({ ...account, linked_bank_id: null, opening_recorded_at: null, opening_amount: null, bank_name: "", iban: "", terminal_id: "" }));
  const selectedAccount = accounts.find((account) => account.id === selected);
  const active = accounts.filter((account) => account.active);
  const liquid = active.filter((account) => ["cash", "bank"].includes(account.kind));
  const preferredAccount = (kind: TreasuryAccount["kind"], choices = active) => getPrimaryFinanceAccount(choices, kind);
  const editable = snapshot.canManage && !!data && !loading && !pending && !stale;
  const effectiveSlug = slug ?? snapshot.cafe.slug;
  const archiveReasons = selectedAccount?.active ? [
    selectedAccount.is_cashier_drawer ? "صندوق الكاشير مخصص للورديات ولا يمكن أرشفته" : "",
    selectedAccount.is_primary ? "عيّن حسابًا آخر رئيسيًا من نفس النوع قبل الأرشفة" : "",
    Math.abs(selectedAccount.balance) > .009 ? "حوّل الرصيد المتبقي إلى حساب آخر قبل الأرشفة" : "",
    snapshot.shifts.some((shift) => shift.account_id === selectedAccount.id && ["open", "handover"].includes(shift.status)) ? "أغلق الوردية المرتبطة بهذا الحساب أو أكمل تسليمها" : "",
    active.some((account) => account.linked_bank_id === selectedAccount.id) ? "انقل نقاط الشبكة المرتبطة إلى حساب بنكي آخر" : "",
    (selectedAccount.fees_due ?? 0) > 0 ? "سدّد رسوم الشبكة المستحقة قبل الأرشفة" : "",
  ].filter(Boolean) : [];

  const refresh = useCallback(async () => {
    setLoading(true);
    try { const result = await fetchFinanceTreasuryAction(slug); if (!result.ok) throw new Error(result.message); setData(result.data); setError(""); setStale(false); }
    catch (cause) { setError(message(cause)); setStale(true); }
    finally { setLoading(false); }
  }, [slug]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (initialAccountId) { setSelected(initialAccountId); setTab("statement"); } }, [initialAccountId]);

  const loadStatement = useCallback(async (accountId: string, page: number, dates: typeof period) => {
    const sequence = ++statementSequence.current;
    setStatementBusy(true); setStatementError("");
    try {
      const result = await fetchFinanceAccountStatementAction(accountId, { offset: page, from: dates.from || undefined, to: dates.to || undefined }, slug);
      if (!result.ok) throw new Error(result.message);
      if (sequence === statementSequence.current) setStatement(result.data);
    } catch (cause) { if (sequence === statementSequence.current) { setStatementError(message(cause)); setStatement(null); } }
    finally { if (sequence === statementSequence.current) setStatementBusy(false); }
  }, [slug]);
  useEffect(() => {
    if (!selected) return;
    const sequence = statementSequence;
    setStatement(null);
    void loadStatement(selected, offset, appliedPeriod);
    return () => { sequence.current++; };
  }, [selected, offset, appliedPeriod, loadStatement]);
  useEffect(() => {
    if (!selected || (tab !== "audit" && tab !== "reconciliations")) return;
    let current = true;
    setHistoryBusy(true); setHistoryError("");
    void fetchFinanceTreasuryHistoryAction(selected, tab, historyOffset, slug).then((result) => {
      if (!result.ok) throw new Error(result.message);
      if (current) setHistory({ ...result.data, accountId: selected, kind: tab, offset: historyOffset });
    }).catch((cause) => { if (current) setHistoryError(message(cause)); }).finally(() => { if (current) setHistoryBusy(false); });
    return () => { current = false; };
  }, [selected, tab, historyOffset, historyRetry, slug, data]);

  const openAccount = (id: string) => { setSelected(id); setOffset(0); setPeriod({ from: "", to: "" }); setAppliedPeriod({ from: "", to: "" }); setTab("statement"); setError(""); };
  const close = () => { if (pending) return; if (form) { setForm(null); setError(""); return; } if (document) { setDocument(null); return; } setSelected(null); onCloseAccount?.(); };
  const openForm = (operation: FormKind, title: string, values: Record<string, string> = {}) => {
    setError(""); setNotice("");
    setDraftFiles([]);
    const choices = ["pos_settle", "pos_fee_pay"].includes(operation) ? active.filter((account) => account.kind === "pos") : ["opening", "reconcile"].includes(operation) ? active.filter((account) => ["cash", "bank", "pos"].includes(account.kind)) : liquid;
    const defaultAccount = choices.find((account) => account.id === selectedAccount?.id) ?? preferredAccount("cash", choices) ?? preferredAccount("bank", choices) ?? preferredAccount("pos", choices);
    const accountId = values.accountId ?? defaultAccount?.id ?? "";
    const destinationChoices = liquid.filter((account) => account.id !== accountId);
    const destination = preferredAccount(accounts.find((account) => account.id === accountId)?.kind === "cash" ? "bank" : "cash", destinationChoices) ?? destinationChoices.find((account) => account.is_primary) ?? destinationChoices[0];
    setForm({ operation, title, values: { accountId, note: "", ...(operation === "transfer" ? { toAccountId: destination?.id ?? "" } : {}), ...values } });
  };
  const setValue = (key: string, value: string) => setForm((current) => current && ({ ...current, values: { ...current.values, [key]: value } }));

  const execute = async (operation: string, payload: Record<string, unknown>) => {
    if (busy.current || !editable) return false;
    busy.current = true; setPending(true); setError(""); setNotice("");
    const fingerprint = JSON.stringify({ operation, payload });
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const correction = ["reverse", "reset", "reconcile_adjust"].includes(operation);
      const result = await (correction ? executeFinanceTreasuryCorrectionAction : executeFinanceTreasuryAction)(operation, payload, request.current.id, slug);
      if (!result.ok) throw new Error(result.message);
      request.current = null; setForm(null); setNotice(operation === "account_primary" ? "تم تعيين الحساب الرئيسي لهذا القسم" : "تم حفظ العملية وتحديث سجل الخزينة");
      if (operation === "voucher" && result.data.id) setDocumentFiles({ id: result.data.id, files: draftFiles });
      if (["voucher", "transfer", "pos_settle", "pos_fee_pay", "opening"].includes(operation) && result.data.id) setDocument({ id: result.data.id, number: result.data.number, kind: operation === "voucher" ? String(payload.kind) : operation, note: String(payload.note ?? ""), category: String(payload.category ?? ""), subcategory: String(payload.subcategory ?? ""), costCenter: String(payload.costCenter ?? ""), canReverse: true });
      if (operation === "account_save") {
        setSelected(result.data.id); setTab("statement"); setOffset(0);
        if (result.data.document_id) setDocument({ id: result.data.document_id, number: result.data.number, kind: "opening", note: String(payload.note ?? ""), canReverse: false });
      }
      if (operation === "reverse") setDocument(null);
      try {
        const updated = await fetchFinanceTreasuryAction(slug); if (!updated.ok) throw new Error(updated.message); setData(updated.data);
        if (selected) await loadStatement(selected, offset, appliedPeriod);
        onRefresh();
      } catch { setStale(true); setError("تم حفظ العملية لكن تعذر تحديث الأرصدة حدّث البيانات قبل تسجيل عملية أخرى"); }
      return true;
    } catch (cause) { setError(message(cause)); return false; }
    finally { busy.current = false; setPending(false); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!form) return;
    const values = form.values;
    const payload: Record<string, unknown> = { ...values };
    if (["reverse", "reset", "reconcile_adjust"].includes(form.operation)) { payload.reason = values.note; delete payload.note; delete payload.accountId; if (form.operation === "reset") { payload.accountId = values.accountId; payload.expectedBalance = accounts.find((account) => account.id === values.accountId)?.balance; } }
    for (const key of ["amount", "fee", "countedAmount", "openingAmount", "transactionFeePercent", "monthlySubscription", "monthlyDueDay", "feeVatRate", "feesDeducted"]) {
      if (values[key] !== undefined && values[key] !== "") payload[key] = amount(values[key]); else delete payload[key];
    }
    if (form.operation === "reconcile") payload.expectedBalance = accounts.find((account) => account.id === values.accountId)?.balance;
    if (form.operation === "account_save") {
      delete payload.accountId;
      if (values.kind !== "pos") delete payload.linkedBankId;
      for (const key of ["id", "linkedBankId"]) if (!payload[key]) delete payload[key];
    }
    if (form.operation === "voucher" && values.category) {
      delete payload.counterAccountId;
      if (values.category !== "operating_expense") delete payload.subcategory;
    }
    if (form.operation === "pos_settle" && values.feeTreatment === "gross") payload.feesDeducted = 0;
    await execute(form.operation, payload);
  };
  const input = (key: string, required = false, type = "text", min?: string) => <input name={key} value={form?.values[key] ?? ""} onChange={(event) => setValue(key, event.target.value)} type={type} required={required} min={min} step={type === "number" ? "0.01" : undefined} inputMode={type === "number" ? "decimal" : undefined} maxLength={type === "text" ? 160 : undefined} dir={type === "number" ? "ltr" : undefined} />;
  const selectAccount = (key: string, choices: TreasuryAccount[], label: string) => <Field label={label}><select required name={key} value={form?.values[key] ?? ""} onChange={(event) => setValue(key, event.target.value)}><option value="">اختر الحساب</option>{choices.map((account) => <option value={account.id} key={account.id}>{accountLabel(account)}</option>)}</select></Field>;
  const accountForForm = accounts.find((account) => account.id === form?.values.accountId);
  const linkedBank = accounts.find((account) => account.id === accountForForm?.linked_bank_id);
  const currentHistory = history?.accountId === selected && history.kind === tab && history.offset === historyOffset ? history : null;
  const matching = (currentHistory?.rows ?? []).filter((entry): entry is TreasuryReconciliation => "variance" in entry);
  const audit = (currentHistory?.rows ?? []).filter((entry): entry is TreasuryAudit => "operation" in entry);
  const historyStatus = historyBusy ? <div className={styles.loading} role="status">جارٍ تحميل السجل</div> : historyError ? <div className={styles.error} role="alert">{historyError}<button className={styles.secondary} onClick={() => setHistoryRetry((value) => value + 1)}>إعادة المحاولة</button></div> : null;
  const historyPagination = currentHistory && !historyBusy && !historyError && <div className={styles.pagination}><span>{currentHistory.total ? `${historyOffset + 1}–${historyOffset + currentHistory.rows.length} من ${currentHistory.total} سجل` : "لا توجد سجلات"}</span><div className={styles.actions}><button className={styles.secondary} disabled={historyOffset === 0} onClick={() => setHistoryOffset(Math.max(0, historyOffset - 100))}>السابق</button><button className={styles.secondary} disabled={historyOffset + currentHistory.rows.length >= currentHistory.total} onClick={() => setHistoryOffset(historyOffset + currentHistory.rows.length)}>التالي<ArrowLeft size={15} /></button></div></div>;
  const liquidSelected = selectedAccount && ["cash", "bank", "pos"].includes(selectedAccount.kind);
  const correctionForm = form && ["reverse", "reset", "reconcile_adjust"].includes(form.operation);
  const availableTabs = liquidSelected ? ["statement", ...(selectedAccount && ["bank", "pos"].includes(selectedAccount.kind) ? ["fees"] : []), "reconciliations", "audit", "settings"] : ["statement", "audit"];
  const invoiceDocument = document && snapshot.documents.find((entry) => entry.id === document.id);
  const attachmentDocument = document && ["receipt", "expense", "transfer", "opening", "journal", "pos_settle", "pos_fee_pay"].includes(document.kind);

  return <div className={styles.root} dir="rtl">
    {!detailOnly && <>
    <div className={styles.heading}><div><span className={styles.eyebrow}><Wallet size={16} aria-hidden="true" /> إدارة الأرصدة</span><h2>الخزينة الرئيسية</h2><p>كل حساب مستقل برصيده وحركاته ومطابقاته</p></div><button className={styles.secondary} disabled={loading || pending} onClick={() => { void refresh(); onRefresh(); }}><RefreshCw size={16} aria-hidden="true" />{loading ? "جارٍ التحديث" : "تحديث الأرصدة"}</button></div>
    {error && !form && <div className={styles.error} role="alert">{error}</div>}
    {notice && <div className={styles.success} role="status"><Check size={17} aria-hidden="true" />{notice}</div>}
    <div className={styles.summary}>
      <Balance label="النقدية في الخزائن" value={active.filter((account) => account.kind === "cash").reduce((sum, account) => sum + account.balance, 0)} />
      <Balance label="الأرصدة البنكية" value={active.filter((account) => account.kind === "bank").reduce((sum, account) => sum + account.balance, 0)} />
      <Balance label="الشبكة بانتظار التسوية" value={active.filter((account) => account.kind === "pos").reduce((sum, account) => sum + account.balance, 0)} />
    </div>
    <div className={styles.toolbar}><div className={styles.actions}>
      <button className={styles.primary} disabled={!editable} onClick={() => openForm("voucher", "سند قبض", { kind: "receipt", amount: "" })}><ArrowDownLeft size={17} aria-hidden="true" /> سند قبض</button>
      <button className={styles.secondary} disabled={!editable} onClick={() => openForm("voucher", "سند صرف", { kind: "expense", amount: "" })}><ArrowUpRight size={17} aria-hidden="true" /> سند صرف</button>
      <button className={styles.secondary} disabled={!editable} onClick={() => openForm("transfer", "تحويل بين الحسابات", { amount: "" })}><ArrowLeftRight size={17} aria-hidden="true" /> تحويل داخلي</button>
    </div><label className={styles.search}><Search size={16} aria-hidden="true" /><input aria-label="البحث عن حساب" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن حساب" /></label></div>
    <label className={styles.checkbox}><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />إظهار الحسابات المؤرشفة</label>
    <div className={styles.groups} aria-busy={loading}>
      {groups.map((group) => {
        const count = active.filter((account) => account.kind === group.kind && !account.is_cashier_drawer).length;
        const rows = accounts.filter((account) => account.kind === group.kind && (showArchived || account.active) && `${account.name} ${account.code}`.includes(query.trim()));
        return <section className={styles.group} key={group.kind}><header><div className={styles.groupName}><group.icon size={20} aria-hidden="true" /><h3>{group.label}</h3><span>{count} / {group.limit}</span></div><p>{group.hint}</p></header>
          <div className={styles.accounts}>{rows.map((account) => <div className={styles.accountCard} key={account.id}><button className={styles.account} onClick={() => openAccount(account.id)} aria-label={`عرض حساب ${account.name}`}><div><div className={styles.accountName}><strong>{account.name}</strong>{account.is_cashier_drawer && <span className={styles.primaryBadge}>صندوق الكاشير</span>}{account.active && account.is_primary && <span className={styles.primaryBadge}><Check size={12} aria-hidden="true" />رئيسي</span>}</div><small>{account.kind === "pos" ? accountLabel(accounts.find((bank) => bank.id === account.linked_bank_id)) || "يحتاج ربطًا بحساب بنكي" : account.bank_name || accountCaption(account)}</small></div><div className={styles.accountAmount}><strong><Numeric value={account.balance} money /></strong><small>{!account.active ? "مؤرشف" : account.opening_recorded_at ? "الرصيد الحالي" : "الرصيد الافتتاحي غير مسجل"}</small></div><ChevronLeft size={18} aria-hidden="true" /></button>{account.active && !account.is_primary && !account.is_cashier_drawer && <div className={styles.accountCardActions}><button className={styles.setPrimary} type="button" disabled={!editable} aria-label={`تعيين ${account.name} كرئيسي`} onClick={() => void execute("account_primary", { accountId: account.id })}>تعيين كرئيسي</button></div>}</div>)}{rows.length === 0 && <div className={styles.empty}>{loading ? "جارٍ تحميل الحسابات" : "لا توجد حسابات مطابقة"}</div>}</div>
          <footer><button className={styles.add} disabled={!editable || count >= group.limit} onClick={() => openForm("account_save", `إضافة ${group.single}`, { kind: group.kind, name: "", openingAmount: "0", ...(group.kind === "pos" ? { linkedBankId: preferredAccount("bank")?.id ?? "" } : {}) })}><Plus size={16} aria-hidden="true" />إضافة {group.single}</button><small>{count >= group.limit ? "وصلت للعدد المتاح" : `الأساسي واحد ويمكن إضافة حتى ${group.limit}`}</small></footer>
        </section>;
      })}
    </div>
    <div className={styles.note}><ShieldCheck size={19} aria-hidden="true" /><p>الأرصدة تتغير بالمستندات المسجلة فقط وتبقى الحركات محفوظة بعد أرشفة الحساب التصحيح والتصفير من صلاحيات أدمن برندة عبر الدخول بالنيابة</p></div>
    </>}

    <Modal open={!receiptOpen && !handoverReceiptOpen && (!!selected || !!form || !!document)} title={form?.title ?? (document ? `مستند ${document.number ? `#${document.number}` : "الخزينة"}` : selectedAccount?.name ?? "كشف الحساب")} onClose={close} panelClassName={`${styles.dialog} ${form ? styles.formDialog : ""}`}>
      <div className={styles.root}>
        {form ? <form className={styles.form} onSubmit={submit}>
          {error && <div className={styles.error} role="alert">{error}</div>}
          {form.operation === "voucher" && form.values.kind === "receipt" && <div className={styles.note}><Wallet size={19} aria-hidden="true" /><div><p>هل المبلغ تسليم نقدية من وردية كاشير؟</p><button type="button" className={styles.secondary} disabled={!editable} onClick={() => setHandoverReceiptOpen(true)}>استيراد تسليم وردية</button></div></div>}
          <fieldset disabled={pending} className={styles.fieldset}>
            {correctionForm ? <FormSection title="مراجعة التصحيح" hint="إجراء موثق بصلاحية أدمن برندة" icon={<ShieldCheck size={19} />}><div className={styles.error}>{form.operation === "reverse" ? "سيُسجل قيد عكسي مرتبط بالمستند الأصلي وتبقى الحركات السابقة محفوظة" : form.operation === "reset" ? "سيُصفّر رصيد هذا الحساب بقيد تصحيح موثق دون حذف السجل السابق" : "سيُسجل قيد تسوية لفرق المطابقة مع حفظ بيانات الجرد الأصلية"}</div><label className={styles.checkbox}><input required type="checkbox" />راجعت البيانات وأؤكد تنفيذ التصحيح بصفتي أدمن برندة</label></FormSection> : form.operation === "account_save" ? <>
              <FormSection title={form.values.kind === "pos" ? "نقطة الشبكة وحساب الإيداع" : "بيانات الحساب"} hint={form.values.kind === "pos" ? "تُربط تحصيلات هذا الجهاز بالحساب البنكي المحدد" : "اسم واضح لتمييز الحساب في الحركات والتقارير"} icon={form.values.kind === "pos" ? <CreditCard size={19} /> : form.values.kind === "bank" ? <Building2 size={19} /> : <Wallet size={19} />}>
                <div className={styles.formGrid}>
                  <Field label="اسم الحساب">{input("name", true)}</Field>
                  {form.values.kind === "pos" && <Field label="رقم جهاز الشبكة اختياري">{input("terminalId")}</Field>}
                  {form.values.kind === "bank" && <Field label="اسم البنك اختياري">{input("bankName")}</Field>}
                  {form.values.kind === "bank" && <div className={styles.fullWidth}><Field label="الآيبان اختياري">{input("iban")}</Field></div>}
                  {form.values.kind === "pos" && <div className={styles.fullWidth}>{selectAccount("linkedBankId", active.filter((account) => account.kind === "bank"), "الحساب البنكي المرتبط")}</div>}
                  {!form.values.id && <Field label="الرصيد الافتتاحي" hint={form.values.kind === "pos" ? "تحصيلات الشبكة التي لم تصل إلى البنك بعد" : "يسجل مرة واحدة بقيمة الرصيد الفعلي"}>{input("openingAmount", true, "number", "0")}</Field>}
                </div>
              </FormSection>
              {form.values.kind === "pos" && <>
                <div className={styles.sectionColumns}>
                  <FormSection title="الاشتراك والاستحقاق" hint="يُحتسب عند حلول اليوم المحدد من كل شهر" icon={<CalendarDays size={19} />}>
                    <Field label="الاشتراك الشهري اختياري" hint="بالريال قبل ضريبة الرسوم">{input("monthlySubscription", false, "number", "0")}</Field>
                    <Field label="يوم استحقاق الاشتراك من كل شهر" hint="الأيام غير الموجودة في الشهر تستحق في آخر يوم منه"><select name="monthlyDueDay" required={amount(form.values.monthlySubscription) > 0} value={form.values.monthlyDueDay ?? ""} onChange={(event) => setValue("monthlyDueDay", event.target.value)}><option value="">اختر يوم الاستحقاق</option>{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>اليوم {day}</option>)}</select></Field>
                  </FormSection>
                  <FormSection title="العمولة والضريبة" hint="تُحسب على تحصيلات العلامة" icon={<Banknote size={19} />}>
                    <Field label="عمولة العملية % اختياري" hint="نسبة من قيمة كل عملية عبر هذا الجهاز">{input("transactionFeePercent", false, "number", "0")}</Field>
                    <Field label="ضريبة الرسوم % اختياري" hint="تطبق على العمولة والاشتراك فقط">{input("feeVatRate", false, "number", "0")}</Field>
                  </FormSection>
                </div>
                <div className={styles.feePreview} aria-live="polite"><div><span>الاشتراك الشهري شامل الضريبة</span><strong><Numeric value={Math.round(amount(form.values.monthlySubscription) * (1 + amount(form.values.feeVatRate) / 100) * 100) / 100} money /></strong></div><p>تبقى الرسوم مستحقة حتى يخصمها البنك فعليًا<br />فاتورة العميل والرسوم السابقة لا تتغير</p></div>
              </>}
            </> : <>
              <div className={styles.accountContext}>
              {selectAccount("accountId", ["pos_settle", "pos_fee_pay"].includes(form.operation) ? active.filter((account) => account.kind === "pos") : form.operation === "opening" ? active.filter((account) => !account.opening_recorded_at && ["cash", "bank", "pos"].includes(account.kind)) : form.operation === "reconcile" ? active.filter((account) => ["cash", "bank", "pos"].includes(account.kind)) : liquid, form.operation === "transfer" ? "التحويل من" : "الحساب")}
              {accountForForm && <Balance label="الرصيد المسجل حاليًا" value={accountForForm.balance} />}
              </div>
              <FormSection title={form.operation === "voucher" ? "تفاصيل السند" : form.operation === "transfer" ? "تفاصيل التحويل" : form.operation === "reconcile" ? "الجرد والمطابقة" : form.operation === "opening" ? "بداية رصيد الحساب" : "تفاصيل التسوية البنكية"} icon={form.operation === "transfer" ? <ArrowLeftRight size={19} /> : form.operation === "reconcile" ? <Check size={19} /> : <Banknote size={19} />}>
              <div className={styles.transactionFields}>
              {form.operation === "transfer" && selectAccount("toAccountId", liquid.filter((account) => account.id !== form.values.accountId), "التحويل إلى")}
              {form.operation === "voucher" && <><Field label="تصنيف السند"><select name="category" required value={form.values.category ?? ""} onChange={(event) => setValue("category", event.target.value)}><option value="">اختر التصنيف</option>{treasuryVoucherCategories.filter((item) => item.kind === form.values.kind).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>{form.values.category === "operating_expense" && <Field label="نوع المصروف اختياري"><select name="subcategory" value={form.values.subcategory ?? ""} onChange={(event) => setValue("subcategory", event.target.value)}><option value="">اختر نوع المصروف</option>{treasuryExpenseSubcategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>}<Field label={form.values.kind === "expense" ? "مركز التكلفة اختياري" : "مركز النشاط اختياري"} hint="مثل الفرع أو الإدارة للاستفادة منه في التقارير">{input("costCenter")}</Field><div className={styles.note}>يحدد التصنيف الحساب المحاسبي تلقائيًا تمويل المالك ليس إيرادًا ومسحوباته ليست مصروفًا تشغيليًا سداد الفواتير يُسجّل من الفاتورة الأصلية</div></>}
              {form.operation === "reconcile" ? <><Field label={accountForForm?.kind === "cash" ? "النقدية المعدودة فعليًا" : "الرصيد حسب الكشف"}>{input("countedAmount", true, "number", "0")}</Field><Balance label="فرق المطابقة" value={Math.round((amount(form.values.countedAmount) - (accountForForm?.balance ?? 0)) * 100) / 100} /><div className={styles.note}>تسجل المطابقة الفرق للمراجعة وتحافظ على الرصيد الدفتري دون تغييره</div></> : <Field label={form.operation === "pos_settle" ? "إجمالي الدفعة قبل الرسوم" : form.operation === "opening" ? "قيمة الرصيد الافتتاحي" : "المبلغ"}>{input("amount", true, "number", form.operation === "opening" ? "0" : "0.01")}</Field>}
              {form.operation === "pos_settle" && <>
                <div className={styles.note}>حساب الإيداع {accountLabel(linkedBank) || "الحساب البنكي المرتبط"} سجّل الخصم الفعلي حسب كشف البنك دون إعادة تسجيل المصروف أو ضريبته</div>
                <Field label="طريقة إيداع البنك"><select name="feeTreatment" value={form.values.feeTreatment ?? "net"} onChange={(event) => setValue("feeTreatment", event.target.value)}><option value="net">الإيداع بعد خصم الرسوم</option><option value="gross">الإيداع كامل والرسوم لم تُخصم بعد</option></select></Field>
                <Balance label="الرسوم المستحقة شامل ضريبتها" value={accountForForm?.fees_due ?? 0} />
                <div className={styles.formGrid}>{form.values.feeTreatment !== "gross" && <Field label="الرسوم المخصومة فعليًا" hint="شامل ضريبة الرسوم حسب كشف البنك">{input("feesDeducted", true, "number", "0")}</Field>}<Field label="مرجع التسوية">{input("reference", true)}</Field></div>
                <Balance highlight label="الإيداع الفعلي في البنك" value={Math.round((amount(form.values.amount) - (form.values.feeTreatment === "gross" ? 0 : amount(form.values.feesDeducted))) * 100) / 100} />
              </>}
              {form.operation === "pos_fee_pay" && <><div className={styles.note}>يسجل الخصم الفعلي من {accountLabel(linkedBank) || "الحساب البنكي المرتبط"} لسداد رسوم هذه النقطة دون تكرار المصروف</div><Balance label="الرسوم المستحقة شامل ضريبتها" value={accountForForm?.fees_due ?? 0} /><Field label="مرجع خصم البنك">{input("reference", true)}</Field></>}
              </div>
              </FormSection>
            </>}
            <div className={styles.memoField}><Field label={form.operation === "account_save" ? "ملاحظة اختيارية" : "البيان وسبب العملية"}><textarea name="note" required={form.operation !== "account_save"} maxLength={1000} value={form.values.note ?? ""} onChange={(event) => setValue("note", event.target.value)} rows={2} /></Field></div>
            {form.operation === "voucher" && <TreasuryDraftFiles files={draftFiles} onChange={setDraftFiles} disabled={pending} />}
          </fieldset>
          <div className={styles.formFooter}><span className={styles.footerContext}>{correctionForm ? "يُحفظ التصحيح في سجل الإجراءات" : form.operation === "account_save" ? "تُحفظ الإعدادات لهذا الحساب فقط" : "تُحدّث الأرصدة بعد حفظ المستند"}</span><div className={styles.actions}><button className={styles.primary} type="submit" disabled={!editable || (!!correctionForm && !data?.canCorrect) || (form.operation === "pos_settle" && (!linkedBank || (form.values.feeTreatment !== "gross" && amount(form.values.feesDeducted) > amount(form.values.amount))))}>{pending ? "جارٍ الحفظ" : correctionForm ? "تأكيد التصحيح" : "حفظ العملية"}</button><button className={styles.secondary} type="button" disabled={pending} onClick={close}>إلغاء</button></div></div>
        </form> : document ? <div className={styles.document}>
          {notice && <div className={styles.success} role="status">{notice}</div>}
          {error && <div className={styles.error} role="alert">{error}</div>}
          <div className={styles.toolbar}><div><span className={styles.eyebrow}>{documentLabels[document.kind] ?? "مستند مالي"}</span><p>{document.note || "لا يوجد بيان إضافي"}</p></div><button className={styles.secondary} onClick={close}>العودة لكشف الحساب<ArrowLeft size={16} /></button></div>
          {document.createdAt && <div className={styles.documentMeta}><span>التاريخ <strong>{financeDate(document.createdAt)}</strong></span><span>مسجل العملية <strong>{document.actor || "—"}</strong></span><span>الحساب <strong>{selectedAccount?.name ?? "—"}</strong></span></div>}
          {document.debit !== undefined && <div className={styles.summary}><Balance label="الوارد لهذا الحساب" value={document.debit} /><Balance label="الصادر من هذا الحساب" value={document.credit ?? 0} /><Balance label="الرصيد بعد الحركة" value={document.balance ?? 0} /></div>}
          {(document.category || document.costCenter) && <div className={styles.documentMeta}><span>التصنيف <strong>{treasuryVoucherCategories.find((item) => item.value === document.category)?.label ?? "—"}</strong></span>{document.subcategory && <span>نوع المصروف <strong>{treasuryExpenseSubcategories.find((item) => item.value === document.subcategory)?.label ?? document.subcategory}</strong></span>}{document.costCenter && <span>مركز التكلفة أو النشاط <strong>{document.costCenter}</strong></span>}</div>}
          {attachmentDocument ? <FinanceTreasuryAttachments slug={effectiveSlug} documentId={document.id} initialFiles={documentFiles?.id === document.id ? documentFiles.files : undefined} onInitialFilesUploaded={() => setDocumentFiles(null)} readOnly={!snapshot.canManage} /> : invoiceDocument ? <button className={styles.secondary} onClick={() => setReceiptOpen(true)}>عرض الفاتورة وطباعتها</button> : <div className={styles.note}>هذه حركة مرتبطة بمستند خارج الخزينة يمكنك الرجوع إلى قسم المبيعات أو المشتريات لعرض تفاصيل المستند الأصلي</div>}
          {data?.canCorrect && document.canReverse && <div className={styles.note}><ShieldCheck size={19} /><div><p>التصحيح يسجل قيدًا عكسيًا ويحفظ المستند الأصلي والمرفقات</p><button className={styles.secondary} disabled={!editable} onClick={() => openForm("reverse", "عكس مستند الخزينة", { documentId: document.id })}>عكس المستند</button></div></div>}
        </div> : selectedAccount ? <>
          <div className={styles.accountHeading}><div><span className={styles.eyebrow}>{accountCaption(selectedAccount)}</span><p>{selectedAccount.kind === "pos" ? `التسوية إلى ${accountLabel(accounts.find((bank) => bank.id === selectedAccount.linked_bank_id)) || "بنك غير محدد"}` : selectedAccount.bank_name || "سجل حركات الحساب"}</p></div><Balance highlight label="الرصيد الحالي" value={selectedAccount.balance} /></div>
          {error && <div className={styles.error} role="alert">{error}</div>}
          <div className={styles.tabs} role="tablist" aria-label="تفاصيل الحساب">{([{ id: "statement", label: "كشف الحركة", icon: Banknote }, { id: "fees", label: "رسوم الشبكة", icon: CreditCard }, { id: "reconciliations", label: "مطابقة الرصيد", icon: Check }, { id: "audit", label: "سجل الإجراءات", icon: History }, { id: "settings", label: "إعدادات الحساب", icon: Settings2 }] as const).filter((item) => availableTabs.includes(item.id)).map((item) => <button type="button" role="tab" id={`treasury-tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`treasury-panel-${item.id}`} key={item.id} className={tab === item.id ? styles.activeTab : styles.tab} onClick={() => { setTab(item.id); setHistoryOffset(0); }}><item.icon size={16} aria-hidden="true" />{item.label}</button>)}</div>
          <section role="tabpanel" id={`treasury-panel-${tab}`} aria-labelledby={`treasury-tab-${tab}`} className={styles.detailPanel}>
          {tab === "statement" && <>
            <div className={styles.actions}>{selectedAccount.active && ["cash", "bank"].includes(selectedAccount.kind) && <><button className={styles.secondary} disabled={!editable} onClick={() => openForm("voucher", "سند قبض", { kind: "receipt" })}><ArrowDownLeft size={16} />قبض</button><button className={styles.secondary} disabled={!editable} onClick={() => openForm("voucher", "سند صرف", { kind: "expense" })}><ArrowUpRight size={16} />صرف</button><button className={styles.secondary} disabled={!editable} onClick={() => openForm("transfer", "تحويل بين الحسابات")}><ArrowLeftRight size={16} />تحويل</button></>}{selectedAccount.active && selectedAccount.kind === "pos" && <><button className={styles.primary} disabled={!editable || !selectedAccount.linked_bank_id} onClick={() => openForm("pos_settle", "تسوية تحصيلات الشبكة", { feeTreatment: "net", amount: String(Math.max(0, selectedAccount.balance)), feesDeducted: String(Math.min(Math.max(0, selectedAccount.balance), selectedAccount.fees_due ?? 0)), accountId: selectedAccount.id })}><Building2 size={16} />تسجيل تسوية بنكية</button><button className={styles.secondary} disabled={!editable || !selectedAccount.linked_bank_id || !(selectedAccount.fees_due && selectedAccount.fees_due > 0)} onClick={() => openForm("pos_fee_pay", "تسجيل خصم رسوم الشبكة من البنك", { accountId: selectedAccount.id, amount: String(selectedAccount.fees_due ?? 0) })}>سداد رسوم الشبكة من البنك</button></>}</div>
            {selectedAccount.kind === "pos" && <div className={styles.statementSummary}><Balance label="إجمالي التحصيل قبل الرسوم" value={selectedAccount.balance} /><Balance label="رسوم مستحقة شامل ضريبتها" value={selectedAccount.fees_due ?? 0} /><Balance label="الصافي بعد الرسوم المستحقة" value={selectedAccount.expected_net ?? selectedAccount.balance} /></div>}
            <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); setOffset(0); setAppliedPeriod({ ...period }); }}><Field label="من تاريخ"><input type="date" value={period.from} max={period.to || undefined} onChange={(event) => setPeriod({ ...period, from: event.target.value })} /></Field><Field label="إلى تاريخ"><input type="date" value={period.to} min={period.from || undefined} onChange={(event) => setPeriod({ ...period, to: event.target.value })} /></Field><button className={styles.secondary} type="submit" disabled={statementBusy}>عرض الحركة</button><button className={styles.secondary} type="button" disabled={!statement || statementBusy} onClick={() => statement && downloadFinanceCsv(`account-${selectedAccount.code}.csv`, [["الحساب", selectedAccount.name], ["رصيد بداية الفترة", statement.opening], ["رصيد نهاية الفترة", statement.closing], ["التاريخ", "المستند", "النوع", "المستخدم", "البيان", "وارد", "صادر", "الرصيد"], ...statement.rows.map((row) => [financeDate(row.created_at), row.number, documentLabels[row.kind] ?? row.kind, row.actor_name, row.note, row.debit, row.credit, row.balance])])}><Download size={16} />تصدير الصفحة</button></form>
            {statementBusy ? <div className={styles.loading} role="status">جارٍ تحميل كشف الحركة</div> : statementError ? <div className={styles.error} role="alert">{statementError}<button className={styles.secondary} onClick={() => void loadStatement(selectedAccount.id, offset, appliedPeriod)}>إعادة المحاولة</button></div> : statement && <>
              <div className={styles.statementSummary}><Balance label="رصيد بداية الفترة" value={statement.opening} /><Balance label="الوارد" value={statement.debit} /><Balance label="الصادر" value={statement.credit} /><Balance label="رصيد نهاية الفترة" value={statement.closing} /></div>
              <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="جدول كشف الحساب"><table className={styles.table}><thead><tr>{["التاريخ والمستند", "البيان", "المستخدم", "الوارد", "الصادر", "الرصيد"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{statement.rows.map((row) => <tr key={row.id}><td><button className={styles.documentLink} onClick={() => setDocument({ id: row.document_id, number: row.number, kind: row.kind, note: row.note, category: row.category ?? undefined, subcategory: row.subcategory ?? undefined, costCenter: row.cost_center ?? undefined, canReverse: row.can_reverse, createdAt: row.created_at, actor: row.actor_name, debit: row.debit, credit: row.credit, balance: row.balance })}>{documentLabels[row.kind] ?? row.kind} #{row.number}</button><small>{financeDate(row.created_at)}</small></td><td className={styles.memo}>{row.note || "—"}</td><td>{row.actor_name || "—"}</td><td><Numeric value={row.debit} money /></td><td><Numeric value={row.credit} money /></td><td><strong><Numeric value={row.balance} money /></strong></td></tr>)}</tbody></table>{!statement.rows.length && <div className={styles.empty}>لا توجد حركات خلال هذه الفترة</div>}</div>
              <div className={styles.pagination}><span>{statement.total ? `${offset + 1}–${offset + statement.rows.length} من ${statement.total} حركة` : "لا توجد حركات"}</span><div className={styles.actions}><button className={styles.secondary} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>السابق</button><button className={styles.secondary} disabled={offset + statement.rows.length >= statement.total} onClick={() => setOffset(offset + statement.rows.length)}>التالي<ArrowLeft size={15} /></button></div></div>
            </>}
          </>}
          {tab === "reconciliations" && <>
            <div className={styles.toolbar}><p>قارن الرصيد المسجل بالعد الفعلي أو كشف البنك</p><button className={styles.primary} disabled={!editable || !selectedAccount.active} onClick={() => openForm("reconcile", "مطابقة رصيد الحساب", { countedAmount: "" })}><Plus size={16} />مطابقة جديدة</button></div>
            {historyStatus}
            {!historyBusy && !historyError && <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="سجل المطابقة"><table className={styles.table}><thead><tr>{["التاريخ", "الرصيد الدفتري", "الرصيد الفعلي", "الفرق", "المستخدم", "البيان", "الإجراء"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{matching.map((row) => <tr key={row.id}><td>{financeDate(row.created_at)}</td><td><Numeric value={row.expected_balance} money /></td><td><Numeric value={row.counted_amount} money /></td><td className={Math.abs(row.variance) > .009 ? styles.variance : styles.matched}><Numeric value={row.variance} money />{Math.abs(row.variance) < .01 && <small>مطابق</small>}</td><td>{row.actor_name}</td><td className={styles.memo}>{row.note}</td><td>{row.adjustment_document_id ? <span>تمت التسوية</span> : Math.abs(row.variance) > .009 && data?.canCorrect ? <button className={styles.secondary} disabled={!editable} onClick={() => openForm("reconcile_adjust", "تسوية فرق المطابقة", { reconciliationId: row.id })}>تسوية الفرق</button> : "—"}</td></tr>)}</tbody></table>{!matching.length && <div className={styles.empty}>لم تسجل مطابقة لهذا الحساب بعد</div>}</div>}
            {historyPagination}
          </>}
          {tab === "fees" && <FinanceTerminalFees key={selectedAccount.id} account={selectedAccount} charges={data?.fee_charges ?? []} slug={slug} />}
          {tab === "audit" && <>{historyStatus}{!historyBusy && !historyError && <div className={styles.audit}>{audit.map((row) => <div key={row.id}><History size={17} aria-hidden="true" /><div><strong>{operationLabels[row.operation] ?? row.operation}</strong><p>{row.note}</p><small>{row.actor_name} · {financeDate(row.created_at)}</small></div></div>)}{!audit.length && <div className={styles.empty}>لا توجد إجراءات مسجلة لهذا الحساب</div>}</div>}{historyPagination}</>}
          {tab === "settings" && <div className={styles.settings}>
            <div className={styles.settingRow}><div><h3>بيانات الحساب</h3><p>{selectedAccount.name}{selectedAccount.iban && <><br /><bdi>{selectedAccount.iban}</bdi></>}</p></div><button className={styles.secondary} disabled={!editable} onClick={() => openForm("account_save", "تعديل بيانات الحساب", { id: selectedAccount.id, kind: selectedAccount.kind, name: selectedAccount.name, bankName: selectedAccount.bank_name, iban: selectedAccount.iban, terminalId: selectedAccount.terminal_id, linkedBankId: selectedAccount.linked_bank_id ?? "", ...(selectedAccount.kind === "pos" ? { transactionFeePercent: String(selectedAccount.transaction_fee_percent ?? 0), monthlySubscription: String(selectedAccount.monthly_subscription ?? 0), monthlyDueDay: String(selectedAccount.monthly_due_day ?? 1), feeVatRate: String(selectedAccount.fee_vat_rate ?? 0) } : {}) })}>تعديل البيانات</button></div>
            <div className={styles.settingRow}><div><h3>الرصيد الافتتاحي</h3><p>{selectedAccount.opening_recorded_at ? <>مسجل بتاريخ {financeDate(selectedAccount.opening_recorded_at)}<br /><Numeric value={selectedAccount.opening_amount ?? 0} money /></> : "يسجل مرة واحدة قبل بدء الحركات على الحساب"}</p></div><button className={styles.secondary} disabled={!editable || !!selectedAccount.opening_recorded_at || !selectedAccount.active} onClick={() => openForm("opening", "تسجيل الرصيد الافتتاحي", { amount: "0" })}>{selectedAccount.opening_recorded_at ? "تم التسجيل" : "تسجيل الرصيد الافتتاحي"}</button></div>
            <div className={styles.settingRow}><div><h3>{selectedAccount.active ? "أرشفة الحساب" : "إعادة تفعيل الحساب"}</h3><p>توقف الأرشفة استخدام الحساب وتبقى جميع حركاته محفوظة</p>{archiveReasons.length > 0 && <ul id="treasury-archive-reasons" className={styles.archiveReasons}>{archiveReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}</div><button className={styles.secondary} aria-describedby={archiveReasons.length ? "treasury-archive-reasons" : undefined} disabled={!editable || archiveReasons.length > 0} onClick={() => void execute("account_archive", { accountId: selectedAccount.id, active: !selectedAccount.active, note: selectedAccount.active ? "أرشفة الحساب من إدارة الخزينة" : "إعادة تفعيل الحساب من إدارة الخزينة" })}><Archive size={16} />{selectedAccount.active ? "أرشفة الحساب" : "إعادة التفعيل"}</button></div>
            <div className={styles.note}><ShieldCheck size={18} /><p>{data?.canCorrect ? "جلسة أدمن برندة بالنيابة مفعلة وتتوفر صلاحية التصحيحات الموثقة" : "التصفير وتصحيح القيود يتطلبان أدمن برندة من خلال الدخول بالنيابة"}</p></div>
            {data?.canCorrect && <div className={styles.settingRow}><div><h3>تصفير موثق لرصيد الحساب</h3><p>صلاحية أدمن برندة فقط مع حفظ جميع القيود السابقة وسبب التصحيح</p></div><button className={styles.secondary} disabled={!editable || Math.abs(selectedAccount.balance) < .01} onClick={() => openForm("reset", "تصفير رصيد الحساب", { accountId: selectedAccount.id })}>تصفير الرصيد</button></div>}
          </div>}
          </section>
        </> : <div className={styles.loading} role="status">جارٍ تحميل الحساب</div>}
        <span hidden data-treasury-brand={effectiveSlug} />
      </div>
    </Modal>
    {receiptOpen && invoiceDocument && <FinanceReceiptDialog document={invoiceDocument} snapshot={snapshot} onClose={() => setReceiptOpen(false)} />}
    {handoverReceiptOpen && <FinanceCashHandovers receiptOnly snapshot={{ ...snapshot, accounts }} slug={effectiveSlug} onClose={() => setHandoverReceiptOpen(false)} onReceived={() => { setHandoverReceiptOpen(false); setForm(null); setDraftFiles([]); void refresh(); onRefresh(); }} />}
  </div>;
}
