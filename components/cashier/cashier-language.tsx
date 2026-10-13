"use client";
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { Languages } from "lucide-react";
import { cashierLanguageCookie, cashierLocale, cashierText, cashierError, type CashierLocale, type CashierMessage } from "@/lib/cashier/language";
import s from "./cashier-language.module.css";

const InitialLocale = createContext<CashierLocale>("ar");
const changeEvent = "branda-cashier-language-change";
let memoryLocale: CashierLocale | null = null;
function readLocale() {
  try {
    const cookie = document.cookie.split("; ").find(value => value.startsWith(cashierLanguageCookie + "="))?.split("=")[1];
    return cookie ? cashierLocale(cookie) : memoryLocale ?? "ar";
  } catch { return memoryLocale ?? "ar"; }
}
function subscribe(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  window.addEventListener("storage", listener);
  window.addEventListener("focus", listener);
  return () => { window.removeEventListener(changeEvent, listener); window.removeEventListener("storage", listener); window.removeEventListener("focus", listener); };
}
function selectLocale(locale: CashierLocale) {
  memoryLocale = locale;
  try { document.cookie = `${cashierLanguageCookie}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; } catch { /* In-memory language switching still works when cookies are blocked */ }
  try { localStorage.setItem(cashierLanguageCookie, locale); } catch { /* Cookie / in-memory selection remains usable */ }
  window.dispatchEvent(new Event(changeEvent));
}
export function useCashierLanguage() {
  const initial = useContext(InitialLocale);
  const locale = useSyncExternalStore(subscribe, readLocale, () => initial);
  return useMemo(() => ({ locale, dir: locale === "ar" ? "rtl" as const : "ltr" as const,
    t: (message: CashierMessage) => cashierText(locale, message), errorText: (message: string) => cashierError(locale, message), selectLocale }), [locale]);
}
function LanguageFrame({ children }: { children: ReactNode }) {
  const { locale, dir } = useCashierLanguage();
  return <div lang={locale} dir={dir} className={s.frame}>{children}</div>;
}
export function CashierLanguageProvider({ initialLocale, children }: { initialLocale: CashierLocale; children: ReactNode }) {
  return <InitialLocale.Provider value={initialLocale}><LanguageFrame>{children}</LanguageFrame></InitialLocale.Provider>;
}
export function CashierLanguageSwitch({ dark = false }: { dark?: boolean }) {
  const { locale, selectLocale } = useCashierLanguage();
  const nextLocale = locale === "ar" ? "en" : "ar";
  const label = locale === "ar" ? "التبديل إلى الإنجليزية" : "Switch to Arabic";
  return <button type="button" className={`${s.switch} ${dark ? s.dark : ""}`} aria-label={label} title={label} dir="ltr" onClick={() => selectLocale(nextLocale)}>
    <Languages size={16} strokeWidth={1.7} aria-hidden="true" className={s.icon} />
    <span lang={nextLocale}>{nextLocale === "en" ? "English" : "العربية"}</span>
  </button>;
}
