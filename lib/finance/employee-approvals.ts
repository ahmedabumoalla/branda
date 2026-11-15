export type EmployeeApproval = {
  request_id: string; permission: string; operation: string; payload: Record<string, unknown>;
  requester_name: string; approver_name: string; status: "pending" | "approved" | "rejected" | "consumed";
  created_at: string; review_note: string | null; can_review: boolean;
};
