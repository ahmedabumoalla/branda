export type LoyaltyReadScope = { cafeId: string; cashierId: string };
export type LoyaltyReadStatus = "pending" | "processing" | "succeeded" | "failed" | "needs_review" | "duplicate";
export type LoyaltyReadOperation = {
  requestId: string;
  status: LoyaltyReadStatus;
  identifierHint: string;
  customerName: string | null;
  cashierName: string;
  availableRewards: number | null;
  rewardIssued: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  attempts: number;
  createdAt: string;
  completedAt: string | null;
  cardCreated?: boolean;
  invitationStatus?: string | null;
};
export type LoyaltyReadInput = LoyaltyReadScope & { requestId: string; method: "code" | "phone"; value: string; clientCreatedAt: string };
export type LoyaltyReadFilters = { page?: number; status?: string };
export type LoyaltyReadPage = {
  items: LoyaltyReadOperation[]; total: number; page: number; pageSize: number;
  counts: Record<LoyaltyReadStatus, number> & { retryable: number };
};
export type LoyaltyReadFailure = { ok: false; message: string; code: string; retryable: boolean };
