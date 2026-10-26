export type ShiftProductAnalytics = {
  key: string; productId: string | null; itemId: string | null; name: string;
  soldQuantity: number; returnedQuantity: number; netQuantity: number; salesCount: number;
  revenue: number; cost: number; knownProfit: number; profit: number | null;
  unknownCostLineCount: number; estimatedCostLineCount: number; legacyCostLineCount: number; tracked: boolean;
  stock: { itemId: string; warehouseId: string; warehouseName: string; quantity: number; unit: string; minQuantity: number }[];
};
export type ShiftAnalytics = {
  generatedAt: string; shiftId: string; openedAt: string; closedAt: string | null; durationSeconds: number;
  totals: {
    salesCount: number; refundCount: number; grossSales: number; returnedTotal: number; netSales: number;
    netRevenue: number; tax: number; discount: number; cost: number; knownProfit: number; profit: number | null;
    unknownCostLineCount: number; estimatedCostLineCount: number; legacyCostLineCount: number; costCoveragePercent: number;
    soldQuantity: number; returnedQuantity: number; netQuantity: number; averageBasket: number; offlineSalesCount: number;
  };
  products: ShiftProductAnalytics[];
  hourly: { hour: number; salesCount: number; quantity: number; salesTotal: number }[];
  payments: { kind: string; accountName: string; salesCount: number; paid: number; returnedPaid: number; netPaid: number }[];
  notes: { timeBasis: string; stockBasis: string; refundBasis: string; paymentBasis?: string };
};

export function durationParts(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return { days: Math.floor(safe / 86400), hours: Math.floor(safe % 86400 / 3600), minutes: Math.floor(safe % 3600 / 60), totalMinutes: safe / 60, totalHours: safe / 3600, totalDays: safe / 86400 };
}
export function shiftHighlights(report: ShiftAnalytics) {
  const sold = [...report.products].filter(p => p.netQuantity > 0).sort((a, b) => b.netQuantity - a.netQuantity || b.revenue - a.revenue || a.key.localeCompare(b.key))[0] ?? null;
  const profitable = [...report.products].filter(p => p.profit !== null && p.netQuantity > 0).sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0) || a.key.localeCompare(b.key))[0] ?? null;
  const peak = [...report.hourly].filter(h => h.salesCount > 0).sort((a, b) => b.salesCount - a.salesCount || b.salesTotal - a.salesTotal || a.hour - b.hour)[0] ?? null;
  return { sold, profitable, peak };
}

export function shiftProductsCsv(products: ShiftProductAnalytics[]) {
  const cell = (value: string | number | null) => {
    const text = value == null ? "" : typeof value === "number" ? String(value) : /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + [
    ["الصنف", "المباع", "المرتجع", "صافي الكمية", "صافي الإيراد دون الضريبة", "التكلفة المسجلة", "الربح الإجمالي", "بنود دون تكلفة", "بنود تكلفة تقديرية", "بنود تكلفة تاريخية"],
    ...products.map(p => [p.name, p.soldQuantity, p.returnedQuantity, p.netQuantity, p.revenue, p.cost, p.profit, p.unknownCostLineCount, p.estimatedCostLineCount, p.legacyCostLineCount]),
  ].map(row => row.map(cell).join(",")).join("\r\n");
}
