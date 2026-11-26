"use client";

import { createContext, useCallback, useContext, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { Modal } from "@/components/dashboard/ui/modal";
import { FINANCE_POS_LANGUAGE_KEY, financePosCategoryName, financePosProductName, financePosText, financePosDisplayName, type FinancePosLanguage } from "@/lib/finance/pos-locale";

const eventName = "branda:finance-pos-language";
let memoryLanguage: FinancePosLanguage = "ar";
let volatileLanguage: FinancePosLanguage | null = null;
function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key !== FINANCE_POS_LANGUAGE_KEY) return;
    volatileLanguage = null;
    listener();
  };
  window.addEventListener("storage", onStorage); window.addEventListener(eventName, listener);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(eventName, listener); };
}
function readLanguage(): FinancePosLanguage { if (volatileLanguage) return volatileLanguage; try { const stored = localStorage.getItem(FINANCE_POS_LANGUAGE_KEY); return stored === "ar" || stored === "en" || stored === "fr" ? stored : memoryLanguage; } catch { return memoryLanguage; } }
const defaultLanguage = (): FinancePosLanguage => "ar";
const FinancePosLocaleContext = createContext<{ language: FinancePosLanguage; setLanguage: (value: FinancePosLanguage) => void }>({ language: "ar", setLanguage: () => {} });

export function FinancePosLocaleProvider({ children, enabled = true, allowFrench = false }: { children: ReactNode; enabled?: boolean; allowFrench?: boolean }) {
  const savedLanguage = useSyncExternalStore(subscribe, readLanguage, defaultLanguage);
  const language = enabled && (allowFrench || savedLanguage !== "fr") ? savedLanguage : "ar";
  const setLanguage = useCallback((value: FinancePosLanguage) => {
    memoryLanguage = value;
    try { localStorage.setItem(FINANCE_POS_LANGUAGE_KEY, value); volatileLanguage = null; } catch { volatileLanguage = value; }
    window.dispatchEvent(new Event(eventName));
  }, []);
  return <FinancePosLocaleContext.Provider value={{ language, setLanguage }}>{children}</FinancePosLocaleContext.Provider>;
}

export function useFinancePosLocale() {
  const context = useContext(FinancePosLocaleContext);
  const { language } = context;
  const t = useCallback((text: string, english?: string) => financePosText(language, text, english), [language]);
  return { ...context, dir: language === "ar" ? "rtl" as const : "ltr" as const,
    t,
    productName: (product: { name: string; nameEn?: string | null }) => financePosProductName(product, language),
    categoryName: (name: string) => financePosCategoryName(name, language),
    displayName: (name: string | null | undefined) => financePosDisplayName(name, language),
    date: (value: string | null | undefined) => !value || Number.isNaN(new Date(value).getTime()) ? "—" : new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : language === "ar" ? "ar-SA" : "en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value)),
    number: (value: number, maximumFractionDigits = 3) => new Intl.NumberFormat(language === "fr" ? "fr-FR" : language === "ar" ? "ar-SA" : "en-SA", { maximumFractionDigits }).format(value),
    money: (value: number) => new Intl.NumberFormat(language === "fr" ? "fr-FR" : language === "ar" ? "ar-SA" : "en-SA", { style: "currency", currency: "SAR" }).format(value),
  };
}

export function PosNumeric({ value, money = false, unitPrice = false }: { value: number; money?: boolean; unitPrice?: boolean }) {
  const locale = useFinancePosLocale();
  return <span dir="auto" style={{ fontVariantNumeric: "tabular-nums" }}>{unitPrice ? `${locale.number(value, 6)} ${locale.language === "ar" ? "ر س" : "SAR"}` : money ? locale.money(value) : locale.number(value)}</span>;
}

export function FinancePosModal(props: ComponentProps<typeof Modal>) {
  const { dir, language, t } = useFinancePosLocale();
  return <Modal {...props} dir={dir} lang={language} closeLabel={t("إغلاق")} />;
}
