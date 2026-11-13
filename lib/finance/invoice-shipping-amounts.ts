import { moneyRound } from "./company-invoice";

/** Shipping is an independent net fee, outside item discounts and adjustments. */
export function invoiceShippingAmounts(selection: { amount: number; taxRate: number | null } | null | undefined, exchangeRate = 1) {
  const amount = moneyRound(selection?.amount ?? 0);
  const tax = moneyRound(amount * (selection?.taxRate ?? 0) / 100);
  const sarAmount = moneyRound(amount * exchangeRate), sarTax = moneyRound(tax * exchangeRate);
  return { amount, tax, total: moneyRound(amount + tax), sar: { amount: sarAmount, tax: sarTax, total: moneyRound(sarAmount + sarTax) } };
}
