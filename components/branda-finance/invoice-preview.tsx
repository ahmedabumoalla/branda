import { formatFinanceAmount, lineTotal } from "@/components/branda-finance/invoice-totals";
import type { InvoiceTotalsValue } from "@/components/branda-finance/invoice-totals";
import type {
  FinanceBranch,
  FinanceCustomer,
  FinanceInvoiceItem,
  FinancePaymentMethod,
  FinanceWarehouse,
} from "@/lib/branda-finance/invoice-types";

export type InvoicePreviewProps = {
  branch: FinanceBranch;
  warehouse: FinanceWarehouse;
  customer: FinanceCustomer;
  items: FinanceInvoiceItem[];
  totals: InvoiceTotalsValue;
  issueDate: string;
  dueDate: string;
  paymentMethod: FinancePaymentMethod;
  invoiceStatus: string;
  sticky?: boolean;
  className?: string;
};

export function InvoicePreview({
  branch,
  warehouse,
  customer,
  items,
  totals,
  issueDate,
  dueDate,
  paymentMethod,
  invoiceStatus,
  sticky = true,
  className = "",
}: InvoicePreviewProps) {
  return (
    <aside
      className={`w-full max-w-full min-w-0 overflow-hidden rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3 shadow-[0_16px_38px_rgba(69,43,28,0.10)] sm:p-4 ${
        sticky ? "lg:sticky lg:top-5" : ""
      } ${className}`}
    >
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-[#9C6B2E]">معاينة غير محفوظة</p>
          <h2 className="mt-1 truncate text-xl font-black text-[#2F241D]">فاتورة مبيعات</h2>
          <p className="mt-1 text-xs font-bold text-[#806A58]">بانتظار إصدار رقم</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-[#D8BD89] bg-[#F2E0BF] text-base font-black text-[#5B3926]">
          B
        </div>
      </div>

      <div className="rounded-[8px] border border-[#E6D7C3] bg-[#FAF3E8] p-3">
        <div className="grid min-w-0 gap-2 text-[12px] sm:grid-cols-2">
          <PreviewLine label="البائع" value={branch.displayName || branch.name} />
          <PreviewLine label="الفرع" value={branch.city} />
          <PreviewLine label="المستودع" value={warehouse.name} />
          <PreviewLine label="رقم الفاتورة" value="غير صادر" />
          <PreviewLine label="تاريخ الإصدار" value={issueDate} />
          <PreviewLine label="تاريخ الاستحقاق" value={dueDate} />
          <PreviewLine label="العميل" value={customer.name} />
          <PreviewLine label="الرقم الضريبي" value={customer.vatNumber ?? "غير مسجل"} />
        </div>
      </div>

      <div className="mt-3 max-w-full overflow-x-auto rounded-[8px] border border-[#E6D7C3]">
        <table className="w-full min-w-[520px] text-right text-xs">
          <thead className="bg-[#2F241D] text-white">
            <tr>
              <th className="px-3 py-2">البند</th>
              <th className="px-3 py-2">الكمية</th>
              <th className="px-3 py-2">VAT</th>
              <th className="px-3 py-2">الإجمالي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFE3D2] bg-white">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="max-w-[220px] truncate px-3 py-2.5 font-bold text-[#2F241D]">{item.description || "بند فاتورة"}</td>
                <td className="px-3 py-3">{item.quantity}</td>
                <td className="px-3 py-3" dir="ltr">
                  {item.taxRate}%
                </td>
                <td className="px-3 py-3 font-black" dir="ltr">
                  {formatFinanceAmount(lineTotal(item))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 space-y-2 rounded-[8px] border border-[#E6D7C3] bg-white p-3 text-[12px]">
        <PreviewTotal label="الإجمالي الفرعي" value={totals.subtotal} />
        <PreviewTotal label="الخصومات" value={totals.itemDiscount + totals.discount} />
        <PreviewTotal label="ضريبة القيمة المضافة 15%" value={totals.vat} />
        <PreviewTotal label="الإجمالي" value={totals.total} strong />
        <PreviewTotal label="المدفوع" value={totals.amountPaid} />
        <PreviewTotal label="المتبقي" value={totals.remainingBalance} strong />
      </div>

      <div className="mt-3 grid min-w-0 gap-2 text-[12px] sm:grid-cols-2">
        <div className="rounded-[8px] border border-[#E6D7C3] bg-[#FAF3E8] p-3">
          <p className="text-xs font-black text-[#856A54]">طريقة الدفع</p>
          <p className="mt-1 font-black text-[#2F241D]">{paymentMethod.name}</p>
        </div>
        <div className="rounded-[8px] border border-[#E6D7C3] bg-[#FAF3E8] p-3">
          <p className="text-xs font-black text-[#856A54]">حالة الدفع</p>
          <p className="mt-1 font-black text-[#2F241D]">{invoiceStatus}</p>
        </div>
      </div>

      <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[96px_minmax(0,1fr)]">
        <div className="flex aspect-square items-center justify-center rounded-[8px] border border-dashed border-[#CFA85F] bg-[#FFF8EA] text-center text-xs font-black leading-5 text-[#6B431C]">
          QR غير مفعل
        </div>
        <div className="min-w-0 rounded-[8px] border border-dashed border-[#CFA85F] bg-[#FFF8EA] p-3 text-xs font-bold leading-6 text-[#6B431C]">
          هذه المعاينة محلية لإنشاء فواتير المبيعات بدون حفظ دائم. لا يوجد اعتماد زاتكا أو ترحيل محاسبي أو طباعة فعلية قبل تفعيل الجداول.
        </div>
      </div>
    </aside>
  );
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-black text-[#856A54]">{label}</p>
      <p className="mt-1 truncate font-black text-[#2F241D]">{value}</p>
    </div>
  );
}

function PreviewTotal({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        strong ? "border-t border-[#E6D7C3] pt-2 text-lg font-black text-[#2F241D]" : "font-bold text-[#6D5544]"
      }`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0" dir="ltr">{formatFinanceAmount(value)}</span>
    </div>
  );
}
