export type MonitorShift = { id: string; number: number; cashier: string; openedAt: string; drawer: number; sales: number; salesTotal: number; paused: boolean };
export type BranchMonitor = {
  at: string; branchId: string | null; slug: string; brand: string;
  branches: { id: string; name: string; city: string | null; active: boolean; sales: number; invoices: number; refunds: number; purchases: number; expenses: number; lastSaleAt: string | null; openShifts: MonitorShift[]; employees: number; stockValue: number; lowStock: number; labPending: number }[];
  unassignedShifts: MonitorShift[];
  feed: { id: string; at: string; kind: string; number: number; total: number; branchId: string | null; label: string; actor: string }[];
};
export type ItemTrace = {
  matches: { id: string; name: string; code: string }[];
  item: null | { id: string; name: string; barcode: string | null; sku: string; unit: string; active: boolean; minQuantity: number; flavor: string; seller: string; sellerKind: string; trackingMode: string; buyPrice: number; salePrice: number; category: string | null; brand: string | null; family: string | null; soldAs: { name: string; price: number; quantity: number }[] };
  stock?: { warehouseId: string; warehouse: string; branchId: string | null; quantity: number; averageCost: number }[];
  lots?: { id: string; lot: string | null; serial: string | null; expiresOn: string | null; quantity: number }[];
  totals?: { purchased: number; returnedToSupplier: number; sold: number; returnedByCustomers: number; otherIn: number; otherOut: number };
  movements?: { id: string; at: string; quantity: number; unitCost: number; warehouse: string; branchId: string | null; documentId: string; kind: string; number: number; label: string; party: string; actor: string; lots: string | null; voucher: string | null }[];
  branches?: { id: string; name: string }[];
};
export type CashTrail = {
  branchId: string | null; from: string; to: string; accountId: string; filterBranchId: string; slug: string; brand: string;
  accounts: { id: string; name: string; kind: string; drawer: boolean; balance: number; in: number; out: number }[];
  branches: { id: string; name: string }[]; totals: { in: number; out: number; count: number };
  rows: { id: string; at: string; accountId: string; in: number; out: number; documentId: string; kind: string; number: number; label: string; originNumber: number | null; note: string; party: string; branchId: string | null; actor: string; cashier: string | null; shiftNumber: number | null }[];
};
export const trackingModes: Record<string, string> = { quantity: "بالكمية", serial: "برقم تسلسلي", lot: "بالتشغيلة", expiry: "بتاريخ الانتهاء", lot_expiry: "بالتشغيلة وتاريخ الانتهاء" };
