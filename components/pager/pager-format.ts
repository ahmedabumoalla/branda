import { cashierText, type CashierLocale } from "@/lib/cashier/language";
export function pagerDate(value: string | null | undefined, locale: CashierLocale = "ar") {
  if (!value) return cashierText(locale, "لم يحدث بعد");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return cashierText(locale, "غير متاح");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  return `${part("year")}/${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
}

export function pagerDuration(seconds: number | null | undefined, locale: CashierLocale = "ar") {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  if (minutes < 1) return cashierText(locale, "أقل من دقيقة");
  if (minutes < 60) return cashierText(locale, { text: "{minutes} دقيقة", values: { minutes } });
  return cashierText(locale, { text: "{hours} س {minutes} د", values: { hours: Math.floor(minutes / 60), minutes: minutes % 60 } });
}

export function pagerElapsed(start: string | null, end: string | null, locale: CashierLocale = "ar") {
  if (!start || !end) return "—";
  return pagerDuration((new Date(end).getTime() - new Date(start).getTime()) / 1000, locale);
}
