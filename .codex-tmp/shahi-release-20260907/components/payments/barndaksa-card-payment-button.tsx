"use client";

import { CreditCard, Landmark, ShieldCheck } from "lucide-react";
import { useState } from "react";

type Props = {
  subscriptionId?: string;
  disabled?: boolean;
  onPaid: () => Promise<void> | void;
  onMessage?: (message: string) => void;
};

type PaymentPayload = {
  ok?: boolean;
  checkoutUrl?: string;
  approveUrl?: string;
  message?: string;
  error?: string;
};

type ProcessingMethod = "card" | "apple_pay" | "paypal" | null;

async function readPayload(response: Response) {
  return (await response.json().catch(() => ({}))) as PaymentPayload;
}

export function BarndaksaCardPaymentButton({ subscriptionId, disabled, onMessage }: Props) {
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState<ProcessingMethod>(null);

  async function startPaymob(paymentMethod: "card" | "apple_pay") {
    if (!subscriptionId || disabled || processing) return;

    const label = paymentMethod === "apple_pay" ? "Apple Pay" : "مدى / Visa / Mastercard";

    try {
      setProcessing(paymentMethod);
      setError("");
      onMessage?.(`جاري تحويلك إلى صفحة دفع ${label}...`);

      const response = await fetch("/api/payments/subscription/paymob/create-intention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId, paymentMethod }),
      });

      const payload = await readPayload(response);
      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(payload.message || payload.error || "تعذر تجهيز صفحة الدفع");
      }

      window.location.href = payload.checkoutUrl;
    } catch (paymentError) {
      console.error("[BarndaksaCardPaymentButton:paymob]", paymentError);
      setProcessing(null);
      setError(paymentError instanceof Error ? paymentError.message : "تعذر فتح صفحة الدفع");
    }
  }

  async function startPaypal() {
    if (!subscriptionId || disabled || processing) return;

    try {
      setProcessing("paypal");
      setError("");
      onMessage?.("جاري تحويلك إلى PayPal...");

      const response = await fetch("/api/payments/subscription/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });

      const payload = await readPayload(response);
      if (!response.ok || !payload.approveUrl) {
        throw new Error(payload.message || payload.error || "تعذر تجهيز PayPal");
      }

      window.location.href = payload.approveUrl;
    } catch (paymentError) {
      console.error("[BarndaksaCardPaymentButton:paypal]", paymentError);
      setProcessing(null);
      setError(paymentError instanceof Error ? paymentError.message : "تعذر فتح PayPal");
    }
  }

  const isBusy = Boolean(processing);
  const isDisabled = disabled || !subscriptionId || isBusy;

  return (
    <div className="rounded-[28px] border border-[#E7D7C6] bg-white p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4A281D] text-white">
          <CreditCard className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-black text-[#311912]">اختر طريقة الدفع</h3>
          <p className="mt-1 text-sm font-bold leading-7 text-[#806A5E]">
            سيتم تحويلك إلى صفحة الدفع الآمنة لإكمال العملية، ولا تتغير الباقة إلا بعد نجاح الدفع.
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        <button
          type="button"
          onClick={() => startPaymob("card")}
          disabled={isDisabled}
          className="flex items-center justify-between gap-3 rounded-2xl bg-[#4A281D] px-5 py-4 text-right font-black text-white shadow-[0_14px_30px_rgba(74,40,29,0.18)] transition hover:bg-[#6B3A25] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>
            {processing === "card" ? "جاري تجهيز صفحة الدفع..." : "مدى / Visa / Mastercard"}
          </span>
          <CreditCard className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => startPaymob("apple_pay")}
          disabled={isDisabled}
          className="flex items-center justify-between gap-3 rounded-2xl border border-[#E7D7C6] bg-[#111111] px-5 py-4 text-right font-black text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>{processing === "apple_pay" ? "جاري تجهيز Apple Pay..." : "Apple Pay"}</span>
          <span className="text-lg"></span>
        </button>

        <button
          type="button"
          onClick={startPaypal}
          disabled={isDisabled}
          className="flex items-center justify-between gap-3 rounded-2xl border border-[#E7D7C6] bg-[#FCF8F3] px-5 py-4 text-right font-black text-[#4A281D] transition hover:bg-[#F2E7D9] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>{processing === "paypal" ? "جاري تجهيز PayPal..." : "PayPal"}</span>
          <Landmark className="h-5 w-5" />
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-2xl bg-red-50 p-3 text-center text-sm font-black text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-xs font-black text-emerald-700">
        <ShieldCheck className="h-4 w-4" />
        الدفع يتم عبر بوابة آمنة، والتفعيل النهائي يتم بعد تأكيد العملية من السيرفر.
      </div>
    </div>
  );
}
