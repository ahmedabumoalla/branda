export function pagerDate(value: string | null | undefined) {
  if (!value) return "لم يحدث بعد";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "غير متاح";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  return `${part("year")}/${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
}

export function pagerDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  if (minutes < 1) return "أقل من دقيقة";
  if (minutes < 60) return `${minutes} دقيقة`;
  return `${Math.floor(minutes / 60)} س ${minutes % 60} د`;
}

export function pagerElapsed(start: string | null, end: string | null) {
  if (!start || !end) return "—";
  return pagerDuration((new Date(end).getTime() - new Date(start).getTime()) / 1000);
}
