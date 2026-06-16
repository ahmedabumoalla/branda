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

async function readPayload(response: Response) {
  return (await response.json().catch(() => ({}))) as PaymentPayload;
}

export function BarndaksaCardPaymentButton({ subscriptionId, disabled, onMessage }: Props) {
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState<"paymob" | "paypal" | null>(null);

  async function startPaymob() {
    if (!subscriptionId || disabled || processing) return;

    try {
      setProcessing("paymob");
      setError("");
      onMessage?.("جاري تجهيز Paymob...");

      const response = await fetch("/api/payments/subscription/paymob/create-intention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });

      const payload = await readPayload(response);
      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(payload.message || payload.error || "تعذر تجهيز Paymob");
      }

      window.location.href = payload.checkoutUrl;
    } catch (paymentError) {
      console.error("[BarndaksaCardPaymentButton:paymob]", paymentError);
      setProcessing(null);
      setError(paymentError instanceof Error ? paymentError.message : "تعذر إتمام الدفع عبر Paymob");
    }
  }

  async function startPaypal() {
    if (!subscriptionId || disabled || processing) return;

    try {
      setProcessing("paypal");
      setError("");
      onMessage?.("جاري تجهيز PayPal...");

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
      setError(paymentError instanceof Error ? paymentError.message : "تعذر إتمام الدفع عبر PayPal");
    }
  }

  return (
    <div className="rounded-[28px] border border-[#E7D7C6] bg-white p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4A281D] text-white">
          <CreditCard className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-black text-[#311912]">الدفع الإلكتروني للباقات</h3>
          <p className="mt-1 text-sm font-bold leading-7 text-[#806A5E]">
            اختر Paymob للبطاقات وMada وApple Pay حسب تفعيل حسابك، أو PayPal كخيار بديل.
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-xs font-black text-[#6B3A25]">
        <span className="rounded-xl bg-[#F8F4EF] px-3 py-2">Mada</span>
        <span className="rounded-xl bg-[#F8F4EF] px-3 py-2">Visa</span>
        <span className="rounded-xl bg-[#F8F4EF] px-3 py-2">Mastercard</span>
        <span className="rounded-xl bg-[#F8F4EF] px-3 py-2">Apple Pay</span>
        <span className="rounded-xl bg-[#F8F4EF] px-3 py-2">PayPal</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={startPaymob}
          disabled={disabled || !subscriptionId || Boolean(processing)}
          className="rounded-2xl bg-[#4A281D] px-6 py-4 text-center font-black text-white shadow-[0_14px_30px_rgba(74,40,29,0.18)] transition hover:bg-[#6B3A25] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {processing === "paymob" ? "جاري تجهيز Paymob..." : "الدفع عبر Paymob"}
        </button>

        <button
          type="button"
          onClick={startPaypal}
          disabled={disabled || !subscriptionId || Boolean(processing)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7D7C6] bg-[#FCF8F3] px-6 py-4 text-center font-black text-[#4A281D] transition hover:bg-[#F2E7D9] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Landmark className="h-4 w-4" />
          {processing === "paypal" ? "جاري تجهيز PayPal..." : "PayPal"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-2xl bg-red-50 p-3 text-center text-sm font-black text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-xs font-black text-emerald-700">
        <ShieldCheck className="h-4 w-4" />
        التفعيل النهائي يتم من Webhook السيرفر بعد تأكيد الدفع، وليس من المتصفح.
      </div>
    </div>
  );
}
