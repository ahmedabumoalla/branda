import { X } from "lucide-react";
import { useState } from "react";

type LoyaltyScanModalProps = {
  open: boolean;
  onClose: () => void;
  onApply: (code: string) => void;
};

export function LoyaltyScanModal({ open, onClose, onApply }: LoyaltyScanModalProps) {
  const [code, setCode] = useState("");
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] bg-black/40 p-4">
      <div className="mx-auto mt-20 max-w-md rounded-[24px] bg-[#FCF8F3] p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-[#311912]">قراءة باركود الولاء</h2>
          <button type="button" onClick={onClose} className="rounded-2xl bg-white p-3 text-[#3A2117]" aria-label="إغلاق">
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="grid gap-2 text-sm font-black text-[#3A2117]">
          <span>رقم/باركود بطاقة الولاء</span>
          <input value={code} onChange={(event) => setCode(event.target.value)} className="h-12 rounded-2xl border border-[#E7D7C6] bg-white px-4 font-bold outline-none" />
        </label>
        <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-bold text-[#806A5E]">تطبيق العميل placeholder فقط، لا يوجد وصول للجهاز أو API خارجي في هذه النسخة.</p>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-2xl bg-white px-5 py-3 font-black text-[#6B3A25]">
            إلغاء
          </button>
          <button type="button" onClick={() => onApply(code)} className="rounded-2xl bg-[#3A2117] px-5 py-3 font-black text-white">
            تطبيق العميل
          </button>
        </div>
      </div>
    </div>
  );
}
