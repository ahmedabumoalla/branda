import type { FinanceInvoiceItem } from "@/lib/branda-finance/invoice-types";

export type InvoiceTotalsValue = {
  subtotal: number;
  itemDiscount: number;
  discount: number;
  vat: number;
  total: number;
  amountPaid: number;
  remainingBalance: number;
};

export function lineSubtotal(item: FinanceInvoiceItem) {
  return item.quantity * item.price;
}

export function lineDiscount(item: FinanceInvoiceItem) {
  return Math.min(Math.max(item.discount || 0, 0), lineSubtotal(item));
}

export function lineTaxableAmount(item: FinanceInvoiceItem) {
  return Math.max(0, lineSubtotal(item) - lineDiscount(item));
}

export function lineVat(item: FinanceInvoiceItem) {
  return lineTaxableAmount(item) * (item.taxRate / 100);
}

export function lineTotal(item: FinanceInvoiceItem) {
  return lineTaxableAmount(item) + lineVat(item);
}

export function calculateInvoiceTotals(
  items: FinanceInvoiceItem[],
  discount: number,
  amountPaid = 0,
): InvoiceTotalsValue {
  const subtotal = items.reduce((sum, item) => sum + lineSubtotal(item), 0);
  const itemDiscount = items.reduce((sum, item) => sum + lineDiscount(item), 0);
  const safeDiscount = Math.min(Math.max(discount, 0), Math.max(0, subtotal - itemDiscount));
  const vatBase = Math.max(0, subtotal - itemDiscount - safeDiscount);
  const rawVat = items.reduce((sum, item) => sum + lineVat(item), 0);
  const vat = subtotal - itemDiscount > 0 ? rawVat * (vatBase / (subtotal - itemDiscount)) : 0;
  const total = vatBase + vat;
  const safePaid = Math.min(Math.max(amountPaid, 0), total);

  return {
    subtotal,
    itemDiscount,
    discount: safeDiscount,
    vat,
    total,
    amountPaid: safePaid,
    remainingBalance: Math.max(0, total - safePaid),
  };
}

export function formatFinanceAmount(value: number) {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function InvoiceTotals({ totals }: { totals: InvoiceTotalsValue }) {
  const rows = [
    ["الإجمالي قبل الخصم", totals.subtotal],
    ["خصومات البنود", totals.itemDiscount],
    ["خصم الفاتورة", totals.discount],
    ["ضريبة القيمة المضافة", totals.vat],
    ["الإجمالي المستحق", totals.total],
    ["المدفوع", totals.amountPaid],
    ["الرصيد المتبقي", totals.remainingBalance],
  ] as const;

  return (
    <div className="w-full max-w-full min-w-0 rounded-[8px] border border-[#E6D7C3] bg-[#FFFDF8] p-3">
      <div className="space-y-2">
        {rows.map(([label, value], index) => {
          const isTotal = label === "الإجمالي المستحق";
          const isBalance = label === "الرصيد المتبقي";

          return (
            <div
              key={label}
              className={`flex min-w-0 items-center justify-between gap-3 text-[12px] ${
                isTotal || isBalance
                  ? "border-t border-[#E6D7C3] pt-2 text-[15px] font-black text-[#2F241D]"
                  : index > 3
                    ? "font-black text-[#2F5D50]"
                    : "font-bold text-[#725D4D]"
              }`}
            >
              <span className="min-w-0 truncate">{label}</span>
              <span dir="ltr" className="shrink-0 font-black">
                {formatFinanceAmount(value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
