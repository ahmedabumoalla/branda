export type ReservationStatus =
  | "بانتظار الرد"
  | "مقبول"
  | "مرفوض"
  | "طلب تعديل";

export type ReservationEventType =
  | "حجز عيد ميلاد غرفة خاصة"
  | "حجز عيد ميلاد مكان مفتوح"
  | "حجز قاعة اجتماع مصغرة"
  | "حجز غرفة"
  | "حجز طاولة عادية مع إطلالة"
  | "حجز طاولة عادية داخلية";

export const RESERVATIONS_KEY = "barndaksa_qatrah_reservations";

export const RESERVATION_EVENT_TYPES: ReservationEventType[] = [
  "حجز عيد ميلاد غرفة خاصة",
  "حجز عيد ميلاد مكان مفتوح",
  "حجز قاعة اجتماع مصغرة",
  "حجز غرفة",
  "حجز طاولة عادية مع إطلالة",
  "حجز طاولة عادية داخلية",
];

export const SPECIAL_EVENT_TYPES: ReservationEventType[] = [
  "حجز عيد ميلاد غرفة خاصة",
  "حجز عيد ميلاد مكان مفتوح",
  "حجز قاعة اجتماع مصغرة",
  "حجز غرفة",
];

export function isSpecialReservationEvent(type: ReservationEventType) {
  return SPECIAL_EVENT_TYPES.includes(type);
}

export type CafeReservation = {
  id: string;
  customerId?: string;
  customerName: string;
  phone: string;
  type: ReservationEventType;
  serviceId?: string;
  serviceName?: string;
  reservationPrice?: number;
  guests: number;
  date: string;
  time: string;
  durationMinutes?: number;
  branchName?: string;
  spaceType?: string;
  eventTitle?: string;
  needsDecoration?: boolean;
  needsCatering?: boolean;
  budgetEstimate?: number;
  notes?: string;
  status: ReservationStatus;
  reservationCode?: string;
  reservationCodeUsedAt?: string;
  cashierConfirmedAt?: string;
  rejectionReason?: string;
  cafeMessage?: string;
  createdAt: string;
};

export const mockReservations: CafeReservation[] = [];
