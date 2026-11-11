export type JournalDocumentLink = { id: string; number: number; kind: string; createdAt: string; note: string };
export type JournalActivityFilters = { action: "all" | "created" | "payment" | "description"; actorId: string | null; from: string; to: string; sort: "newest" | "oldest"; offset: number };
export type JournalActivityRow = { id: string; kind: string; action: string; createdAt: string; actorId: string | null; actor: string; field: "document_note" | "line_memo" | null; lineId: string | null; before: string | null; after: string | null; accountName: string | null; accountCode: string | null };
export type JournalActivityPage = { rows: JournalActivityRow[]; total: number; hasMore: boolean; offset: number; pageSize: number; actionOptions: { id: string; label: string }[]; actors: { id: string; name: string }[] };
export type JournalDescriptionsInput = { id: string; revision: number; requestId: string; note: string; lineMemos: { id: string; memo: string }[] };
export type JournalDetail = {
  document: JournalDocumentLink & { total: number; referenceId: string | null; creatorId: string; creatorName: string };
  journal: { id: string; accountId: string; accountCode: string; accountName: string; debit: number; credit: number; memo: string; partyId: string | null; partyName: string | null; originalMemo: string; createdAt: string; postingDate: string; actorId: string; actorName: string; documentNumber: number; currency: "SAR"; localDebit: number; localCredit: number; action: "posting" }[];
  metadata: { revision: number; canEdit: boolean; note: string; originalNote: string };
  manualDraft: import("./ledger").LedgerDraft | null;
  capabilities: { canCopy: boolean; canReverse: boolean; copyMode: "manual" | "invoice" | "payment" | "none"; reverseMode: "manual" | "refund" | "payment" | "none"; copyReason: string | null; reverseReason: string | null };
  totals: { debit: number; credit: number };
  journalCount: number; journalTruncated: boolean;
  invoiceId: string | null; sourcePaymentId: string | null;
  related: JournalDocumentLink[]; relatedCount: number; relatedTruncated: boolean;
  activity: { id: string; action: string; createdAt: string; actor: string }[];
  activityCount: number; activityTruncated: boolean;
};
