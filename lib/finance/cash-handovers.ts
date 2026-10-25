export type CashHandoverRow = {
  id: string;
  shift_id: string;
  shift_number: number;
  drawer_id: string;
  drawer_name: string;
  receiving_drawer_id?: string | null;
  receiving_drawer_name?: string | null;
  amount: number;
  handover_type: "next_shift" | "accountant" | "other";
  from_user_id: string;
  from_name: string;
  recipient_user_id: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  created_at: string;
  status: "pending" | "received";
  received_at: string | null;
  received_by_name: string | null;
  received_counted_cash?: number | null;
  document_number: number | null;
  receipt_document_number: number | null;
};

export type CashHandoversPage = {
  rows: CashHandoverRow[];
  total: number;
  hasMore: boolean;
  canReceive: boolean;
  cashierDrawerId: string;
  accountants: { user_id: string; name: string }[];
};

export type CashHandoverReceipt = {
  handoverId: string;
  accountId: string;
  note: string;
  requestId: string;
};

export type CashHandoverReceiptResult = { id: string; number: number | null; duplicate?: boolean };
