import type { FinanceCustomField } from "@/lib/branda-finance/invoice-types";

type CustomFieldModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (field: FinanceCustomField) => void;
};

const fieldTypes: Array<{ value: FinanceCustomField["type"]; label: string }> = [
  { value: "text", label: "نص" },
  { value: "textarea", label: "نص متعدد الأسطر" },
  { value: "number", label: "رقم" },
  { value: "date", label: "تاريخ" },
  { value: "select", label: "اختيار" },
];

export function CustomFieldModal({ open, onClose, onSave }: CustomFieldModalProps) {
  if (!open) return null;

  function handleSubmit(formData: FormData) {
    onSave({
      id: `custom-local-${Date.now()}`,
      name: String(formData.get("name") ?? "").trim() || "حقل مخصص",
      appliesTo: String(formData.get("appliesTo") ?? "").trim() || "الفاتورة",
      type: String(formData.get("type") ?? "text") as FinanceCustomField["type"],
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex max-w-full items-center justify-center overflow-hidden bg-[#24160F]/45 p-3">
      <form action={handleSubmit} className="max-h-[calc(100vh-24px)] w-full max-w-[min(96vw,520px)] min-w-0 overflow-hidden rounded-[8px] border border-[#E3CFB0] bg-[#FFFDF8] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E8D8C2] px-4 py-3">
          <h2 className="text-lg font-black text-[#2F241D]">إضافة حقل مخصص</h2>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-[8px] border border-[#E3CFB0] font-black text-[#6B3F22]">
            ×
          </button>
        </div>
        <div className="max-h-[calc(100vh-150px)] space-y-3 overflow-y-auto overflow-x-hidden p-4">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[11px] font-black text-[#6D5544]">الاسم</span>
            <input name="name" className="h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] bg-white px-2 text-[12px] font-bold outline-none focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20" />
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[11px] font-black text-[#6D5544]">ينطبق على</span>
            <select name="appliesTo" className="h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] bg-white px-2 text-[12px] font-bold outline-none focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20">
              <option>الفاتورة</option>
              <option>العميل</option>
              <option>بند الفاتورة</option>
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[11px] font-black text-[#6D5544]">نوع الحقل</span>
            <select name="type" className="h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] bg-white px-2 text-[12px] font-bold outline-none focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20">
              {fieldTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
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
