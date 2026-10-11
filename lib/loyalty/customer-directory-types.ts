export type LoyaltyCustomerRow = { id: string; name: string; joinedAt: string };
export type LoyaltyCustomerPage = { rows: LoyaltyCustomerRow[]; total: number; page: number; pageSize: number };
export type LoyaltyCustomerDetail = { id: string; name: string; phone: string | null };
export type LoyaltyCustomerResult<T> = { ok: true; data: T } | { ok: false; message: string };
