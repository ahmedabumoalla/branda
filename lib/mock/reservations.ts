export type ReservationStatus = "بانتظار الرد" | "مقبول" | "مرفوض";

export type CafeReservation = {
  id: string;
  customerId?: string;
  customerName: string;
  phone: string;
  type: "طاولة" | "جلسة خارجية" | "غرفة خاصة";
  guests: number;
  date: string;
  time: string;
  notes?: string;
  status: ReservationStatus;
  createdAt: string;
};

export const mockReservations: CafeReservation[] = [
  {
    id: "1",
    customerId: "mock_customer_1",
    customerName: "عبدالله",
    phone: "0550000001",
    type: "طاولة",
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
    type: "جلسة خارجية",
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
    type: "غرفة خاصة",
    guests: 6,
    date: "2026-05-21",
    time: "22:00",
    status: "بانتظار الرد",
    createdAt: "2026-05-17",
  },
];