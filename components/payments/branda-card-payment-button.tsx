"use client";

import { CreditCard, ShieldCheck } from "lucide-react";
import { useState } from "react";

type Props = {
  subscriptionId?: string;
  disabled?: boolean;
  onPaid: () => Promise<void> | void;
  onMessage?: (message: string) => void;
};

export function BrandaCardPaymentButton({ subscriptionId, disabled, onMessage }: Props) {
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);

  async function startPayment() {
    if (!subscriptionId || disabled || processing) return;

    try {
      setProcessing(true);
      setError("");
      onMessage?.("جاري تجهيز بوابة الدفع الآمنة...");

      const response = await fetch("/api/payments/subscription/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        approveUrl?: string;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.approveUrl) {
        throw new Error(payload.message || payload.error || "تعذر تجهيز عملية الدفع");
      }

      window.location.href = payload.approveUrl;
    } catch (paymentError) {
      console.error("[BrandaCardPaymentButton]", paymentError);
      setProcessing(false);
      setError(paymentError instanceof Error ? paymentError.message : "تعذر إتمام الدفع");
    }
  }

  return (
    <div className="rounded-[28px] border border-[#E7D7C6] bg-white p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4A281D] text-white">
          <CreditCard className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-black text-[#311912]">الدفع الإلكتروني بالبطاقة البنكية</h3>
          <p className="mt-1 text-sm font-bold leading-7 text-[#806A5E]">
            ادفع بأمان عبر البطاقة البنكية. يتم تفعيل الباقة تلقائيًا بعد نجاح العملية.
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-xs font-black text-[#6B3A25]">
        <span className="rounded-xl bg-[#F8F4EF] px-3 py-2">مدى</span>
        <span className="rounded-xl bg-[#F8F4EF] px-3 py-2">Visa</span>
        <span className="rounded-xl bg-[#F8F4EF] px-3 py-2">Mastercard</span>
        <span className="rounded-xl bg-[#F8F4EF] px-3 py-2">طرق دفع معتمدة</span>
      </div>

      <button
        type="button"
        onClick={startPayment}
        disabled={disabled || !subscriptionId || processing}
        className="w-full rounded-2xl bg-[#4A281D] px-6 py-4 text-center font-black text-white shadow-[0_14px_30px_rgba(74,40,29,0.18)] transition hover:bg-[#6B3A25] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {processing ? "جاري تجهيز الدفع..." : "الدفع وتفعيل الباقة"}
      </button>

      {error ? (
        <p className="mt-3 rounded-2xl bg-red-50 p-3 text-center text-sm font-black text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-xs font-black text-emerald-700">
        <ShieldCheck className="h-4 w-4" />
        يتم تأكيد الدفع من السيرفر فقط، ولا يتم تفعيل الباقة قبل نجاح العملية.
      </div>
    </div>
  );
}
