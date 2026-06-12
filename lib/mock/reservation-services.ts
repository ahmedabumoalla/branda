export const RESERVATION_SERVICE_NAMES = [
  "حجز عيد ميلاد غرفة خاصة",
  "حجز عيد ميلاد مكان مفتوح",
  "حجز قاعة اجتماع مصغرة",
  "حجز غرفة",
  "حجز طاولة عادية مع إطلالة",
  "حجز طاولة عادية داخلية",
] as const;

export type ReservationDurationUnit = "minute" | "hour" | "day";
