import type { BrandaCustomerSession } from "@/lib/customer/session";
import { TRANSACTIONS_KEY, type CustomerTransaction } from "@/lib/mock/customer-activity";
import type { CafeBranch } from "@/lib/mock/branches";
import {
  RESERVATIONS_KEY,
  type CafeReservation,
  type ReservationEventType,
  type ReservationStatus,
} from "@/lib/mock/reservations";
import {
  PLATFORM_CUSTOMERS_KEY,
  PLATFORM_OPERATIONS_KEY,
  mockPlatformCustomers,
  mockPlatformOperations,
  type PlatformCustomer,
  type PlatformOperation,
} from "@/lib/platform/admin-data";
import { notifyCafe, notifyCustomer } from "@/lib/platform/notification-flow";

const CAFE_ID = "cafe_qatrah";
const CAFE_NAME = "كوفي قطرة";

export type CreateReservationInput = {
  slug: string;
  customer: BrandaCustomerSession;
  branch: CafeBranch;
  reservationType: ReservationEventType;
  guests: number;
  date: string;
  time: string;
  durationMinutes?: number;
  spaceType?: string;
  eventTitle?: string;
  needsDecoration?: boolean;
  needsCatering?: boolean;
  budgetEstimate?: number;
  notes?: string;
};

function readJson<T>(key: string, fallback: T): T {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : fallback;
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function createReservationFlow(input: CreateReservationInput) {
  const {
    slug,
    customer,
    branch,
    reservationType,
    guests,
    date,
    time,
    durationMinutes,
    spaceType,
    eventTitle,
    needsDecoration,
    needsCatering,
    budgetEstimate,
    notes,
  } = input;

  const createdAt = new Date().toISOString().slice(0, 10);

  const newReservation: CafeReservation = {
    id: crypto.randomUUID(),
    customerId: customer.id,
    customerName: customer.fullName,
    phone: customer.phone,
    type: reservationType,
    guests,
    date,
    time,
    durationMinutes,
    branchName: branch.name,
    spaceType: spaceType?.trim() || undefined,
    eventTitle: eventTitle?.trim() || undefined,
    needsDecoration,
    needsCatering,
    budgetEstimate,
    notes: notes?.trim() || undefined,
    status: "بانتظار الرد",
    createdAt,
  };

  const newTransaction: CustomerTransaction = {
    id: crypto.randomUUID(),
    cafeSlug: slug,
    customerId: customer.id,
    type: "حجز",
    title: `حجز ${reservationType}`,
    description: `حجز في ${branch.name} لعدد ${guests} أشخاص بتاريخ ${date} الساعة ${time}`,
    createdAt,
  };

  const operation: PlatformOperation = {
    id: crypto.randomUUID(),
    cafeId: CAFE_ID,
    cafeName: CAFE_NAME,
    customerName: customer.fullName,
    type: "حجز",
    title: `طلب حجز ${reservationType} — ${branch.name}`,
    status: "بانتظار الرد",
    createdAt,
  };

  const reservations = readJson<CafeReservation[]>(RESERVATIONS_KEY, []);
  writeJson(RESERVATIONS_KEY, [newReservation, ...reservations]);

  const transactions = readJson<CustomerTransaction[]>(TRANSACTIONS_KEY, []);
  writeJson(TRANSACTIONS_KEY, [newTransaction, ...transactions]);

  const operations = readJson<PlatformOperation[]>(
    PLATFORM_OPERATIONS_KEY,
    mockPlatformOperations
  );
  writeJson(PLATFORM_OPERATIONS_KEY, [operation, ...operations]);

  const customers = readJson<PlatformCustomer[]>(
    PLATFORM_CUSTOMERS_KEY,
    mockPlatformCustomers
  );

  if (!customers.some((c) => c.id === customer.id)) {
    writeJson(PLATFORM_CUSTOMERS_KEY, [
      {
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        cafeId: CAFE_ID,
        cafeName: CAFE_NAME,
        status: "نشط",
        totalSpent: 0,
        loyaltyPoints: 0,
        createdAt,
      },
      ...customers,
    ]);
  }

  notifyCafe({
    cafeSlug: slug,
    title: "طلب حجز جديد",
    body: `${customer.fullName} — ${reservationType} • ${guests} أشخاص • ${date} ${time}`,
    type: "new_reservation",
    meta: { reservationId: newReservation.id },
  });

  notifyCustomer({
    cafeSlug: slug,
    customerId: customer.id,
    title: "تم إرسال طلب الحجز",
    body: `طلبك (${reservationType}) بانتظار رد الكوفي. سنبلغك عند القبول أو الرفض.`,
    type: "new_reservation",
    meta: { reservationId: newReservation.id },
  });

  return newReservation;
}

export function updateReservationStatus(
  reservationId: string,
  status: ReservationStatus,
  options?: {
    cafeSlug?: string;
    cafeMessage?: string;
    rejectionReason?: string;
  }
) {
  const cafeSlug = options?.cafeSlug || "qatrah";
  const reservations = readJson<CafeReservation[]>(RESERVATIONS_KEY, []);
  const reservation = reservations.find((r) => r.id === reservationId);
  if (!reservation) {
    return { ok: false as const, error: "الحجز غير موجود" };
  }

  const patch: Partial<CafeReservation> = { status };
  if (options?.cafeMessage?.trim()) patch.cafeMessage = options.cafeMessage.trim();
  if (options?.rejectionReason?.trim()) patch.rejectionReason = options.rejectionReason.trim();

  const next = reservations.map((r) =>
    r.id === reservationId ? { ...r, ...patch } : r
  );
  writeJson(RESERVATIONS_KEY, next);

  const operations = readJson<PlatformOperation[]>(
    PLATFORM_OPERATIONS_KEY,
    mockPlatformOperations
  );
  writeJson(
    PLATFORM_OPERATIONS_KEY,
    operations.map((op) =>
      op.title.includes(reservation.type) &&
      op.customerName === reservation.customerName &&
      op.status === "بانتظار الرد"
        ? { ...op, status }
        : op
    )
  );

  if (reservation.customerId) {
    if (status === "مقبول") {
      notifyCustomer({
        cafeSlug,
        customerId: reservation.customerId,
        title: "تم قبول حجزك",
        body:
          options?.cafeMessage?.trim() ||
          `حجزك (${reservation.type}) مقبول — ${reservation.date} الساعة ${reservation.time}.`,
        type: "reservation_accepted",
        meta: { reservationId },
      });
    } else if (status === "مرفوض") {
      notifyCustomer({
        cafeSlug,
        customerId: reservation.customerId,
        title: "تم رفض حجزك",
        body:
          options?.rejectionReason?.trim() ||
          options?.cafeMessage?.trim() ||
          "عذرًا، لم نتمكن من قبول حجزك في الوقت المطلوب.",
        type: "reservation_rejected",
        meta: { reservationId },
      });
    } else if (status === "طلب تعديل") {
      notifyCustomer({
        cafeSlug,
        customerId: reservation.customerId,
        title: "طلب تعديل على حجزك",
        body:
          options?.cafeMessage?.trim() ||
          "يرجى مراجعة تفاصيل الحجز والتواصل مع الكوفي.",
        type: "reservation_rejected",
        meta: { reservationId },
      });
    }
  }

  return {
    ok: true as const,
    reservation: next.find((r) => r.id === reservationId)!,
  };
}
