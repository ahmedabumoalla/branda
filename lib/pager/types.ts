export type PagerStatus = "waiting" | "ready" | "received" | "cancelled";
export type PagerMode = "owner" | "staff";
export type PagerContext = { cafeId: string; cafeName: string; actorName: string; station: string; kind: PagerMode; canUseLoyalty?: boolean };
export type PagerOrder = {
  id: string; cafeId: string; invoiceNumber: string; phone: string; status: PagerStatus;
  createdAt: string; readyAt: string | null; receivedAt: string | null;
  createdBy: string; createdStation: string; calledBy: string | null; calledStation: string | null;
  rating: number | null; notes: string; ratedAt: string | null;
  messageStatus: "pending" | "provider_queued" | "failed" | null;
  lastMessageAt: string | null; messageCount: number;
};
export type PagerFilter = { page?: number; status?: PagerStatus | "all" | "active"; query?: string };
export type PagerPage = {
  orders: PagerOrder[]; total: number; page: number; pageSize: number;
  metrics: { total: number; waiting: number; ready: number; received: number; cancelled: number;
    averagePreparationSeconds: number | null; averageCollectionSeconds: number | null;
    averageRating: number | null; ratedCount: number };
};
export type PagerFeedback = { brandName: string; invoiceNumber: string; rating: number | null; notes: string; submitted: boolean };
export type PagerMutationResult = { ok: true; order: PagerOrder } | { ok: false; error: string };
export type PagerMessageJob = { id: string; orderId: string; cafeId: string; phone: string;
  brandName: string; invoiceNumber: string; kind: "ready" | "rating"; leaseToken: string; feedbackToken?: string };
