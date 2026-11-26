"use client";
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { Languages } from "lucide-react";
import { cashierLanguageCookie, cashierLocale, cashierText, cashierError, type CashierLocale, type CashierMessage } from "@/lib/cashier/language";
import s from "./cashier-language.module.css";

const InitialLocale = createContext<CashierLocale>("ar");
const FixedLocale = createContext<CashierLocale | null>(null);
const EmbeddedTranslation = createContext<{ lang: string; labels: Record<string, string> } | undefined>(undefined);
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
  const fixed = useContext(FixedLocale);
  const translation = useContext(EmbeddedTranslation);
  const stored = useSyncExternalStore(subscribe, readLocale, () => initial);
  const locale = fixed ?? stored;
  return useMemo(() => ({ locale, lang: translation?.lang ?? locale, dir: locale === "ar" ? "rtl" as const : "ltr" as const,
    t: (message: CashierMessage) => cashierText(locale, message, translation?.labels), errorText: (message: string) => { const result = cashierError(locale, message); return translation?.labels[result] ?? result; },
    selectLocale: (next: CashierLocale) => { if (!fixed) selectLocale(next); } }), [locale, fixed, translation]);
}
function LanguageFrame({ children }: { children: ReactNode }) {
  const { lang, dir } = useCashierLanguage();
  return <div lang={lang} dir={dir} className={s.frame}>{children}</div>;
}
export function CashierLanguageProvider({ initialLocale, fixedLocale, translation, children }: { initialLocale: CashierLocale; fixedLocale?: CashierLocale; translation?: { lang: string; labels: Record<string, string> }; children: ReactNode }) {
  return <InitialLocale.Provider value={initialLocale}><FixedLocale.Provider value={fixedLocale ?? null}><EmbeddedTranslation.Provider value={translation}><LanguageFrame>{children}</LanguageFrame></EmbeddedTranslation.Provider></FixedLocale.Provider></InitialLocale.Provider>;
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
