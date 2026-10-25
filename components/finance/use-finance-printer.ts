"use client";
import { useEffect, useRef, useState } from "react";
import { defaultPrinterSettings, loadPrinterSettings, sendToLocalPrinter, type FinancePrinterCopy } from "@/lib/finance/printer-settings";
import { buildThermalReceiptHtml, printThermalReceipt, type ReceiptPrintHandler } from "./finance-receipt-print";

export function useFinancePrinter(brandId: string) {
  const [settings, setSettings] = useState(defaultPrinterSettings);
  const [ready, setReady] = useState(false);
  const batches = useRef(new Map<string, { id: string; complete: boolean; html: Partial<Record<FinancePrinterCopy, string>> }>());
  useEffect(() => {
    const read = () => { setSettings(loadPrinterSettings(brandId)); setReady(true); };
    read(); window.addEventListener("storage", read); window.addEventListener("branda:printer-settings", read);
    return () => { window.removeEventListener("storage", read); window.removeEventListener("branda:printer-settings", read); };
  }, [brandId]);
  const handler = (saleId: string, automatic: boolean): ReceiptPrintHandler => async (element, paper, options) => {
    if (!element) throw new Error("الفاتورة غير جاهزة للطباعة");
    const articles = element.matches("[data-finance-receipt]") ? [element] : Array.from(element.querySelectorAll<HTMLElement>("[data-finance-receipt]"));
    const selected = articles.filter(article => !options.allCopies || settings[article.hasAttribute("data-receipt-preparation") ? "preparation" : "customer"].enabled);
    if (!selected.length) throw new Error("فعّل نسخة واحدة على الأقل من إعداد الطابعة");
    if (settings.mode === "browser") {
      const wrapper = document.createElement("div"); selected.forEach(article => wrapper.appendChild(article.cloneNode(true)));
      return printThermalReceipt(wrapper, paper === "auto" ? settings.customer.paper : paper, { allCopies: true });
    }
    const key = `${saleId}:${options.allCopies ? "both" : selected[0].hasAttribute("data-receipt-preparation") ? "preparation" : "customer"}`;
    let batch = batches.current.get(key);
    if (!batch || batch.complete || options.newCopy) { batch = { id: !batch && automatic && !options.newCopy ? saleId : crypto.randomUUID(), complete: false, html: {} }; batches.current.set(key, batch); }
    for (const article of selected) {
      const copy: FinancePrinterCopy = article.hasAttribute("data-receipt-preparation") ? "preparation" : "customer";
      batch.html[copy] ??= buildThermalReceiptHtml(article, settings[copy].paper);
      const result = await sendToLocalPrinter({ brandId, jobId: batch.id, copy, html: batch.html[copy]!, settings });
      if (result.status === "uncertain") throw new Error("حالة الطباعة غير مؤكدة تحقق من الطابعة قبل إعادة إصدار نسخة لتجنب التكرار");
    }
    batch.complete = true;
    return { usedAssetFallback: false, submittedToDevice: true };
  };
  return { ready, autoEnabled: settings.customer.enabled || settings.preparation.enabled, handler };
}
