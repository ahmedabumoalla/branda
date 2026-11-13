"use client";

import { useEffect, useState } from "react";
import { getFinanceInvoiceContext } from "@/app/actions/finance-invoice-settings";
import { invoiceSettingsMoney, type InvoiceEditorContext, type InvoiceSettings } from "@/lib/finance/invoice-settings";
import css from "./company-invoice-lines.module.css";

export function useInvoicePricingContext(slug: string, partyId: string, productIds: string[], enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const productsKey = JSON.stringify([...new Set(productIds.filter(Boolean))].sort());
  const key = JSON.stringify([slug, partyId, productsKey, attempt]);
  const [result, setResult] = useState<{ key: string; data?: InvoiceEditorContext; error?: string } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void getFinanceInvoiceContext(slug, partyId, JSON.parse(productsKey)).then(response => {
      if (active) setResult(response.ok ? { key, data: response.data } : { key, error: response.message });
    }).catch(() => { if (active) setResult({ key, error: "تعذر تحميل أسعار الأصناف ورصيد العميل أعد المحاولة" }); });
    return () => { active = false; };
  }, [slug, partyId, productsKey, key, enabled]);
  const current = enabled && result?.key === key ? result : null;
  return { data: current?.data, error: current?.error, loading: enabled && !current, retry: () => setAttempt(value => value + 1) };
}

export function InvoiceLinePricing({ productId, context, settings, currency, exchangeRate, unitRatio = 1 }: {
  productId: string;
  context: ReturnType<typeof useInvoicePricingContext>;
  settings: InvoiceSettings;
  currency: string;
  exchangeRate: number;
  unitRatio?: number;
}) {
  if (!productId || settings.priceHints === "hidden") return null;
  const product = context.data?.products.find(item => item.productId === productId);
  const money = (amount: number) => invoiceSettingsMoney(amount * unitRatio / exchangeRate, settings.decimalDisplay, currency);
  return <div className={css.lastSalePrice}>
    {context.loading ? <span role="status">جار تحميل مؤشرات السعر</span> : context.error ? <button type="button" onClick={context.retry}>تعذر تحميل مؤشرات السعر أعد المحاولة</button> : !product ? <span>لا تتوفر مؤشرات لهذا الصنف</span> : <>
      {settings.advanced.advancedPricing && <span>الحد الأدنى <strong>{money(product.minimumPrice)}</strong> <small>{settings.advanced.minimumIncludesTax ? "شامل الضريبة" : "غير شامل الضريبة"}</small></span>}
      <span>{product.lastPrice === null ? "لا يوجد سعر بيع سابق للعميل" : <>آخر سعر بيع <strong>{money(product.lastPrice)}</strong></>}</span>
    </>}
  </div>;
}
