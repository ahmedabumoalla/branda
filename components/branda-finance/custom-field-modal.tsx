import { X } from "lucide-react";
import { useState } from "react";
import type { BrandaFinanceCustomField } from "@/lib/branda-finance/invoice-types";

type CustomFieldModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (field: BrandaFinanceCustomField) => void;
};

export function CustomFieldModal({ open, onClose, onSave }: CustomFieldModalProps) {
  const [name, setName] = useState("");
  const [appliesTo, setAppliesTo] = useState<BrandaFinanceCustomField["appliesTo"]>("invoice");
  const [fieldType, setFieldType] = useState<BrandaFinanceCustomField["fieldType"]>("text");

  if (!open) return null;

  function save() {
    onSave({
      id: `local-field-${Date.now()}`,
      name: name.trim() || "حقل مخصص",
      appliesTo,
      fieldType,
      value: "",
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-black/40 p-4">
      <div className="mx-auto mt-16 max-w-xl rounded-[24px] bg-[#FCF8F3] p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-black text-[#311912]">إضافة حقل مخصص</h2>
          <button type="button" onClick={onClose} className="rounded-2xl bg-white p-3 text-[#3A2117]" aria-label="إغلاق">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-3">
          <label className="grid gap-2 text-sm font-black text-[#3A2117]">
            <span>الاسم</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="h-11 rounded-2xl border border-[#E7D7C6] bg-white px-3 font-bold outline-none" />
          </label>
          <label className="grid gap-2 text-sm font-black text-[#3A2117]">
            <span>ينطبق على</span>
            <select value={appliesTo} onChange={(event) => setAppliesTo(event.target.value as BrandaFinanceCustomField["appliesTo"])} className="h-11 rounded-2xl border border-[#E7D7C6] bg-white px-3 font-bold outline-none">
              <option value="invoice">الفاتورة</option>
              <option value="customer">العميل</option>
              <option value="item">الصنف</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-black text-[#3A2117]">
            <span>نوع الحقل</span>
            <select value={fieldType} onChange={(event) => setFieldType(event.target.value as BrandaFinanceCustomField["fieldType"])} className="h-11 rounded-2xl border border-[#E7D7C6] bg-white px-3 font-bold outline-none">
              <option value="text">نص</option>
              <option value="textarea">نص متعدد الأسطر</option>
              <option value="number">رقم</option>
              <option value="date">تاريخ</option>
              <option value="select">اختيار</option>
            </select>
          </label>
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
