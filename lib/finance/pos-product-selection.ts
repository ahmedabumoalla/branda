import type { FinanceProduct, FinanceSnapshot } from "./brand-finance";

export type FinanceCartLine = { productId: string; quantity: number; unitId?: string; unitPrice?: number; cashierPrice?: boolean };
export const financeCartKey = (line: Pick<FinanceCartLine, "productId" | "unitId" | "unitPrice" | "cashierPrice">) => `${line.productId}:${line.unitId ?? ""}${line.cashierPrice ? `:price:${line.unitPrice}` : ""}`;
export const isButcherFinance = (snapshot: Pick<FinanceSnapshot, "cafe">) => snapshot.cafe.businessCategory === "butcher_shops";

export function validCashierUnitPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1_000_000
    && Math.abs(value * 1_000_000 - Math.round(value * 1_000_000)) < 0.0001;
}

/** Inventory recipes use the first configured sale unit; unrelated families have no inferred weight. */
export function butcherStockFactor(baseId: string, unitId: string): number | null {
  if (baseId === unitId) return 1;
  const weights: Record<string, number> = { kg: 1000, g: 1 };
  const carcasses: Record<string, number> = { carcass: 1, half: 0.5, quarter: 0.25 };
  for (const family of [weights, carcasses]) if (family[baseId] && family[unitId]) return family[unitId] / family[baseId];
  return null;
}

/** Keep selected unit and price together for both preview and durable offline receipts. */
export function financeProductSelection(product: FinanceProduct, unitId?: string, butcher = false, cashierUnitPrice?: unknown) {
  if (!butcher || !product.butcherDetails?.units.length) {
    if (cashierUnitPrice !== undefined) throw new Error("هذا الصنف لا يسمح بتحديد السعر وقت البيع");
    if (unitId) throw new Error("وحدة البيع غير متاحة لهذا الصنف حدّث المنتجات");
    return { product, unit: undefined, stockFactor: 1 };
  }
  const unit = product.butcherDetails.units.find(item => item.id === unitId);
  if (!unit || !Number.isFinite(unit.price) || unit.price < 0) throw new Error("اختر وحدة بيع متاحة للصنف");
  const cashierPriced = unit.priceMode === "cashier";
  if (cashierPriced && !validCashierUnitPrice(cashierUnitPrice)) throw new Error("أدخل سعر الوحدة أكبر من صفر بحد أقصى مليون ريال وست خانات عشرية");
  if (!cashierPriced && cashierUnitPrice !== undefined) throw new Error("سعر هذه الوحدة ثابت من إدارة المنتجات");
  const stockFactor = butcherStockFactor(product.butcherDetails.units[0].id, unit.id);
  if (product.stockTracked && stockFactor === null) throw new Error("هذه الوحدة لا تطابق وحدة المخزون اختر وحدة من النوع نفسه");
  return { product: { ...product, name: `${product.name} · ${unit.label}`, price: cashierPriced ? cashierUnitPrice as number : unit.price }, unit, stockFactor: stockFactor ?? 1 };
}

export function financeSelectedCartLines(cart: FinanceCartLine[], products: FinanceProduct[], butcher = false) {
  return cart.flatMap(line => {
    const product = products.find(item => item.id === line.productId);
    if (!product) return [];
    try {
      const cashierPriced = butcher && product.butcherDetails?.units.find(unit => unit.id === line.unitId)?.priceMode === "cashier";
      const selected = financeProductSelection(product, line.unitId, butcher, cashierPriced && line.cashierPrice ? line.unitPrice : undefined);
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
