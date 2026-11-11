export type CompanyProduct = {
  id: string; name: string; sku: string; description: string; price: number;
  purchasePrice: number; minimumPrice: number; discount: number; discountKind: "amount" | "percent";
  vatRate: number; category: string; brand: string; barcode: string;
  stockTracked: boolean; itemId: string | null; quantity: number; notes: string;
};
export type CompanyLine = { key: number; productId: string; quantity: number; price?: number; description?: string; discount?: number; discountKind?: "amount" | "percent"; vatRate?: number; name?: string; kind?: "product" | "service"; taxCategory?: "S" | "Z" | "E" | "O"; exemptionReason?: string };
export type CompanyAdjustment = { amount: number; kind: "addition" | "deduction"; taxable: boolean };
export const moneyRound = (n: number) => Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON * Math.max(1, Math.abs(n))) * 100) / 100;

/** Row discount precedes the proportional document discount; tax rounds per row. */
export function companyAmounts(lines: CompanyLine[], products: { id: string; price: number }[], discountValue = 0, discountKind: "amount" | "percent" = "amount", rate = 0, inclusive = false, adjustment?: CompanyAdjustment) {
  const base = lines.map(line => {
    const price = line.price ?? products.find(p => p.id === line.productId)?.price ?? 0;
    const gross = moneyRound(line.quantity * price);
    const discount = moneyRound(Math.min(gross, Math.max(0, line.discountKind === "percent" ? gross * (line.discount ?? 0) / 100 : line.discount ?? 0)));
    return { price, gross, discount, after: moneyRound(gross - discount) };
  });
  const subtotal = moneyRound(base.reduce((a, b) => a + b.gross, 0));
  const after = moneyRound(base.reduce((a, b) => a + b.after, 0));
  const documentDiscount = moneyRound(Math.min(after, Math.max(0, discountKind === "percent" ? after * discountValue / 100 : discountValue)));
  let remaining = documentDiscount;
  let remainingBase = after;
  const rows = base.map((row, index) => {
    const allocation = Math.min(row.after, remaining, index === base.length - 1 ? remaining : moneyRound(remainingBase ? row.after * remaining / remainingBase : 0));
    remaining = moneyRound(remaining - allocation);
    remainingBase = moneyRound(remainingBase - row.after);
    const taxable = moneyRound(row.after - allocation), vat = lines[index].vatRate ?? rate;
    const tax = moneyRound(inclusive ? taxable - taxable / (1 + vat / 100) : taxable * vat / 100);
    return { price: row.price, discount: moneyRound(row.discount + allocation), net: inclusive ? moneyRound(taxable - tax) : taxable, tax, total: inclusive ? taxable : moneyRound(taxable + tax) };
  });
  const adjustmentTotals = { net: 0, tax: 0, total: 0 };
  if (adjustment && adjustment.amount > 0) {
    let adjustmentRemaining = moneyRound(adjustment.amount * (adjustment.kind === "deduction" ? -1 : 1));
    let adjustmentBase = moneyRound(rows.reduce((sum, row) => sum + (inclusive ? row.total : row.net), 0));
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index], basis = inclusive ? row.total : row.net;
      const share = adjustmentBase === 0 ? 0 : moneyRound(adjustmentRemaining * basis / adjustmentBase);
      adjustmentRemaining = moneyRound(adjustmentRemaining - share); adjustmentBase = moneyRound(adjustmentBase - basis);
      const vat = lines[index].vatRate ?? rate;
      const tax = adjustment.taxable ? moneyRound(inclusive ? share - share / (1 + vat / 100) : share * vat / 100) : 0;
      const net = inclusive && adjustment.taxable ? moneyRound(share - tax) : share;
      row.net = moneyRound(row.net + net); row.tax = moneyRound(row.tax + tax); row.total = moneyRound(row.net + row.tax);
      adjustmentTotals.net = moneyRound(adjustmentTotals.net + net); adjustmentTotals.tax = moneyRound(adjustmentTotals.tax + tax);
    }
    adjustmentTotals.total = moneyRound(adjustmentTotals.net + adjustmentTotals.tax);
  }
  return { rows, subtotal, discount: moneyRound(subtotal - after + documentDiscount), tax: moneyRound(rows.reduce((a, b) => a + b.tax, 0)), total: moneyRound(rows.reduce((a, b) => a + b.total, 0)), adjustment: adjustmentTotals };
}

export function parseCompanyTable(text: string, products: { id: string; name: string; price: number; sku?: string }[], startKey: number): CompanyLine[] {
  const rows = text.trim().split(/\r?\n/).filter(row => row.trim());
  if (!rows.length || rows.length > 100) throw new Error("أدخل من سطر واحد إلى ١٠٠ سطر");
  return rows.map((row, i) => {
    const [name, quantityText, priceText, ...extra] = row.split("\t").map(v => v.trim());
    const matches = products.filter(p => p.id === name || p.sku === name || p.name === name);
    if (matches.length !== 1) throw new Error(`السطر ${i + 1}: اختر اسمًا أو رمزًا يطابق منتجًا واحدًا`);
    const quantity = Number(quantityText), price = priceText === undefined || priceText === "" ? matches[0].price : Number(priceText);
    if (extra.length || !Number.isFinite(quantity) || quantity <= 0 || quantity > 9999 || !Number.isFinite(price) || price < 0 || price > 10000000) throw new Error(`راجع الكمية والسعر في السطر ${i + 1}`);
    return { key: startKey + i, productId: matches[0].id, quantity, price };
  });
}
