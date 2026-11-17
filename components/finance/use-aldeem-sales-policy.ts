"use client";
import { useEffect, useState } from "react";
import { type Policy } from "@/lib/finance/aldeem-sales-policy";
import { loadAldeemAccountPolicy, aldeemPolicyChanged } from "@/lib/finance/aldeem-sales-policy-client";
import { defaultInvoiceSettings, type InvoiceSettings } from "@/lib/finance/invoice-settings";

export function useAldeemSalesPolicy(enabled: boolean) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let request = 0;
    const read = async () => {
      const current = ++request;
      try {
        const state = await loadAldeemAccountPolicy();
        if (active && current === request) { setPolicy(previous => JSON.stringify(previous) === JSON.stringify(state.policy) ? previous : state.policy); setError(""); }
      } catch (cause) {
        if (active && current === request) { setPolicy(null); setError(cause instanceof Error ? cause.message : "تعذر تحميل إعدادات حساب الديم"); }
      }
    };
    void read(); window.addEventListener("focus", read); window.addEventListener(aldeemPolicyChanged, read);
    return () => { active = false; window.removeEventListener("focus", read); window.removeEventListener(aldeemPolicyChanged, read); };
  }, [enabled, attempt]);
  return { policy: enabled ? policy : null, error: enabled ? error : "", retry: () => { setError(""); setAttempt(value => value + 1); } };
}

/** Account preferences never replace server posting authorization. */
export function aldeemInvoiceSettings(policy: Policy): InvoiceSettings {
  return { ...defaultInvoiceSettings, previewBeforeSave: policy.preview,
    priceHints: policy.lastPrice ? "last" : "hidden", allowBelowCost: policy.belowCost,
    allowDeposits: policy.credit, decimalDisplay: policy.decimals === 0 ? "never" : "always",
    advanced: { ...defaultInvoiceSettings.advanced,
      numbering: { ...defaultInvoiceSettings.advanced.numbering, next: policy.firstNumber, manual: !policy.autoNumber || policy.editNumber },
      advancedPricing: policy.minimumPrice, profitEnabled: policy.showCost,
      socialEnabled: policy.whatsapp, socialPlatforms: policy.whatsapp ? ["whatsapp"] : [],
      defaultPaymentKind: policy.cash ? "cash" : policy.network || policy.visa ? "pos" : "bank",
      taxMode: policy.taxEnabled ? "specific" : "none", specificTaxRate: policy.taxRate as 0 | 15,
    } };
}
