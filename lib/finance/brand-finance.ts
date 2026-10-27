import type { FinanceRole, FinanceStaffRole } from "./permissions";
/** Money is SAR with two decimal places; PostgreSQL numeric is authoritative. */
export type FinanceAccountKind = "cash" | "bank" | "pos" | "employee" | "receivable" | "payable" | "inventory" | "revenue" | "expense" | "equity" | "vat_input" | "vat_output";
export type FinanceAccount = { id: string; name: string; code: string; kind: FinanceAccountKind; balance: number; active: boolean; is_primary?: boolean; is_cashier_drawer?: boolean };
/** Select only from the caller's eligible accounts; never replace an explicit selection. */
export function getPrimaryFinanceAccount<T extends FinanceAccount>(accounts: T[], kind?: FinanceAccountKind | string): T | undefined {
  const eligible = accounts.filter(account => account.active && (!kind || account.kind === kind));
  return eligible.find(account => account.is_primary) ?? eligible[0];
}
export type FinanceParty = { id: string; name: string; kind: "customer" | "supplier" | "employee"; phone: string; email: string; tax_number: string; balance: number; active: boolean; details?: Record<string, string> };
export type FinanceProduct = { id: string; name: string; price: number; imageUrl: string | null; category: string; available: boolean; stockTracked: boolean; itemId: string | null; quantity: number; stock_components?: { item_id: string; quantity: number }[] };
export type FinanceItem = { id: string; name: string; sku: string; unit: string; unit_id?: string | null; barcode?: string | null; image_path?: string | null; imageUrl?: string | null; cost_mode?: "equal_split" | "full"; cost_known?: boolean; product_links?: import("./inventory-catalog").FinanceInventoryLink[]; menu_product_id: string | null; min_quantity: number; active: boolean; quantity: number; average_cost: number };
export type FinanceWarehouse = { id: string; name: string; active: boolean };
export type FinanceStock = { item_id: string; warehouse_id: string; quantity: number; average_cost: number; cost_known?: boolean };
export type FinanceDocumentLine = { id: string; product_id: string | null; item_id: string | null; name: string; quantity: number; unit_price: number; net: number; tax: number; cost: number; reference_line_id?: string | null; returned_quantity?: number; returned_net?: number; returned_tax?: number; returned_cost?: number };
export type FinanceDocument = { local_reference?: string; sync_status?: "queued" | "conflict" | "synced"; customer_phone?: string | null; vat_rate?: number | null; tax_inclusive?: boolean | null; id: string; number: number; kind: string; party_id: string | null; shift_id: string | null; account_id: string | null; warehouse_id: string | null; subtotal: number; discount: number; tax: number; total: number; paid: number; outstanding: number; refunded: boolean; refunded_total?: number; refunded_paid?: number; reference_number?: number | null; reference_id: string | null; note: string; created_at: string; lines: FinanceDocumentLine[] };
export type FinanceRefundRequest = { id: string; document_id: string; document_number: number; status: "pending" | "approved" | "rejected"; payload: { lines: { lineId: string; quantity: number; name?: string }[]; accountId?: string; shiftId?: string; paymentMethod?: string; note: string }; total: number; paid: number; created_by: string; created_at: string; reviewed_by?: string | null; reviewed_at?: string | null; refund_document_id?: string | null; rejection_reason?: string | null };
export type FinanceShift = { supervisor_paused?: boolean; id: string; shift_number?: number; user_id: string; account_id: string; status: "open" | "closed" | "handover"; opening_cash: number; expected_cash: number; counted_cash: number | null; variance: number | null; opened_at: string; closed_at: string | null; handover_to: string | null; note: string };
export type FinanceStaff = { user_id: string; name: string; role: FinanceStaffRole; active: boolean };
export type FinanceJournalLine = { id: string; document_id: string; account_id: string; debit: number; credit: number; created_at: string; memo: string };
export type FinanceMovement = { id: string; item_id: string; warehouse_id: string; document_id: string; quantity: number; unit_cost: number; created_at: string };
export type FinanceSnapshot = {
  units?: import("./inventory-catalog").FinanceInventoryUnit[];
  cafe: { id: string; name: string; slug: string }; userId: string; canManage: boolean; canAdminister: boolean; role: FinanceRole;
  settings: { vat_rate: number; tax_inclusive: boolean; currency: "SAR"; closed_through: string | null };
  accounts: FinanceAccount[]; parties: FinanceParty[]; products: FinanceProduct[]; items: FinanceItem[];
  warehouses: FinanceWarehouse[]; stock: FinanceStock[]; documents: FinanceDocument[]; shifts: FinanceShift[];
  staff: FinanceStaff[]; journal: FinanceJournalLine[]; movements: FinanceMovement[];
  refundRequests?: FinanceRefundRequest[];
  summary: { salesGross?: number; salesTax?: number; sales: number; purchases: number; expenses: number; profit: number; receivables: number; payables: number; inventoryValue: number };
  trialBalance: { account_id: string; name: string; kind: FinanceAccountKind; debit: number; credit: number; balance: number }[];
  truncated: boolean;
};
export type FinanceOperation = "supplier_payout" | "sale" | "purchase" | "refund" | "refund_approve" | "refund_reject" | "party" | "account" | "item" | "warehouse" | "stock_adjust" | "stock_transfer" | "treasury" | "settlement" | "shift_open" | "shift_close" | "shift_handover" | "shift_accept" | "settings" | "staff" | "journal";
export type FinanceCommand = { operation: FinanceOperation; requestId: string; payload: Record<string, unknown> };
export type FinanceCommandResult = { localReference?: string; offline?: boolean; customer?: import("./pos-customer").FinancePosCustomerResult; id: string; number?: number; status?: "pending" | "approved" | "rejected"; duplicate?: boolean };
export type FinanceHistoryKind = "documents" | "journal" | "movements";
export type FinanceHistory = { rows: (FinanceDocument | FinanceJournalLine | FinanceMovement)[]; hasMore: boolean };
export function financeMoney(value: number) { return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(value).replace("ر.س.", "ر.س"); }
/** Preview only; sale prices and taxes are recalculated in the posting transaction. */
export function previewFinanceTotals(lines: { quantity: number; price: number }[], discount: number, rate: number, inclusive: boolean) {
  const round = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  const subtotal = round(lines.reduce((sum, line) => sum + round(line.quantity * line.price), 0));
  const discounted = round(Math.max(0, subtotal - Math.max(0, discount)));
  const tax = round(inclusive ? discounted - discounted / (1 + rate / 100) : discounted * rate / 100);
  return { subtotal, discount: round(discount), tax, total: inclusive ? discounted : round(discounted + tax) };
}
