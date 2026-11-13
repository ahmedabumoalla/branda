export const pagerPeriods = [
  ["all", "كل الفترات"], ["today", "اليوم"], ["yesterday", "أمس"],
  ["7d", "آخر ٧ أيام"], ["30d", "آخر شهر"], ["365d", "آخر سنة"],
] as const;
export type PagerPeriod = typeof pagerPeriods[number][0];
export function parsePagerPeriod(value: unknown): PagerPeriod {
  return pagerPeriods.some(([key]) => key === value) ? value as PagerPeriod : "all";
}
export function pagerPeriodRange(period: PagerPeriod, now = new Date()) {
  if (period === "all") return { from: null, to: null };
  // Saudi Arabia uses UTC+03:00 year-round. Calendar days follow Riyadh midnight.
  const offset = 3 * 60 * 60 * 1000, day = 24 * 60 * 60 * 1000;
  const today = Math.floor((now.getTime() + offset) / day) * day - offset;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "365d" ? 365 : 1;
  return { from: new Date(period === "yesterday" ? today - day : today - (days - 1) * day).toISOString(), to: new Date(period === "yesterday" ? today : today + day).toISOString() };
}
