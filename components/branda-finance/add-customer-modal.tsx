import type { FinanceCustomer } from "@/lib/branda-finance/invoice-types";

type AddCustomerModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (customer: FinanceCustomer) => void;
};

export function AddCustomerModal({ open, onClose, onSave }: AddCustomerModalProps) {
  if (!open) return null;

  function handleSubmit(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim() || "عميل جديد";
    const country = String(formData.get("country") ?? "").trim() || "المملكة العربية السعودية";

    onSave({
      id: `customer-local-${Date.now()}`,
      name,
      country,
      vatRegistered: formData.get("vatRegistered") === "on",
      vatNumber: String(formData.get("vatNumber") ?? "").trim() || undefined,
      city: String(formData.get("city") ?? "").trim() || undefined,
      address: String(formData.get("address") ?? "").trim() || undefined,
      email: String(formData.get("email") ?? "").trim() || undefined,
      phone: String(formData.get("phone") ?? "").trim() || undefined,
      currency: "SAR",
      paymentTerms: String(formData.get("paymentTerms") ?? "").trim() || "فوري",
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex max-w-full items-center justify-center overflow-hidden bg-[#24160F]/45 p-3">
      <form action={handleSubmit} className="max-h-[calc(100vh-24px)] w-full max-w-[min(96vw,760px)] min-w-0 overflow-hidden rounded-[8px] border border-[#E3CFB0] bg-[#FFFDF8] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E8D8C2] px-4 py-3">
          <div>
            <h2 className="text-lg font-black text-[#2F241D]">إضافة عميل</h2>
            <p className="mt-1 text-[11px] font-bold text-[#806A58]">
              هذه إضافة محلية داخل الواجهة فقط ولا تنشئ سجل عميل في قاعدة البيانات.
            </p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-[8px] border border-[#E3CFB0] font-black text-[#6B3F22]">
            ×
          </button>
        </div>
        <div className="grid max-h-[calc(100vh-150px)] min-w-0 gap-3 overflow-y-auto overflow-x-hidden p-4 sm:grid-cols-2">
          <TextField name="name" label="اسم المنشأة / العميل" />
          <TextField name="country" label="البلد" defaultValue="المملكة العربية السعودية" />
          <TextField name="vatNumber" label="رقم التسجيل الضريبي" />
          <TextField name="city" label="المدينة" />
          <TextField name="address" label="العنوان" />
          <TextField name="email" label="البريد الإلكتروني" />
          <TextField name="phone" label="الهاتف" />
          <TextField name="paymentTerms" label="شروط الدفع" defaultValue="فوري" />
          <label className="flex min-h-9 min-w-0 items-center gap-2 rounded-[8px] border border-[#E8D8C2] bg-[#FAF3E8] px-2.5 text-[12px] font-bold text-[#4A3528]">
            <input name="vatRegistered" type="checkbox" className="h-4 w-4 accent-[#6B3F22]" />
            <span>مسجل في ضريبة القيمة المضافة</span>
          </label>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[#E8D8C2] px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-[8px] border border-[#D8C7B2] px-4 py-2 text-[12px] font-black text-[#654B3B]">
            إلغاء
          </button>
          <button type="submit" className="rounded-[8px] bg-[#5B3926] px-4 py-2 text-[12px] font-black text-white">
            حفظ محلي
          </button>
        </div>
      </form>
    </div>
  );
}

function TextField({ name, label, defaultValue = "" }: { name: string; label: string; defaultValue?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-black text-[#6D5544]">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        className="h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] bg-white px-2 text-[12px] font-bold text-[#2F241D] outline-none focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20"
      />
    </label>
  );
}
