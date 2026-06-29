import { X } from "lucide-react";
import { InvoicePreview, type InvoicePreviewProps } from "@/components/branda-finance/invoice-preview";

type InvoicePreviewModalProps = InvoicePreviewProps & {
  open: boolean;
  onClose: () => void;
};

export function InvoicePreviewModal({ open, onClose, ...previewProps }: InvoicePreviewModalProps) {
  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex max-w-full items-stretch justify-center overflow-hidden bg-[#2F241D]/45 p-0 text-right text-[#2F241D] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invoice-preview-modal-title"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-[min(96vw,1120px)] min-w-0 flex-col overflow-hidden bg-[#FFFDF8] shadow-[0_24px_70px_rgba(47,36,29,0.24)] sm:max-h-[92vh] sm:rounded-[8px] sm:border sm:border-[#D8C3A2]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[#E8D8C2] bg-[#FFFDF8] px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <h2 id="invoice-preview-modal-title" className="text-lg font-black text-[#2F241D]">
              معاينة الفاتورة
            </h2>
            <span className="mt-1.5 inline-flex rounded-[8px] border border-[#D6B677] bg-[#F8E8C9] px-2.5 py-1 text-[11px] font-black text-[#6B431C]">
              معاينة غير نهائية
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[#E6CFC8] bg-[#FFF7F4] text-[#9B3327] transition hover:bg-[#FBE5DF]"
            aria-label="إغلاق معاينة الفاتورة"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#F5EFE6] p-3 sm:p-4">
          <InvoicePreview {...previewProps} sticky={false} className="mx-auto max-w-full shadow-none" />
        </div>
      </div>
    </div>
  );
}
