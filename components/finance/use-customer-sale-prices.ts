"use client";

import { useEffect, useState } from "react";
import { customerSalePricesAction } from "@/app/actions/finance-customer-prices";
import type { CustomerSalePrice } from "@/lib/finance/customer-sale-price";

export function useCustomerSalePrices(slug: string, customerId: string, productIds: string[]) {
  const productsKey = JSON.stringify([...new Set(productIds.filter(Boolean))].sort());
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify([slug, customerId, productsKey, attempt]);
  const [result, setResult] = useState<{ key: string; prices: CustomerSalePrice[]; error: boolean } | null>(null);
  useEffect(() => {
    if (!customerId || productsKey === "[]") return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void customerSalePricesAction({ customerId, productIds: JSON.parse(productsKey) }, slug)
        .then(response => { if (!cancelled) setResult({ key: requestKey, prices: response.ok ? response.data : [], error: !response.ok }); })
        .catch(() => { if (!cancelled) setResult({ key: requestKey, prices: [], error: true }); });
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [slug, customerId, productsKey, requestKey]);
  const current = result?.key === requestKey ? result : null;
  return {
    status: !customerId ? "no-customer" as const : !current ? "loading" as const : current.error ? "error" as const : "ready" as const,
    prices: current?.prices ?? [],
    retry: () => setAttempt(value => value + 1),
  };
}
