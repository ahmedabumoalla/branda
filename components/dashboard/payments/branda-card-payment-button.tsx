"use client";

import { CreditCard, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";


type PaypalRuntime = {
  Buttons: (options: {
    style?: Record<string, unknown>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onError?: (error: unknown) => void;
    onCancel?: () => void;
  }) => {
    render: (selector: HTMLElement | string) => Promise<void>;
    close?: () => void;
  };
};

declare global {
  interface Window {
    paypal?: PaypalRuntime;
    __brandaPaypalLoader?: Promise<void>;
  }
}

type Props = {
  subscriptionId?: string;
  disabled?: boolean;
  onPaid: () => Promise<void> | void;
  onMessage?: (message: string) => void;
};

function loadPaypalSdk(clientId: string) {
  if (window.paypal) return Promise.resolve();
  if (window.__brandaPaypalLoader) return window.__brandaPaypalLoader;

  const currency = process.env.NEXT_PUBLIC_PAYPAL_CURRENCY || "USD";
  const script = document.createElement("script");
  script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons&enable-funding=card&disable-funding=paylater,venmo`;
  script.async = true;
  script.dataset.brandaPaypal = "true";

  window.__brandaPaypalLoader = new Promise<void>((resolve, reject) => {
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("تعذر تحميل بوابة الدفع"));
    document.body.appendChild(script);
  });

  return window.__brandaPaypalLoader;
}

export function BrandaCardPaymentButton({ subscriptionId, disabled, onPaid, onMessage }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

  useEffect(() => {
    if (!containerRef.current || disabled || !subscriptionId) return;

    if (!clientId) {
      setError("إعدادات بوابة الدفع غير مكتملة");
      return;
    }

    let cancelled = false;
    let buttons: ReturnType<PaypalRuntime["Buttons"]> | null = null;
    containerRef.current.innerHTML = "";

    void loadPaypalSdk(clientId)
      .then(async () => {
        if (cancelled || !window.paypal || !containerRef.current) return;
        setReady(true);
        buttons = window.paypal.Buttons({
          style: {
            layout: "vertical",
            color: "gold",
            shape: "pill",
            label: "pay",
            height: 48,
          },
          createOrder: async () => {
            setProcessing(true);
            setError("");
            const response = await fetch("/api/payments/subscription/create-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ subscriptionId }),
            });
            const payload = (await response.json().catch(() => ({}))) as {
              ok?: boolean;
              orderId?: string;
              message?: string;
              error?: string;
            };
            if (!response.ok || !payload.orderId) {
              throw new Error(payload.message || payload.error || "تعذر إنشاء عملية الدفع");
            }
            return payload.orderId;
          },
          onApprove: async (data) => {
            const response = await fetch("/api/payments/subscription/capture-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId: data.orderID, subscriptionId }),
            });
            const payload = (await response.json().catch(() => ({}))) as {
              ok?: boolean;
              message?: string;
              error?: string;
            };
            if (!response.ok || !payload.ok) {
              throw new Error(payload.message || payload.error || "تعذر تأكيد الدفع");
            }
            onMessage?.("تم الدفع بالبطاقة البنكية وتفعيل الباقة بنجاح");
            await onPaid();
            setProcessing(false);
          },
          onCancel: () => {
            setProcessing(false);
            onMessage?.("تم إلغاء عملية الدفع");
          },
          onError: (paypalError) => {
            console.error("[BrandaCardPaymentButton]", paypalError);
            setProcessing(false);
            setError(paypalError instanceof Error ? paypalError.message : "تعذر إتمام الدفع");
          },
        });
        await buttons.render(containerRef.current);
      })
      .catch((loadError) => {
        console.error("[BrandaCardPaymentButton:load]", loadError);
        setError(loadError instanceof Error ? loadError.message : "تعذر تحميل بوابة الدفع");
      });

    return () => {
      cancelled = true;
      try {
        buttons?.close?.();
      } catch {
        // ignore sdk cleanup errors
      }
    };
  }, [clientId, disabled, onMessage, onPaid, subscriptionId]);

  return (
    <div className="rounded-[28px] border border-[#E7D7C6] bg-white p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4A281D] text-white">
          <CreditCard className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-black text-[#311912]">الدفع الإلكتروني بالبطاقة البنكية</h3>
          <p className="mt-1 text-sm font-bold leading-7 text-[#806A5E]">
            يدعم الدفع ببطاقات فيزا وماستركارد والبطاقات البنكية المتاحة حسب البنك والبوابة.
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-xs font-black text-[#6B3A25]">
        <span className="rounded-xl bg-[#F8F4EF] px-3 py-2">مدى</span>
        <span className="rounded-xl bg-[#F8F4EF] px-3 py-2">Visa</span>
        <span className="rounded-xl bg-[#F8F4EF] px-3 py-2">Mastercard</span>
        <span className="rounded-xl bg-[#F8F4EF] px-3 py-2">Apple Pay حسب توفره</span>
      </div>

      {disabled || !subscriptionId ? (
        <div className="rounded-2xl bg-[#F8F4EF] p-4 text-center text-sm font-black text-[#806A5E]">
          اختر الباقة أولًا لإظهار بوابة الدفع.
        </div>
      ) : (
        <div ref={containerRef} className="min-h-[52px]" />
      )}

      {!ready && !error && !disabled && subscriptionId ? (
        <p className="mt-3 text-center text-sm font-bold text-[#806A5E]">جاري تجهيز بوابة الدفع...</p>
      ) : null}

      {processing ? (
        <p className="mt-3 text-center text-sm font-black text-[#6B3A25]">جاري معالجة الدفع...</p>
      ) : null}

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
