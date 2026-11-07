import type { FinanceProduct, FinanceSnapshot } from "./brand-finance";

export type FinanceCartLine = { productId: string; quantity: number; unitId?: string; unitPrice?: number };
export const financeCartKey = (line: Pick<FinanceCartLine, "productId" | "unitId">) => `${line.productId}:${line.unitId ?? ""}`;
export const isButcherFinance = (snapshot: Pick<FinanceSnapshot, "cafe">) => snapshot.cafe.businessCategory === "butcher_shops";

/** Inventory recipes use the first configured sale unit; unrelated families have no inferred weight. */
export function butcherStockFactor(baseId: string, unitId: string): number | null {
  if (baseId === unitId) return 1;
  const weights: Record<string, number> = { kg: 1000, g: 1 };
  const carcasses: Record<string, number> = { carcass: 1, half: 0.5, quarter: 0.25 };
  for (const family of [weights, carcasses]) if (family[baseId] && family[unitId]) return family[unitId] / family[baseId];
  return null;
}

/** Keep selected unit and price together for both preview and durable offline receipts. */
export function financeProductSelection(product: FinanceProduct, unitId?: string, butcher = false) {
  if (!butcher || !product.butcherDetails?.units.length) {
    if (unitId) throw new Error("وحدة البيع غير متاحة لهذا الصنف حدّث المنتجات");
    return { product, unit: undefined, stockFactor: 1 };
  }
  const unit = product.butcherDetails.units.find(item => item.id === unitId);
  if (!unit || !Number.isFinite(unit.price) || unit.price < 0) throw new Error("اختر وحدة بيع متاحة للصنف");
  const stockFactor = butcherStockFactor(product.butcherDetails.units[0].id, unit.id);
  if (product.stockTracked && stockFactor === null) throw new Error("هذه الوحدة لا تطابق وحدة المخزون اختر وحدة من النوع نفسه");
  return { product: { ...product, name: `${product.name} · ${unit.label}`, price: unit.price }, unit, stockFactor: stockFactor ?? 1 };
}

export function financeSelectedCartLines(cart: FinanceCartLine[], products: FinanceProduct[], butcher = false) {
  return cart.flatMap(line => {
    const product = products.find(item => item.id === line.productId);
    if (!product) return [];
    try {
      const selected = financeProductSelection(product, line.unitId, butcher);
      const pinnedPrice = butcher && typeof line.unitPrice === "number" ? line.unitPrice : selected.product.price;
      return [{ ...line, ...selected, product: { ...selected.product, price: pinnedPrice }, currentUnitPrice: selected.product.price, priceChanged: pinnedPrice !== selected.product.price }];
    }
    catch { return []; }
  });
}

export function validatePosSaleShift(snapshot: FinanceSnapshot, shiftId: unknown) {
  const shift = snapshot.shifts.find(row => row.id === shiftId && row.user_id === snapshot.userId);
  if (!shift && !shiftId && isButcherFinance(snapshot)) return;
  if (!shift || shift.status !== "open") throw new Error("الوردية مقفلة أو غير متاحة حدث الكاشير قبل متابعة البيع");
  if (shift.supervisor_paused) throw new Error("الوردية موقوفة إداريًا تواصل مع المسؤول لاستئناف البيع");
}

/** A stale checkout must not save a locally repriced receipt after the amount was reviewed. */
export function validatePosExpectedAmount(expected: unknown, current: number, scale: number) {
  if (typeof expected !== "number" || !Number.isFinite(expected) || Math.round(expected * scale) !== Math.round(current * scale)) {
    throw new Error("تغيّر السعر أو الإجمالي راجع السلة قبل تأكيد الاستلام");
  }
}
