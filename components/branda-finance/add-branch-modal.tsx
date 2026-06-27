import { X } from "lucide-react";
import { useState } from "react";
import type { BrandaFinanceBranch } from "@/lib/branda-finance/invoice-types";

type AddBranchModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (branch: BrandaFinanceBranch) => void;
};

const branchFields = [
  "شعار الفرع",
  "اسم العرض",
  "اسم الفرع",
  "الهاتف",
  "نوع الترخيص",
  "رقم الترخيص",
  "العنوان",
  "الشارع",
  "رقم المبنى",
  "الحي",
  "المدينة",
  "الرمز البريدي",
];

export function AddBranchModal({ open, onClose, onSave }: AddBranchModalProps) {
  const [values, setValues] = useState<Record<string, string>>({ المدينة: "الرياض" });
  if (!open) return null;

  function save() {
    const displayName = values["اسم العرض"]?.trim() || values["اسم الفرع"]?.trim() || "فرع جديد";
    onSave({
      id: `local-branch-${Date.now()}`,
      displayName,
      legalName: values["اسم الفرع"] || displayName,
      phone: values["الهاتف"] || "",
      city: values["المدينة"] || "الرياض",
      address: values["العنوان"] || "",
      licenseType: values["نوع الترخيص"] || undefined,
      licenseNumber: values["رقم الترخيص"] || undefined,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto bg-black/40 p-4">
      <div className="mx-auto max-w-3xl rounded-[24px] bg-[#FCF8F3] p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-black text-[#311912]">إضافة فرع</h2>
          <button type="button" onClick={onClose} className="rounded-2xl bg-white p-3 text-[#3A2117]" aria-label="إغلاق">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {branchFields.map((label) => (
            <label key={label} className="grid gap-2 text-sm font-black text-[#3A2117]">
              <span>{label}</span>
              <input
                value={values[label] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [label]: event.target.value }))}
                className="h-11 rounded-2xl border border-[#E7D7C6] bg-white px-3 font-bold outline-none"
                placeholder={label === "شعار الفرع" ? "رفع الشعار لاحقًا" : undefined}
              />
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-2xl bg-white px-5 py-3 font-black text-[#6B3A25]">
            إلغاء
          </button>
          <button type="button" onClick={save} className="rounded-2xl bg-[#3A2117] px-5 py-3 font-black text-white">
            حفظ محلي
          </button>
        </div>
      </div>
    </div>
  );
}
