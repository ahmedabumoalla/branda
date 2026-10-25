import { previewFinanceTotals, type FinanceDocument, type FinanceProduct, type FinanceSnapshot } from "./brand-finance";

/** Local-only receipt model; never reserves a number or posts a financial operation. */
export function createFinanceReceiptPreview(input: {
  lines: { product: FinanceProduct; quantity: number }[];
  settings: FinanceSnapshot["settings"];
  discount: number;
  paymentKind: string;
  accountId?: string;
  partyId?: string;
  customerPhone?: string | null;
  note: string;
  createdAt: string;
}): FinanceDocument {
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  if (!input.lines.length || input.lines.some(({ product, quantity }) => !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(product.price) || product.price < 0)) throw new Error("أضف أصنافًا وكميات صحيحة لمعاينة الإيصال");
  const totals = previewFinanceTotals(input.lines.map(({ product, quantity }) => ({ price: product.price, quantity })), input.discount, input.settings.vat_rate, input.settings.tax_inclusive);
  if (!Number.isFinite(input.discount) || input.discount < 0 || input.discount > totals.subtotal || !Number.isFinite(totals.total)) throw new Error("راجع قيمة الخصم قبل معاينة الإيصال");
  const net = round(totals.total - totals.tax);
  let remainingNet = net, remainingTax = totals.tax;
  const lines = input.lines.map(({ product, quantity }, index) => {
    // Match the posting transaction's allocation and last-line rounding remainder.
    const share = totals.subtotal ? quantity * product.price / totals.subtotal : 0;
    const last = index === input.lines.length - 1;
    const lineNet = last ? remainingNet : Math.min(remainingNet, round(net * share));
    const lineTax = last ? remainingTax : Math.min(remainingTax, round(totals.tax * share));
    remainingNet = round(remainingNet - lineNet);
    remainingTax = round(remainingTax - lineTax);
    return { id: `preview-${index}`, product_id: product.id, item_id: product.itemId, name: product.name, quantity, unit_price: product.price, net: lineNet, tax: lineTax, cost: 0 };
  });
  const paid = input.paymentKind === "credit" ? 0 : totals.total;
  return {
    id: "receipt-preview", number: 0, kind: "sale", party_id: input.partyId || null,
    account_id: input.paymentKind === "credit" ? null : input.accountId || null,
    customer_phone: input.customerPhone || null, shift_id: null, warehouse_id: null,
    ...totals, paid, outstanding: round(totals.total - paid), refunded: false,
    reference_id: null, note: input.note, created_at: input.createdAt, lines,
    vat_rate: input.settings.vat_rate, tax_inclusive: input.settings.tax_inclusive,
  };
}
