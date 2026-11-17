export type AldeemItemCardFilters = { itemId: string; from: string; to: string; branchId: string | null; offset: number };
export type AldeemItemCard = {
  asOf: string;
  filters: AldeemItemCardFilters;
  item: { id: string; name: string; sku: string; barcode: string | null; barcodeFormat: string; unit: string; saleUnitName: string; saleUnitFactor: number; defaultPrice: number | null; minimumPrice: number; trackingMode: string };
  branches: { id: string; name: string }[];
  warehouses: { id: string; name: string; branchId: string | null; branchName: string | null; quantity: number; reserved: number; available: number }[];
  lots: { id: string; lot: string; serial: string; warehouseId: string; warehouse: string; quantity: number; expiresOn: string | null; daysRemaining: number | null }[];
  sources: { supplierId: string; supplier: string; familyId: string | null; family: string | null; receivedQuantity: number; lastReceivedAt: string | null; linked: boolean }[];
  movements: { id: string; at: string; quantity: number; kind: string; documentId: string; documentNumber: number; warehouseId: string; warehouse: string; relatedWarehouses: string[]; branchId: string | null; branch: string | null; party: string | null; family: string | null; note: string; lots: { lot: string; expiresOn: string | null; quantity: number }[] }[];
  movementCount: number;
  pageSize: number;
  branchPrices: { branchId: string; branch: string; price: number | null; effectivePrice: number | null; revision: number; stale: boolean }[];
  pointOverrides: { pointId: string; point: string; branchId: string; branch: string; price: number }[];
  salesByBranch: { branchId: string | null; branch: string | null; sold: number; returned: number; netQuantity: number; netRevenue: number }[];
  analyticsRaw: {
    previousMonth: { from: string; to: string; days: number; sold: number; returned: number; netSales: number; averageDailyStock: number | null; historyDays: number; historyComplete: boolean; activeSalesDays: number };
    currentMonth: { from: string; to: string; days: number; elapsedDays: number; sold: number; returned: number; netSales: number };
    stock: { onHand: number; reserved: number; expired: number; expiryUnknown: number; usable: number; onOrder: number | null };
  };
  notes: string[];
};
