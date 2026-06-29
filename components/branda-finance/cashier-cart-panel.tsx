import Link from "next/link";
import { Minus, Plus, Printer, ReceiptText, ScanLine, Trash2 } from "lucide-react";
import { formatFinanceAmount } from "@/components/branda-finance/invoice-totals";
import type {
  FinanceBranch,
  FinanceCustomer,
  FinancePaymentMethod,
  FinanceProduct,
  FinanceWarehouse,
} from "@/lib/branda-finance/invoice-types";

export type CartItem = {
  product: FinanceProduct;
  quantity: number;
  note?: string;
};

type CashierCartPanelProps = {
  items: CartItem[];
  customer: FinanceCustomer;
  branch: FinanceBranch;
  warehouse?: FinanceWarehouse | null;
  paymentMethod: FinancePaymentMethod["id"] | "";
  paymentMethods: FinancePaymentMethod[];
  loyaltyCode: string;
  loyaltyEnabled?: boolean;
  invoicePreviewReady: boolean;
  realInvoicePersistenceReady?: boolean;
  onPaymentMethodChange: (method: FinancePaymentMethod["id"]) => void;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onQuantityChange: (productId: string, quantity: number) => void;
  onNoteChange: (productId: string, note: string) => void;
  onRemove: (productId: string) => void;
  onCreateInvoicePreview: () => void;
  onOpenLoyalty: () => void;
};

export function cartTotals(items: CartItem[]) {
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const vat = items.reduce((sum, item) => sum + item.product.price * item.quantity * (item.product.vatRate / 100), 0);
  const earnedPoints = items.reduce((sum, item) => sum + (item.product.loyaltyPointsEarned ?? 0) * item.quantity, 0);
  return { subtotal, vat, total: subtotal + vat, earnedPoints };
}

export function CashierCartPanel({
  items,
  customer,
  branch,
  warehouse,
  paymentMethod,
  paymentMethods,
  loyaltyCode,
  loyaltyEnabled = false,
  invoicePreviewReady,
  realInvoicePersistenceReady = false,
  onPaymentMethodChange,
  onIncrease,
  onDecrease,
  onQuantityChange,
  onNoteChange,
  onRemove,
  onCreateInvoicePreview,
  onOpenLoyalty,
}: CashierCartPanelProps) {
  const totals = cartTotals(items);
  const loyaltyDiscount = 0;
  const payableTotal = totals.total;
  const methodLabel = paymentMethods.find((method) => method.id === paymentMethod)?.name ?? "غير محدد";
  const canCreateInvoice = realInvoicePersistenceReady && Boolean(items.length && paymentMethod);

  return (
    <aside className="w-full max-w-full min-w-0 overflow-hidden rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3 shadow-[0_16px_38px_rgba(69,43,28,0.10)] lg:sticky lg:top-5">
      <div className="flex min-w-0 items-start justify-between gap-3 border-b border-[#E8D8C2] pb-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-[#9C6B2E]">فاتورة الكاشير</p>
          <h2 className="mt-1 truncate text-lg font-black text-[#2F241D]">مسودة بيع مباشرة</h2>
        </div>
        <ReceiptText className="h-7 w-7 text-[#5B3926]" />
      </div>

      <div className="mt-3 grid gap-2 text-[11px] font-bold text-[#6D5544]">
        <SummaryLine label="العميل" value={customer.name} />
        <SummaryLine label="الفرع" value={branch.displayName || branch.name} />
        <SummaryLine label="المستودع" value={warehouse?.name ?? "لا توجد مستودعات مرتبطة بعد"} />
      </div>

      <div className="mt-3 max-h-[42vh] space-y-2 overflow-y-auto overflow-x-hidden pr-0.5">
        {items.length ? (
          items.map((item) => (
            <div key={item.product.id} className="min-w-0 rounded-[8px] border border-[#E6D7C3] bg-white p-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="line-clamp-1 text-sm font-black text-[#2F241D]">{item.product.name}</h3>
                  <p className="mt-1 text-xs font-bold text-[#806A58]" dir="ltr">
                    {item.product.sku} - {item.product.barcode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(item.product.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[#E6CFC8] bg-[#FFF7F4] text-[#9B3327]"
                  title="حذف"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                <div className="flex items-center rounded-[8px] border border-[#E1D1BD] bg-[#FFFDF8]">
                  <button type="button" onClick={() => onIncrease(item.product.id)} className="flex h-9 w-9 items-center justify-center text-[#5B3926]">
                    <Plus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(event) => onQuantityChange(item.product.id, Math.max(1, Number(event.target.value) || 1))}
                    className="h-9 w-14 border-x border-[#E1D1BD] bg-white text-center text-sm font-black outline-none"
                  />
                  <button type="button" onClick={() => onDecrease(item.product.id)} className="flex h-9 w-9 items-center justify-center text-[#5B3926]">
                    <Minus className="h-4 w-4" />
                  </button>
                </div>
                <span className="shrink-0 text-[12px] font-black text-[#2F241D]" dir="ltr">
                  {formatFinanceAmount(item.product.price * item.quantity)}
                </span>
              </div>
              <input
                value={item.note ?? ""}
                onChange={(event) => onNoteChange(item.product.id, event.target.value)}
                placeholder="ملاحظة على البند"
                className="mt-2 h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] bg-[#FFFDF8] px-2 text-[11px] font-bold outline-none focus:border-[#B88334]"
              />
            </div>
          ))
        ) : (
          <div className="rounded-[8px] border border-dashed border-[#D8C3A2] bg-[#FAF3E8] p-6 text-center text-sm font-black text-[#7D6654]">
            اختر منتجًا حقيقيًا من القائمة لإضافته إلى الفاتورة.
          </div>
        )}
      </div>

      <div className="mt-3 rounded-[8px] border border-[#E6D7C3] bg-white p-3">
        <p className="mb-2 text-[13px] font-black text-[#2F241D]">طريقة الدفع</p>
        <div className="grid grid-cols-2 gap-2">
          {paymentMethods.map((method) => (
            <button
              key={method.id}
              type="button"
              onClick={() => onPaymentMethodChange(method.id)}
              className={`h-9 rounded-[8px] border text-[12px] font-black ${
                paymentMethod === method.id
                  ? "border-[#2F5D50] bg-[#2F5D50] text-white"
                  : "border-[#E1D1BD] bg-[#FFFDF8] text-[#5B3926]"
              }`}
            >
              {method.name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] font-bold leading-5 text-[#806A58]">
          مدى والبطاقات تتطلب مزود دفع رسمي. الاختيار هنا محلي ولا يرحل أي عملية مالية.
        </p>
      </div>

      {loyaltyEnabled ? (
        <div className="mt-3 rounded-[8px] border border-[#D6B677] bg-[#FFF8EA] p-3 text-[12px]">
          <div className="flex justify-between gap-3 font-black text-[#6B431C]">
            <span>بطاقة الولاء</span>
            <span>{loyaltyCode || "غير مرتبطة"}</span>
          </div>
          <div className="mt-2 flex justify-between gap-3 font-bold text-[#6B431C]">
            <span>النقاط المكتسبة من الفاتورة</span>
            <span>{totals.earnedPoints} نقطة</span>
          </div>
          <p className="mt-2 text-[11px] font-bold leading-5 text-[#806A58]">
            لا يتم تسجيل نقاط حقيقية من شاشة برندة المالية الآن.
          </p>
        </div>
      ) : null}

      <div className="mt-3 space-y-2 rounded-[8px] border border-[#E6D7C3] bg-[#FAF3E8] p-3 text-[12px]">
        <TotalLine label="الإجمالي الفرعي" value={totals.subtotal} />
        <TotalLine label="VAT 15%" value={totals.vat} />
        {loyaltyEnabled ? <TotalLine label="خصم الولاء" value={-loyaltyDiscount} /> : null}
        <TotalLine label="الإجمالي" value={payableTotal} strong />
      </div>

      <div className="mt-3 rounded-[8px] border border-[#E6D7C3] bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-black text-[#2F241D]">معاينة بيان الفاتورة</h3>
          <span className="text-xs font-black text-[#2F5D50]">{methodLabel}</span>
        </div>
        <p className="text-xs font-bold leading-6 text-[#806A58]">
          {items.length} بند، إجمالي {formatFinanceAmount(payableTotal)}، العميل {customer.name}.
          {loyaltyEnabled && loyaltyCode ? ` بطاقة الولاء: ${loyaltyCode}.` : ""}
        </p>
        {invoicePreviewReady ? (
          <div className="mt-3 rounded-[8px] border border-[#CFE2D8] bg-[#EDF7F2] p-3 text-xs font-bold leading-6 text-[#2F5D50]">
            تم تجهيز ملخص محلي فقط بدون كتابة في قاعدة البيانات.
            <Link
              href="/dashboard/branda-finance/invoicing/create?source=cashier"
              className="mt-3 inline-flex h-10 items-center justify-center rounded-[8px] bg-[#2F5D50] px-4 text-xs font-black text-white"
            >
              فتح صفحة إنشاء الفاتورة
            </Link>
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid gap-1.5">
        <button
          disabled={!canCreateInvoice}
          type="button"
          onClick={onCreateInvoicePreview}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-[#5B3926] text-[12px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ReceiptText className="h-4 w-4" />
          إنشاء فاتورة
        </button>
        {!realInvoicePersistenceReady ? (
          <p className="rounded-[8px] border border-[#D6B677] bg-[#FFF8EA] p-2 text-center text-[11px] font-bold leading-5 text-[#6B431C]">
            إنشاء الفاتورة الحقيقي معطل حتى تفعيل جداول الفواتير بعد مراجعة قاعدة البيانات.
          </p>
        ) : null}
        <button
          type="button"
          disabled
          title="يتطلب ربط قاعدة البيانات"
          className="inline-flex h-9 cursor-not-allowed items-center justify-center gap-1.5 rounded-[8px] border border-[#D8C7B2] bg-white text-[12px] font-black text-[#5B3926] opacity-60"
        >
          حفظ كمسودة - يتطلب ربط قاعدة البيانات
        </button>
        <button
          type="button"
          disabled
          title="يتطلب جهاز طباعة"
          className="inline-flex h-9 cursor-not-allowed items-center justify-center gap-1.5 rounded-[8px] border border-[#D8C7B2] bg-white text-[12px] font-black text-[#5B3926] opacity-60"
        >
          <Printer className="h-4 w-4" />
          طباعة - تتطلب جهاز
        </button>
        {loyaltyEnabled ? (
          <button
            type="button"
            onClick={onOpenLoyalty}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-[#D6B677] bg-[#F8E8C9] text-[12px] font-black text-[#6B431C]"
          >
            <ScanLine className="h-4 w-4" />
            قراءة باركود الولاء
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-[8px] bg-[#FAF3E8] px-2.5 py-1.5">
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 truncate font-black text-[#2F241D]">{value}</span>
    </div>
  );
}

function TotalLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex min-w-0 items-center justify-between gap-3 ${strong ? "border-t border-[#D8C3A2] pt-2 text-[15px] font-black text-[#2F241D]" : "font-bold text-[#6D5544]"}`}>
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0" dir="ltr">{formatFinanceAmount(value)}</span>
    </div>
  );
}
