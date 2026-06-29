type LoyaltyScanModalProps = {
  open: boolean;
  onClose: () => void;
  onApply: (code: string) => void;
};

export function LoyaltyScanModal({ open, onClose, onApply }: LoyaltyScanModalProps) {
  if (!open) return null;

  function handleSubmit(formData: FormData) {
    const code = String(formData.get("code") ?? "").trim();
    const customerName = String(formData.get("customerName") ?? "").trim();
    const discount = formData.get("localDiscount") ? "خصم محلي" : "";
    onApply([code, customerName, discount].filter(Boolean).join(" - "));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex max-w-full items-center justify-center overflow-hidden bg-[#24160F]/45 p-3">
      <form action={handleSubmit} className="max-h-[calc(100vh-24px)] w-full max-w-[min(96vw,440px)] min-w-0 overflow-hidden rounded-[8px] border border-[#E3CFB0] bg-[#FFFDF8] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E8D8C2] px-4 py-3">
          <h2 className="text-lg font-black text-[#2F241D]">قراءة باركود الولاء</h2>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-[8px] border border-[#E3CFB0] font-black text-[#6B3F22]">
            ×
          </button>
        </div>
        <div className="max-h-[calc(100vh-150px)] space-y-3 overflow-y-auto overflow-x-hidden p-4">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[11px] font-black text-[#6D5544]">رقم بطاقة الولاء / الباركود</span>
            <input name="code" className="h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] bg-white px-2 text-[12px] font-bold outline-none focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20" />
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[11px] font-black text-[#6D5544]">اسم العميل</span>
            <input name="customerName" className="h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] bg-white px-2 text-[12px] font-bold outline-none focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20" />
          </label>
          <label className="flex items-center gap-3 rounded-[8px] border border-[#E6D7C3] bg-[#FAF3E8] p-3 text-xs font-black text-[#6B431C]">
            <input name="localDiscount" type="checkbox" className="h-4 w-4 accent-[#5B3926]" />
            تطبيق خصم محلي
          </label>
          <div className="rounded-[8px] border border-[#E6D7C3] bg-[#FAF3E8] p-3 text-xs font-bold leading-6 text-[#6B431C]">
            التطبيق هنا محلي فقط. لا يوجد وصول للكاميرا أو أجهزة قراءة خارجية في الوضع الحالي.
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[#E8D8C2] px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-[8px] border border-[#D8C7B2] px-4 py-2 text-[12px] font-black text-[#654B3B]">
            إلغاء
          </button>
          <button type="submit" className="rounded-[8px] bg-[#5B3926] px-4 py-2 text-[12px] font-black text-white">
            تطبيق العميل
          </button>
        </div>
      </form>
    </div>
  );
}
