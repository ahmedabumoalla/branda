"use client";
import { useEffect, useState } from "react";
import { getAldeemCustomerCredit } from "@/app/actions/aldeem-customer-credit";

export type CustomerCredit = { enabled: boolean; limit: number; days: number; balance: number; available: number; overdue: boolean };
export function useAldeemCustomerCredit(enabled: boolean, customerId: string) {
  const [attempt, setAttempt] = useState(0);
  const key = `${customerId}:${attempt}`;
  const [state, setState] = useState<{ key: string; data?: CustomerCredit; error?: string } | null>(null);
  useEffect(() => {
    if (!enabled || !customerId) return;
    let current = true;
    void getAldeemCustomerCredit(customerId).then(result => {
      if (current) setState(result.ok ? { key, data: result.data } : { key, error: result.message });
    }).catch(() => { if (current) setState({ key, error: "تعذر التحقق من إتاحة البيع الآجل أعد المحاولة" }); });
    return () => { current = false; };
  }, [enabled, customerId, key]);
  return { data: state?.key === key ? state.data : undefined, error: state?.key === key ? state.error : undefined, loading: enabled && !!customerId && state?.key !== key, retry: () => setAttempt(value => value + 1) };
}
