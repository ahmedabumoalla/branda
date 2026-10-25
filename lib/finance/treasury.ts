import type { FinanceAccount } from "./brand-finance";

export type TreasuryAccount = FinanceAccount & {
  linked_bank_id: string | null;
  opening_recorded_at: string | null;
  opening_amount: number | null;
  bank_name: string;
  iban: string;
  terminal_id: string;
  transaction_fee_percent?: number;
  monthly_subscription?: number;
  monthly_due_day?: number;
  fee_vat_rate?: number;
  fees_due?: number;
  expected_net?: number;
};

export type TreasuryReconciliation = {
  id: string; account_id: string; expected_balance: number; counted_amount: number;
  variance: number; note: string; created_at: string; actor_name: string;
  adjustment_document_id?: string | null;
};
export type TreasuryAudit = {
  id: string; account_id: string | null; operation: string; note: string;
  created_at: string; actor_name: string; document_id?: string | null;
};
export type TreasurySnapshot = {
  accounts: TreasuryAccount[];
  reconciliations: TreasuryReconciliation[];
  audit: TreasuryAudit[];
  auditTotal?: number;
  reconciliationsTotal?: number;
  canCorrect: boolean;
  fee_charges?: TreasuryFeeCharge[];
  fee_charges_total?: number;
};
export type TreasuryStatementRow = {
  id: string; document_id: string; number: number; kind: string; created_at: string;
  actor_name: string; note: string; debit: number; credit: number; balance: number;
  can_reverse?: boolean;
  category?: string | null; subcategory?: string | null; cost_center?: string | null;
};
export type TreasuryStatement = {
  opening: number; debit: number; credit: number; closing: number;
  total: number; rows: TreasuryStatementRow[];
};
export type TreasuryOperation = "account_save" | "account_archive" | "account_primary" | "opening" | "voucher" | "transfer" | "pos_settle" | "pos_fee_pay" | "reconcile";
export type TreasuryCorrection = "reverse" | "reset" | "reconcile_adjust";
export type TreasuryResult = { id: string; number?: number; document_id?: string | null; duplicate?: boolean };
export type TreasuryStatementOptions = { offset?: number; from?: string; to?: string };
export type TreasuryHistory = { rows: (TreasuryReconciliation | TreasuryAudit)[]; total: number };
export type TreasuryFeeHistory = { rows: TreasuryFeeCharge[]; total: number };
export const treasuryLimits = { cash: 3, bank: 5, pos: 3 } as const;

export type TreasuryFeeCharge = {
  id: string; terminal_id: string; terminal_name: string; bank_id: string; bank_name: string;
  source_document_id: string | null; source_number: number | null; document_id: string;
  kind: "transaction" | "monthly"; billing_month: string | null; base_amount: number;
  fee_percent: number; vat_rate: number; fee: number; tax: number; total: number;
  paid: number; remaining: number; created_at: string;
};
