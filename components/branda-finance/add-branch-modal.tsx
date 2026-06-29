import type { FinanceBranch } from "@/lib/branda-finance/invoice-types";

type AddBranchModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (branch: FinanceBranch) => void;
};

export function AddBranchModal({ open, onClose, onSave }: AddBranchModalProps) {
  if (!open) return null;

  function handleSubmit(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim() || "فرع جديد";
    onSave({
      id: `branch-local-${Date.now()}`,
      name,
      displayName: String(formData.get("displayName") ?? "").trim() || name,
      city: String(formData.get("city") ?? "").trim() || "الرياض",
      address: String(formData.get("address") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim() || undefined,
      licenseType: String(formData.get("licenseType") ?? "").trim() || undefined,
      licenseNumber: String(formData.get("licenseNumber") ?? "").trim() || undefined,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex max-w-full items-center justify-center overflow-hidden bg-[#24160F]/45 p-3">
      <form action={handleSubmit} className="max-h-[calc(100vh-24px)] w-full max-w-[min(96vw,760px)] min-w-0 overflow-hidden rounded-[8px] border border-[#E3CFB0] bg-[#FFFDF8] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E8D8C2] px-4 py-3">
          <h2 className="text-lg font-black text-[#2F241D]">إضافة فرع</h2>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-[8px] border border-[#E3CFB0] font-black text-[#6B3F22]">
            ×
          </button>
        </div>
        <div className="grid max-h-[calc(100vh-150px)] min-w-0 gap-3 overflow-y-auto overflow-x-hidden p-4 sm:grid-cols-2">
          <p className="rounded-[8px] border border-[#D6B677] bg-[#FFF8EA] p-3 text-[12px] font-bold leading-6 text-[#6B431C] sm:col-span-2">
            الحفظ هنا محلي داخل الواجهة فقط ولا يضيف فرعًا إلى قاعدة البيانات.
          </p>
          <TextField name="displayName" label="اسم العرض" />
          <TextField name="name" label="اسم الفرع" />
          <TextField name="phone" label="الهاتف" />
          <TextField name="licenseType" label="نوع الترخيص" />
          <TextField name="licenseNumber" label="رقم الترخيص" />
          <TextField name="address" label="العنوان" />
          <TextField name="city" label="المدينة" defaultValue="الرياض" />
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
