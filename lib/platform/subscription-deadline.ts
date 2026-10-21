/** Admin inputs always use Saudi local time, regardless of the device time zone. */
export function saudiDeadlineInput(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  return new Date(Date.parse(value) + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function parseSaudiDeadline(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("حدد تاريخًا ووقتًا صحيحين لانتهاء الاشتراك");
  const parsed = new Date(`${value}:00+03:00`);
  if (!Number.isFinite(parsed.getTime()) || saudiDeadlineInput(parsed.toISOString()) !== value) throw new Error("حدد تاريخًا ووقتًا صحيحين لانتهاء الاشتراك");
  return parsed.toISOString();
}

export function formatSaudiDeadline(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "غير محدد";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value));
}
