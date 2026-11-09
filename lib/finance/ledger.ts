export const ledgerActions = ['save', 'submit', 'approve', 'post', 'reverse', 'cancel', 'account_save', 'period_close', 'period_reopen', 'settings'] as const;
export const ledgerPilotCafeId = '2e08901c-5aac-4bec-8c97-a135058e508b';
export const ledgerEditableAccountKinds = ['expense', 'revenue', 'equity'] as const;
export const ledgerPilotEnabled = (cafeId: string) => cafeId === ledgerPilotCafeId;
export type LedgerAction = typeof ledgerActions[number];
export type LedgerLine = {
  accountId: string;
  name?: string;
  code?: string;
  debit: number | string;
  credit: number | string;
  memo: string;
  projectId?: string;
  costCenterId?: string;
  projectName?: string;
  costCenterName?: string;
};
export type FinanceDimension={id:string;kind:'project'|'cost_center';code:string;name:string;active:boolean;revision:number};
export type LedgerDraft = {
  id: string;
  number: number;
  fiscal_year: number;
  title: string;
  document_date: string;
  note: string;
  status: 'draft' | 'submitted' | 'approved' | 'posted' | 'reversed' | 'cancelled';
  revision: number;
  lines: LedgerLine[];
  created_by: string;
  last_edited_by?: string;
  approved_by: string | null;
  created_at: string;
  document_id: string | null;
  reversal_document_id: string | null;
};
export type LedgerAccount = {
  id: string;
  name: string;
  code: string;
  kind: string;
  parent_id: string | null;
  is_group: boolean;
  frozen: boolean;
  active: boolean;
  revision: number;
};
export type LedgerPeriod = {
  period_start: string;
  period_end: string;
  closed: boolean;
  revision: number;
};
export type LedgerSnapshot = {
  dimensions?: FinanceDimension[];
  settings: {
    initialized?: boolean;
    maker_checker: boolean;
    revision: number;
  };
  accounts: LedgerAccount[];
  drafts: LedgerDraft[];
  periods: LedgerPeriod[];
  hasMore: boolean;
};
export type LedgerEvent = {
  id: number;
  action: string;
  created_at: string;
  created_by: string;
  details: {
    reason?: string;
    before?: unknown;
    after?: unknown;
  };
};
export type LedgerDocument = {
  document: {
    id: string;
    number: number;
    kind: string;
    note: string;
    created_at: string;
    total: number;
    reference_id: string | null;
  };
  lines: (CommercialDocumentFields & {
    id: string;
    name: string;
    quantity: number;
    unit_price: number;
    net: number;
    tax: number;
    cost: number;
  })[];
  journal: {
    id: string;
    accountName: string;
    accountCode: string;
    debit: number;
    credit: number;
    memo: string;
    projectName?:string|null;
    costCenterName?:string|null;
  }[];
  partyName: string | null;
  warehouseName: string | null;
};
export type LedgerReport = {
  from: string;
  to: string;
  accountId: string | null;
  offset: number;
  generatedAt: string;
  currency: string;
  hasMore: boolean;
  balances: {
    id: string;
    code: string;
    name: string;
    kind: string;
    parent_id: string | null;
    is_group: boolean;
    opening: number;
    debit: number;
    credit: number;
    closing: number;
  }[];
  entries: {
    id: string;
    document_id: string;
    account_id: string;
    account_name: string;
    code: string;
    number: number;
    kind: string;
    debit: number;
    credit: number;
    created_at: string;
    memo: string;
  }[];
};
export const ledgerStatus: Record<LedgerDraft['status'], string> = {
  draft: 'مسودة',
  submitted: 'بانتظار الاعتماد',
  approved: 'معتمد',
  posted: 'مرحل',
  reversed: 'معكوس',
  cancelled: 'ملغى'
};
export const ledgerAccountKinds: Record<string, string> = {
  other_asset: 'أصول أخرى ومقدمات',
  other_liability: 'التزامات أخرى ومستحقات',
  fixed_asset: 'أصول ثابتة',
  accumulated_depreciation: 'مجمع الإهلاك',
  cash: 'نقدية',
  bank: 'بنك',
  pos: 'وسيط دفع',
  employee: 'عهد موظفين',
  receivable: 'ذمم مدينة',
  payable: 'ذمم دائنة',
  inventory: 'مخزون',
  revenue: 'إيراد',
  expense: 'مصروف',
  equity: 'حقوق ملكية',
  vat_input: 'ضريبة مدخلات',
  vat_output: 'ضريبة مخرجات'
};
export type CommercialDocumentFields = {
  conversion_version_id?: string | null; commercial_unit?: string | null;
  commercial_quantity?: number | null; commercial_unit_price?: number | null;
  unit_conversion_factor?: number | null; base_unit?: string | null;
};
/** Present original document quantities without coupling the ledger to uninstalled inventory modules. */
export function documentCommercialLine(line: CommercialDocumentFields & { quantity: number; unit_price: number }) {
  const converted = !!line.conversion_version_id && line.commercial_quantity != null && line.commercial_unit_price != null;
  return { converted, quantity: converted ? Number(line.commercial_quantity) : line.quantity,
    price: converted ? Number(line.commercial_unit_price) : line.unit_price, unit: converted ? line.commercial_unit ?? '' : '' };
}
export const commercialQuantity = (value: number) => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 12 }).format(value);
export const ledgerAmount = (v: number | string) => new Intl.NumberFormat('ar-SA', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(Number(v));
export const ledgerQuantity = (v: number) => new Intl.NumberFormat('ar-SA', {
  maximumFractionDigits: 3
}).format(v);
/** Currency input is previewed as integer minor units; PostgreSQL numeric remains authoritative */
export function ledgerMinor(value: string | number): bigint | null {
  const text = String(value).trim();
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, decimal = ''] = text.split('.');
  return BigInt(whole) * BigInt(100) + BigInt(decimal.padEnd(2, '0'));
}
export function ledgerTotals(lines: LedgerLine[]) {
  const zero = BigInt(0);
  let debit = zero,
    credit = zero;
  let valid = true;
  for (const line of lines) {
    const d = ledgerMinor(line.debit),
      c = ledgerMinor(line.credit);
    if (d === null || c === null) {
      valid = false;
      continue;
    }
    debit += d;
    credit += c;
    if (!line.accountId || !(d > zero && c === zero || c > zero && d === zero)) valid = false;
  }
  return {
    debit,
    credit,
    valid: valid && lines.length >= 2 && debit > zero && debit === credit
  };
}
