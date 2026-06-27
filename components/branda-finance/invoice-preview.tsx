import type {
  BrandaFinanceBranch,
  BrandaFinanceCustomer,
  BrandaFinanceInvoiceLine,
  BrandaFinancePaymentMethod,
} from "@/lib/branda-finance/invoice-types";
import { InvoiceTotals } from "@/components/branda-finance/invoice-totals";

type InvoicePreviewProps = {
  branch?: BrandaFinanceBranch;
  customer?: BrandaFinanceCustomer;
  lines: BrandaFinanceInvoiceLine[];
  issueDate: string;
  dueDate: string;
  paymentMethod: BrandaFinancePaymentMethod;
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
};

function money(value: number) {
  return `${value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

const paymentLabels: Record<BrandaFinancePaymentMethod, string> = {
  unpaid: "غير مدفوعة",
  cash: "كاش",
  card: "بطاقة",
  bank_transfer: "تحويل",
  credit: "آجل",
};

export function InvoicePreview({
  branch,
  customer,
  lines,
  issueDate,
  dueDate,
  paymentMethod,
  subtotal,
  discount,
  vat,
  total,
}: InvoicePreviewProps) {
  return (
    <section className="h-full rounded-[24px] border border-[#E1CFB8] bg-white p-5 shadow-[0_20px_60px_rgba(49,25,18,0.08)]">
      <div className="mb-4 flex items-start justify-between gap-4 border-b border-[#E7D7C6] pb-4">
        <div>
          <p className="text-xs font-black text-[#B7791F]">معاينة غير نهائية</p>
          <h2 className="mt-1 text-2xl font-black text-[#2B1710]">فاتورة ضريبية</h2>
          <p className="mt-1 text-sm font-bold text-[#806A5E]">INV-000101</p>
        </div>
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#E7D7C6] bg-[#FCF8F3] text-sm font-black text-[#6B3A25]">
          Branda
        </div>
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-2">
        <PreviewBlock title="البائع">
          <p className="font-black text-[#311912]">{branch?.legalName || "شركة برندة التجريبية"}</p>
          <p>{branch?.displayName || "الفرع الرئيسي"}</p>
          <p>المملكة العربية السعودية</p>
          <p>{branch?.city}</p>
        </PreviewBlock>
        <PreviewBlock title="العميل">
          <p className="font-black text-[#311912]">{customer?.name || "عميل نقدي"}</p>
          <p>{customer?.billingAddress || "بيع مباشر"}</p>
          <p>{customer?.taxNumber ? `الرقم الضريبي: ${customer.taxNumber}` : "غير مسجل ضريبيًا"}</p>
        </PreviewBlock>
      </div>

      <div className="my-4 grid gap-2 rounded-2xl bg-[#FCF8F3] p-3 text-sm font-bold text-[#6B5548] sm:grid-cols-3">
        <span>تاريخ الإصدار: {issueDate}</span>
        <span>تاريخ الاستحقاق: {dueDate}</span>
        <span>طريقة الدفع: {paymentLabels[paymentMethod]}</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#E7D7C6]">
        <table className="w-full text-sm">
          <thead className="bg-[#F8F1E7] text-[#3A2117]">
            <tr>
              <th className="p-3 text-right">الوصف</th>
              <th className="p-3">الكمية</th>
              <th className="p-3">السعر</th>
              <th className="p-3">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-t border-[#F0E5DA]">
                <td className="p-3 font-bold text-[#311912]">{line.description}</td>
                <td className="p-3 text-center">{line.quantity}</td>
                <td className="p-3 text-center">{money(line.unitPrice)}</td>
                <td className="p-3 text-center font-black">{money(line.quantity * line.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <InvoiceTotals subtotal={subtotal} discount={discount} vat={vat} total={total} />
      </div>

      <div className="mt-4 rounded-2xl bg-[#FCF8F3] p-4 text-sm font-bold leading-7 text-[#6B5548]">
        <p className="font-black text-[#311912]">ملاحظات</p>
        <p>هذه معاينة تجريبية داخل Branda Finance. الاعتماد النهائي وربط القيود المحاسبية سيضاف لاحقًا عند تفعيل قاعدة البيانات.</p>
      </div>
    </section>
  );
}

function PreviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E7D7C6] bg-[#FFFDF9] p-4 text-[#6B5548]">
      <p className="mb-2 text-xs font-black text-[#B7791F]">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
