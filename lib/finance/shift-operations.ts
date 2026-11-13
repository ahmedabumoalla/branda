export type ShiftVariance = {
  id: string; shift_id: string; phase: "opening" | "closing";
  expected_cash: number; counted_cash: number; difference: number;
  status: "pending" | "charge_employee" | "waive";
  settled_at: string | null; settlement_note: string | null;
};
export type ShiftSummary = {
  cash_sales: number; pos_sales: number; bank_sales: number;
  cash_refunds: number; pos_refunds: number; bank_refunds: number;
  supplier_payouts: number; invoice_count: number; item_quantity: number;
};
export type ShiftAttachment = {
  id: string; original_name: string; content_type: string; size_bytes: number;
};
export type ShiftPayout = {
  id: string; number: number; supplier_name: string; supplier_phone: string;
  amount: number; note: string; created_at: string; attachments: ShiftAttachment[];
  paid: number; kind: string; tax: number; vat_rate: number | null;
  tax_inclusive: boolean | null; payment: "cash" | "credit";
  lines: { name: string; quantity: number; unit_price: number; net: number; tax: number }[];
};
export type ShiftProductAnalysis = {
  product_id: string; name: string; quantity: number; unit_price: number;
  net: number; tax: number; cost: number | null; profit: number | null;
  cost_known: boolean;
};
export type ShiftOperationalRecord = {
  shift_number?: number;
  id: string; user_id: string; account_id: string; status: "open" | "closed" | "handover";
  opening_cash: number; opening_expected_cash: number | null; opening_variance: number;
  expected_cash: number; counted_cash: number | null; variance: number | null;
  opened_at: string; closed_at: string | null; employee_name: string;
  pending_variance: number; handover_to: string | null; note: string;
} & ShiftSummary;
export type ShiftSale = {
  id: string; number: number; kind: string; total: number; tax: number;
  created_at: string; lines: { name: string; quantity: number; unit_price: number; net: number; tax: number }[];
};
export type FinanceShiftDetail = {
  shift: ShiftOperationalRecord; summary: ShiftSummary; payouts: ShiftPayout[];
  sales: ShiftSale[]; products: ShiftProductAnalysis[];
  unsoldProducts: { product_id: string; name: string; unit_price: number }[];
  variances: ShiftVariance[];
};
export type FinanceShiftSnapshot = {
  initialized: boolean; canInitialize: boolean;
  drawerAvailability: { account_id: string; balance: number; busy: boolean; own_shift_id: string | null }[];
};
