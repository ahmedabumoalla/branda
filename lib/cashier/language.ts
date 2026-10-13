import { cashierEnglish } from "./messages";

export type CashierLocale = "ar" | "en";
export type LocalizedText = { ar: string; en: string };
export type CashierMessage = string | { text: string; values: Record<string, string | number | LocalizedText> };
export const cashierLanguageCookie = "branda-cashier-language";
export function cashierLocale(value: unknown): CashierLocale { return value === "en" ? "en" : "ar"; }
export function cashierText(locale: CashierLocale, message: CashierMessage) {
  const source = typeof message === "string" ? message : message.text;
  const translated = locale === "en" ? cashierEnglish[source] ?? source : source;
  return typeof message === "string" ? translated : translated.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = message.values[key];
    return value && typeof value === "object" ? value[locale] : String(value ?? "");
  });
}
export function cashierError(locale: CashierLocale, message: string) {
  if (!message) return "";
  return locale === "ar" ? message : cashierEnglish[message] ?? "Unable to complete this action safely Check your connection and sign-in permissions then try again";
}
export function localizedText(locale: CashierLocale, source: string, translated?: LocalizedText) { return translated?.[locale] || source; }
