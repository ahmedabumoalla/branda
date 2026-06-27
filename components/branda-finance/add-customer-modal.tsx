import { X } from "lucide-react";
import { useState } from "react";
import type { BrandaFinanceCustomer } from "@/lib/branda-finance/invoice-types";

type AddCustomerModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (customer: BrandaFinanceCustomer) => void;
};

const fieldLabels = [
  "اسم المنشأة",
  "البلد",
  "رقم التسجيل الضريبي",
  "العنوان",
  "المدينة",
  "الشارع",
  "رقم المبنى",
  "الحي",
  "الرمز البريدي",
  "بيانات الفوترة",
  "المعرف",
  "البريد الإلكتروني",
  "الهاتف",
  "العملة",
  "شروط الدفع",
  "الحساب الافتراضي للإيرادات",
  "مركز تكلفة الإيرادات الافتراضي",
  "معدل الضريبة الافتراضي",
  "الحقول المخصصة",
];

export function AddCustomerModal({ open, onClose, onSave }: AddCustomerModalProps) {
  const [values, setValues] = useState<Record<string, string>>({
    البلد: "المملكة العربية السعودية",
    العملة: "SAR",
    "شروط الدفع": "فوري",
  });
  const [vatRegistered, setVatRegistered] = useState(true);

  if (!open) return null;

  function save() {
    const name = values["اسم المنشأة"]?.trim() || "عميل جديد";
    onSave({
      id: `local-customer-${Date.now()}`,
      name,
      contactName: values["المعرف"] || name,
      email: values["البريد الإلكتروني"] || "",
      phone: values["الهاتف"] || "",
      country: values["البلد"] || "المملكة العربية السعودية",
      city: values["المدينة"] || "",
      vatRegistered,
      taxNumber: values["رقم التسجيل الضريبي"] || undefined,
      billingAddress: values["بيانات الفوترة"] || values["العنوان"] || "",
      currency: "SAR",
      paymentTerms: values["شروط الدفع"] || "فوري",
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto bg-black/40 p-4">
      <div className="mx-auto max-w-4xl rounded-[24px] bg-[#FCF8F3] p-5 shadow-2xl">
        <Header title="إضافة عميل" onClose={onClose} />
        <label className="mb-4 flex items-center gap-3 rounded-2xl bg-white p-3 text-sm font-black text-[#3A2117]">
          <input type="checkbox" checked={vatRegistered} onChange={(event) => setVatRegistered(event.target.checked)} />
          جهة الاتصال مسجلة في ضريبة القيمة المضافة في السعودية
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          {fieldLabels.map((label) => (
            <Field key={label} label={label} value={values[label] ?? ""} onChange={(value) => setValues((current) => ({ ...current, [label]: value }))} />
          ))}
        </div>
        <Footer onClose={onClose} onSave={save} />
      </div>
    </div>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <h2 className="text-2xl font-black text-[#311912]">{title}</h2>
      <button type="button" onClick={onClose} className="rounded-2xl bg-white p-3 text-[#3A2117]" aria-label="إغلاق">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm font-black text-[#3A2117]">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-2xl border border-[#E7D7C6] bg-white px-3 font-bold outline-none" />
    </label>
  );
}

function Footer({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  return (
    <div className="mt-5 flex justify-end gap-3">
      <button type="button" onClick={onClose} className="rounded-2xl bg-white px-5 py-3 font-black text-[#6B3A25]">
        إلغاء
      </button>
      <button type="button" onClick={onSave} className="rounded-2xl bg-[#3A2117] px-5 py-3 font-black text-white">
        حفظ محلي
      </button>
    </div>
  );
}
