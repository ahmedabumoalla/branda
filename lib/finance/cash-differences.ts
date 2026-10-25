export type CashDifferenceResolution = "charge_employee" | "waive";
export type CashDifferenceNotificationStatus = "pending" | "processing" | "queued" | "rejected" | "unknown" | "missing_owner";

export type CashDifferenceRow = {
  id: string;
  shift_id: string;
  shift_number: number;
  phase: "opening" | "closing";
  occurred_at: string;
  drawer_id: string;
  drawer_name: string;
  expected_cash: number;
  counted_cash: number;
  difference: number;
  employee_id: string;
  employee_name: string;
  previous_employee_id: string | null;
  previous_employee_name: string | null;
  status: "pending" | CashDifferenceResolution;
  resolution_employee_id: string | null;
  resolution_employee_name: string | null;
  settled_at: string | null;
  settlement_note: string | null;
  document_id: string;
  document_number?: number;
  resolution_document_id: string | null;
  resolution_document_number?: number | null;
  notification_status: CashDifferenceNotificationStatus;
};

export type CashDifferencesPage = {
  rows: CashDifferenceRow[];
  total: number;
  hasMore: boolean;
  employees: { user_id: string; name: string }[];
  canSettle: boolean;
};

export type CashDifferenceSettlement = {
  varianceId: string;
  resolution: CashDifferenceResolution;
  employeeId?: string | null;
  note: string;
  requestId: string;
};

export type CashDifferenceSettlementResult = {
  id: string;
  document_id: string;
  number: number;
  duplicate?: boolean;
};
