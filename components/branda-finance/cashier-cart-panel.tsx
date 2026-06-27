import { Minus, Plus, Printer, Receipt, ScanLine, Save, Trash2 } from "lucide-react";
import type {
  BrandaFinanceBranch,
  BrandaFinanceCustomer,
  BrandaFinancePaymentMethod,
  BrandaFinanceProduct,
  BrandaFinanceWarehouse,
} from "@/lib/branda-finance/invoice-types";

export type CashierCartItem = {
  product: BrandaFinanceProduct;
  quantity: number;
};

type CashierCartPanelProps = {
  items: CashierCartItem[];
  customer?: BrandaFinanceCustomer;
  branch?: BrandaFinanceBranch;
  warehouse?: BrandaFinanceWarehouse;
  paymentMethod: BrandaFinancePaymentMethod | "";
  loyaltyCode?: string;
  subtotal: number;
  vat: number;
  total: number;
  onSetPaymentMethod: (method: "cash" | "card") => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onOpenLoyalty: () => void;
};

function money(value: number) {
  return `${value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

export function CashierCartPanel({
  items,
  customer,
  branch,
  warehouse,
  paymentMethod,
  loyaltyCode,
  subtotal,
  vat,
  total,
  onSetPaymentMethod,
  onIncrement,
  onDecrement,
  onSetQuantity,
  onRemove,
  onOpenLoyalty,
}: CashierCartPanelProps) {
  return (
    <aside className="sticky top-4 rounded-[24px] border border-[#E1CFB8] bg-white p-4 shadow-[0_20px_60px_rgba(49,25,18,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-[#311912]">فاتورة البيع</h2>
          <p className="text-xs font-bold text-[#806A5E]">POS Demo</p>
        </div>
        <Receipt className="h-6 w-6 text-[#B7791F]" />
      </div>

      <div className="mb-4 grid gap-2 rounded-2xl bg-[#FCF8F3] p-3 text-xs font-bold text-[#6B5548]">
        <span>العميل: {customer?.name || "عميل نقدي"}</span>
        <span>الفرع: {branch?.displayName || "الفرع الرئيسي"}</span>
        <span>المستودع: {warehouse?.name || "المستودع الرئيسي"}</span>
        <span>الولاء: {loyaltyCode || "غير مرتبط"}</span>
      </div>

      <div className="max-h-[34vh] space-y-3 overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={item.product.id} className="rounded-2xl border border-[#E7D7C6] bg-[#FFFDF9] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-[#311912]">{item.product.name}</p>
                <p className="text-xs font-bold text-[#806A5E]">{item.product.sku}</p>
              </div>
              <button type="button" onClick={() => onRemove(item.product.id)} className="rounded-xl bg-[#F8F1E7] p-2 text-[#6B3A25]" aria-label="حذف">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex items-center rounded-2xl border border-[#E7D7C6] bg-white">
                <button type="button" onClick={() => onIncrement(item.product.id)} className="p-2 text-[#3A2117]" aria-label="زيادة">
                  <Plus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(event) => onSetQuantity(item.product.id, Number(event.target.value) || 1)}
                  className="h-9 w-14 bg-transparent text-center font-black outline-none"
                />
                <button type="button" onClick={() => onDecrement(item.product.id)} className="p-2 text-[#3A2117]" aria-label="نقصان">
                  <Minus className="h-4 w-4" />
                </button>
              </div>
              <span className="font-black text-[#311912]">{money(item.product.price * item.quantity)}</span>
            </div>
          </div>
        ))}
        {!items.length ? <p className="rounded-2xl bg-[#FCF8F3] p-5 text-center font-bold text-[#806A5E]">اختر منتجًا لإضافته إلى الفاتورة.</p> : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {(["cash", "card"] as const).map((method) => (
          <button
            key={method}
            type="button"
            onClick={() => onSetPaymentMethod(method)}
            className={`rounded-2xl px-4 py-3 font-black ${
              paymentMethod === method ? "bg-[#3A2117] text-white" : "bg-[#FCF8F3] text-[#6B3A25]"
            }`}
          >
            {method === "cash" ? "كاش" : "بطاقة"}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2 rounded-2xl bg-[#FCF8F3] p-4 text-sm font-bold text-[#6B5548]">
        <Row label="الإجمالي" value={money(subtotal)} />
        <Row label="VAT 15%" value={money(vat)} />
        <Row label="المستحق" value={money(total)} strong />
      </div>

      <div className="mt-4 grid gap-2">
        <button type="button" disabled className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#3A2117] px-4 py-3 font-black text-white opacity-70">
          <Receipt className="h-4 w-4" />
          إنشاء فاتورة
        </button>
        <div className="grid grid-cols-3 gap-2">
          <SmallAction icon={<Printer className="h-4 w-4" />} label="طباعة" />
          <button type="button" onClick={onOpenLoyalty} className="inline-flex items-center justify-center gap-1 rounded-2xl bg-[#FCF8F3] px-3 py-3 text-xs font-black text-[#6B3A25]">
            <ScanLine className="h-4 w-4" />
            ولاء
          </button>
          <SmallAction icon={<Save className="h-4 w-4" />} label="مسودة" />
        </div>
      </div>
      <p className="mt-3 text-xs font-bold leading-5 text-[#806A5E]">الدفع المختار سيُربط لاحقًا بدفتر Branda Finance والدرج النقدي أو مزود البطاقة، دون تكامل مدى فعلي الآن.</p>
    </aside>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${strong ? "text-lg font-black text-[#311912]" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function SmallAction({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button type="button" disabled className="inline-flex items-center justify-center gap-1 rounded-2xl bg-[#FCF8F3] px-3 py-3 text-xs font-black text-[#6B3A25] opacity-70">
      {icon}
      {label}
    </button>
  );
}
