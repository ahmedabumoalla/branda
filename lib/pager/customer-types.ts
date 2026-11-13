export type PagerSlice<T> = { rows: T[]; total: number; page: number; pageSize: number };
export type PagerBrand = { id: string; name: string; slug: string; customers: number; registrations: number; last_seen: string };
export type PagerCustomer = { phone: string; full_name: string; registrations: number; first_seen: string; last_seen: string; reviews: number };
export type PagerVisit = { id: string; invoice_number: string; status: string; created_at: string; created_by: string; created_station: string; ready_at: string | null; received_at: string | null; called_by: string | null; rating: number | null; notes: string; rated_at: string | null };
export type PagerReview = { id: string; phone: string; full_name: string; invoice_number: string; rating: number; notes: string; rated_at: string; received_at: string };
export type PagerDirectoryFilters = { cafeId?: string; phone?: string; query?: string; page?: number; period?: import("./customer-period").PagerPeriod };
export type PagerReviewFilters = { query?: string; rating?: number; page?: number };
