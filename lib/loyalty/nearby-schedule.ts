import { z } from "zod";

export const NEARBY_SCHEDULE_CAFE_ID = "dbe942ba-dfa4-422b-a9f6-9527c3b27cc9";
export const NEARBY_SCHEDULE_TIME_ZONE = "Asia/Riyadh";
export const MAX_NEARBY_PERIODS = 48;
export type NearbyPeriod = { id: string; start: string; end: string; message: string };
export type NearbySchedule = { enabled: boolean; periods: NearbyPeriod[]; revision: number };
export const emptyNearbySchedule: NearbySchedule = { enabled: false, periods: [], revision: 0 };

export function timeMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function periodContains(period: Pick<NearbyPeriod, "start" | "end">, minute: number) {
  const start = timeMinutes(period.start), end = timeMinutes(period.end);
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "حدد الوقت بالساعات والدقائق");
export const nearbyScheduleSchema = z.object({
  enabled: z.boolean(),
  revision: z.number().int().min(0),
  periods: z.array(z.object({
    id: z.string().uuid(), start: time, end: time,
    message: z.string().trim().min(2, "اكتب رسالة من حرفين على الأقل").max(240, "الرسالة لا تتجاوز ٢٤٠ حرفًا"),
  }).strict()).max(MAX_NEARBY_PERIODS, "يمكن إضافة حتى ٤٨ فترة"),
}).strict().superRefine((value, ctx) => {
  if (value.enabled && !value.periods.length) ctx.addIssue({ code: "custom", path: ["periods"], message: "أضف فترة واحدة على الأقل لتفعيل تحديد الفترات" });
  const ids = new Set<string>();
  value.periods.forEach((period, index) => {
    if (ids.has(period.id)) ctx.addIssue({ code: "custom", path: ["periods", index, "start"], message: "الفترة مكررة احذفها وأضف فترة جديدة" });
    ids.add(period.id);
    if (period.start === period.end) ctx.addIssue({ code: "custom", path: ["periods", index, "end"], message: "وقت النهاية يجب أن يختلف عن البداية" });
    value.periods.slice(0, index).forEach((previous, previousIndex) => {
      if (periodContains(previous, timeMinutes(period.start)) || periodContains(period, timeMinutes(previous.start))) {
        ctx.addIssue({ code: "custom", path: ["periods", index, "start"], message: `الفترة ${index + 1} تتداخل مع الفترة ${previousIndex + 1}` });
      }
    });
  });
});

/** End-exclusive boundaries: 09:00 belongs to 09–10, never to 07–09. */
export function scheduledNearbyMessage(schedule: NearbySchedule | null | undefined, now = new Date()): string | null {
  if (!schedule?.enabled) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: NEARBY_SCHEDULE_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const minute = Number(parts.find(part => part.type === "hour")?.value) * 60 + Number(parts.find(part => part.type === "minute")?.value);
  return schedule.periods.find(period => periodContains(period, minute))?.message ?? null;
}
