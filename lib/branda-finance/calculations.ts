import type { FinanceDemoInvoice } from "@/lib/branda-finance/types";

export function financeAmount(value: number) {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function calculateDemoInvoice(invoice: FinanceDemoInvoice) {
  const subtotal = invoice.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const discount = invoice.items.reduce((sum, item) => sum + Math.min(item.discount, item.quantity * item.price), 0);
  const taxable = Math.max(0, subtotal - discount);
  const vat = invoice.items.reduce((sum, item) => {
    const lineSubtotal = item.quantity * item.price;
    const lineDiscount = Math.min(item.discount, lineSubtotal);
    return sum + Math.max(0, lineSubtotal - lineDiscount) * (item.taxRate / 100);
  }, 0);
  const total = taxable + vat;
  const paidAmount = Math.min(Math.max(invoice.paidAmount, 0), total);

  return {
    subtotal,
    discount,
    vat,
    total,
    paidAmount,
    remainingBalance: Math.max(0, total - paidAmount),
  };
}

export function calculateCostProfitPreview(invoice: FinanceDemoInvoice) {
  const totals = calculateDemoInvoice(invoice);
  const estimatedCost = totals.subtotal * 0.42;
  return {
    estimatedCost,
    estimatedProfit: totals.total - estimatedCost,
    margin: totals.total > 0 ? ((totals.total - estimatedCost) / totals.total) * 100 : 0,
  };
}

export function calculateStockImpactPreview(invoice: FinanceDemoInvoice) {
  return invoice.items.map((item) => ({
    productId: item.productId,
    quantityOut: item.quantity,
    note: "خصم محلي من المخزون عند اعتماد الفاتورة لاحقا",
  }));
}

export function calculateCashCardPreview(invoice: FinanceDemoInvoice) {
  const totals = calculateDemoInvoice(invoice);
  return {
    cashExpected: invoice.paymentMethodId === "cash" ? totals.paidAmount : 0,
    cardExpected: invoice.paymentMethodId === "card" ? totals.paidAmount : 0,
    receivableExpected: totals.remainingBalance,
  };
}

export function calculateJournalEntryPreview(invoice: FinanceDemoInvoice) {
  const totals = calculateDemoInvoice(invoice);
  return [
    { accountCode: "1103", accountName: "الذمم المدينة", debit: totals.remainingBalance, credit: 0 },
    { accountCode: "1001", accountName: "الصندوق / البنك", debit: totals.paidAmount, credit: 0 },
    { accountCode: "4101", accountName: "إيرادات المبيعات", debit: 0, credit: totals.subtotal - totals.discount },
    { accountCode: "2205", accountName: "ضريبة القيمة المضافة", debit: 0, credit: totals.vat },
  ].filter((line) => line.debit > 0 || line.credit > 0);
}
