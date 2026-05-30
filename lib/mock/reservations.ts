export type ReservationStatus =
  | "بانتظار الرد"
  | "مقبول"
  | "مرفوض"
  | "طلب تعديل";

export type ReservationEventType =
  | "طاولة عادية"
  | "عيد ميلاد"
  | "حفلة تخرج"
  | "مناسبة خاصة"
  | "اجتماع"
  | "ورشة/تجمع صغير"
  | "أخرى";

export const RESERVATIONS_KEY = "branda_qatrah_reservations";

export const RESERVATION_EVENT_TYPES: ReservationEventType[] = [
  "طاولة عادية",
  "عيد ميلاد",
  "حفلة تخرج",
  "مناسبة خاصة",
  "اجتماع",
  "ورشة/تجمع صغير",
  "أخرى",
];

export const SPECIAL_EVENT_TYPES: ReservationEventType[] = [
  "عيد ميلاد",
  "حفلة تخرج",
  "مناسبة خاصة",
  "ورشة/تجمع صغير",
  "أخرى",
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
  rejectionReason?: string;
  cafeMessage?: string;
  createdAt: string;
};

export const mockReservations: CafeReservation[] = [
  {
    id: "1",
    customerId: "mock_customer_1",
    customerName: "عبدالله",
    phone: "0550000001",
    type: "طاولة عادية",
    guests: 2,
    date: "2026-05-20",
    time: "20:30",
    notes: "يفضل مكان هادئ",
    status: "بانتظار الرد",
    createdAt: "2026-05-17",
  },
  {
    id: "2",
    customerId: "mock_customer_2",
    customerName: "محمد",
    phone: "0550000002",
    type: "مناسبة خاصة",
    guests: 4,
    date: "2026-05-20",
    time: "21:00",
    status: "مقبول",
    createdAt: "2026-05-17",
  },
  {
    id: "3",
    customerId: "mock_customer_3",
    customerName: "سارة",
    phone: "0550000003",
    type: "اجتماع",
    guests: 6,
    date: "2026-05-21",
    time: "22:00",
    status: "بانتظار الرد",
    createdAt: "2026-05-17",
  },
];