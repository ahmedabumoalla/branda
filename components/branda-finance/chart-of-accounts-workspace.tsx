"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Edit3, Plus, Search, Trash2 } from "lucide-react";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { FinanceStatusBadge } from "@/components/branda-finance/finance-status-badge";
import { FinanceTable } from "@/components/branda-finance/finance-table";
import type { FinanceAccount } from "@/lib/branda-finance/invoice-types";

type AccountRow = FinanceAccount & {
  englishName: string;
  parentId?: string;
  type: string;
  normalBalance: "مدين" | "دائن";
  active: boolean;
  allowPosting: boolean;
  taxCode?: string;
  usage: string;
};

const seedAccounts: AccountRow[] = [
  { id: "cash", code: "1001", name: "الصندوق", englishName: "Cash", type: "cash/bank", normalBalance: "مدين", active: true, allowPosting: true, usage: "مدفوعات وكاشير" },
  { id: "bank", code: "1002", name: "الحساب البنكي", englishName: "Bank", type: "cash/bank", normalBalance: "مدين", active: true, allowPosting: true, usage: "تحويلات وبنوك" },
  { id: "receivable", code: "1103", name: "الذمم المدينة", englishName: "Accounts receivable", type: "assets", normalBalance: "مدين", active: true, allowPosting: true, usage: "فواتير مبيعات" },
  { id: "inventory", code: "1301", name: "المخزون", englishName: "Inventory", type: "inventory", normalBalance: "مدين", active: true, allowPosting: true, usage: "مشتريات ومخزون" },
  { id: "payable", code: "2101", name: "الذمم الدائنة", englishName: "Accounts payable", type: "liabilities", normalBalance: "دائن", active: true, allowPosting: true, usage: "فواتير مشتريات" },
  { id: "vat-output", code: "2205", name: "ضريبة مخرجات", englishName: "VAT output", type: "VAT", normalBalance: "دائن", active: true, allowPosting: true, taxCode: "VAT15", usage: "ضريبة المبيعات" },
  { id: "vat-input", code: "2206", name: "ضريبة مدخلات", englishName: "VAT input", type: "VAT", normalBalance: "مدين", active: true, allowPosting: true, taxCode: "VAT15", usage: "ضريبة المشتريات" },
  { id: "equity", code: "3101", name: "رأس المال", englishName: "Equity", type: "equity", normalBalance: "دائن", active: true, allowPosting: false, usage: "إقفال" },
  { id: "sales", code: "4101", name: "إيرادات المبيعات", englishName: "Sales revenue", type: "revenue", normalBalance: "دائن", active: true, allowPosting: true, usage: "بنود البيع" },
  { id: "cogs", code: "5101", name: "تكلفة البضاعة المباعة", englishName: "COGS", type: "cost of sales", normalBalance: "مدين", active: true, allowPosting: true, usage: "تكلفة المخزون" },
  { id: "expenses", code: "6101", name: "مصروفات تشغيلية", englishName: "Operating expenses", type: "expenses", normalBalance: "مدين", active: true, allowPosting: true, usage: "مصروفات ومراكز تكلفة" },
];

const inputClass = "h-9 w-full rounded-[8px] border border-[#E1D1BD] bg-white px-2 text-[12px] font-bold outline-none";

export function ChartOfAccountsWorkspace() {
  const [accounts, setAccounts] = useState(seedAccounts);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return accounts;
    return accounts.filter((account) => [account.code, account.name, account.englishName, account.type].some((value) => value.toLowerCase().includes(normalized)));
  }, [accounts, query]);

  function saveAccount(account: AccountRow) {
    setAccounts((current) => current.some((item) => item.id === account.id) ? current.map((item) => item.id === account.id ? account : item) : [account, ...current]);
    setModalOpen(false);
    setEditing(null);
  }

  return (
    <FinancePageShell
      title="شجرة الحسابات"
      description="حسابات ديمو محلية بمستويات الأصول والالتزامات وحقوق الملكية والإيرادات والمصروفات والمخزون والضريبة والصندوق والبنك."
      status="محلي فقط"
      backHref="/dashboard/branda-finance/accountant"
      actions={[{ label: "الكشوف", href: "/dashboard/branda-finance/statements" }, { label: "إضافة حساب", href: "/dashboard/branda-finance/accountant/chart-of-accounts", primary: true }]}
    >
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {["assets", "liabilities", "revenue", "expenses"].map((type) => (
          <div key={type} className="rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
            <p className="text-[11px] font-black text-[#806A58]">{type}</p>
            <p className="mt-1 text-lg font-black text-[#2F241D]">{accounts.filter((account) => account.type === type).length}</p>
          </div>
        ))}
      </section>

      <section className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
        <label className="relative block min-w-[220px] flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9C8068]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} pr-9`} placeholder="بحث بالكود أو الاسم أو النوع" />
        </label>
        <button type="button" onClick={() => { setEditing(null); setModalOpen(true); }} className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-[#2F5D50] px-3 text-[12px] font-black text-white">
          <Plus className="h-4 w-4" />
          إضافة حساب
        </button>
      </section>

      <FinanceTable
        minWidth="1040px"
        headers={["الكود", "الاسم العربي", "English", "النوع", "الرصيد الطبيعي", "الترحيل", "الاستخدام", "الحالة", "إجراءات"]}
        rows={filtered.map((account) => [
          account.code,
          account.name,
          account.englishName,
          account.type,
          account.normalBalance,
          account.allowPosting ? "مسموح" : "غير مسموح",
          account.usage,
          <FinanceStatusBadge key={`${account.id}-status`} tone={account.active ? "green" : "red"}>{account.active ? "نشط" : "موقوف"}</FinanceStatusBadge>,
          <div key={`${account.id}-actions`} className="flex gap-1.5">
            <button type="button" onClick={() => { setEditing(account); setModalOpen(true); }} className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#D8C7B2] bg-white text-[#5B3926]" title="تعديل">
              <Edit3 className="h-4 w-4" />
            </button>
            <button type="button" disabled title="الحذف معطل لأن الحساب قد يكون مستخدماً" className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-[8px] border border-[#E6CFC8] bg-[#FFF7F4] text-[#9B3327] opacity-60">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>,
        ])}
      />

      {modalOpen ? (
        <AccountModal
          account={editing}
          accounts={accounts}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={saveAccount}
        />
      ) : null}
    </FinancePageShell>
  );
}

function AccountModal({ account, accounts, onClose, onSave }: { account: AccountRow | null; accounts: AccountRow[]; onClose: () => void; onSave: (account: AccountRow) => void }) {
  const [draft, setDraft] = useState<AccountRow>(account ?? {
    id: `account-${Date.now()}`,
    code: "7001",
    name: "حساب جديد",
    englishName: "New account",
    parentId: "",
    type: "expenses",
    normalBalance: "مدين",
    active: true,
    allowPosting: true,
    taxCode: "",
    usage: "غير مستخدم بعد",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2F241D]/45 p-3" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-4" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-black text-[#2F241D]">{account ? "تعديل حساب" : "إضافة حساب"}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="account code"><input className={inputClass} value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} /></Field>
          <Field label="Arabic name"><input className={inputClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
          <Field label="English name"><input className={inputClass} value={draft.englishName} onChange={(event) => setDraft({ ...draft, englishName: event.target.value })} /></Field>
          <Field label="parent account"><select className={inputClass} value={draft.parentId ?? ""} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}><option value="">بدون أب</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></Field>
          <Field label="account type"><select className={inputClass} value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>{["assets", "liabilities", "equity", "revenue", "expenses", "cost of sales", "inventory", "VAT", "cash/bank"].map((type) => <option key={type}>{type}</option>)}</select></Field>
          <Field label="normal balance"><select className={inputClass} value={draft.normalBalance} onChange={(event) => setDraft({ ...draft, normalBalance: event.target.value as AccountRow["normalBalance"] })}><option>مدين</option><option>دائن</option></select></Field>
          <Field label="linked tax code"><input className={inputClass} value={draft.taxCode ?? ""} onChange={(event) => setDraft({ ...draft, taxCode: event.target.value })} /></Field>
          <Field label="usage"><input className={inputClass} value={draft.usage} onChange={(event) => setDraft({ ...draft, usage: event.target.value })} /></Field>
          <label className="flex items-center gap-2 text-[12px] font-black"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> active</label>
          <label className="flex items-center gap-2 text-[12px] font-black"><input type="checkbox" checked={draft.allowPosting} onChange={(event) => setDraft({ ...draft, allowPosting: event.target.checked })} /> allow posting</label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-[8px] border border-[#D8C7B2] bg-white px-4 text-[12px] font-black text-[#5B3926]">إلغاء</button>
          <button type="button" onClick={() => onSave(draft)} className="h-9 rounded-[8px] bg-[#2F5D50] px-4 text-[12px] font-black text-white">حفظ محلي</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-black text-[#6D5544]">{label}</span>
      {children}
    </label>
  );
}
