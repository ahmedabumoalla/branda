import type { BarndaksaCustomerSession } from "@/lib/customer/session";
import type { CafeBranch } from "@/lib/mock/branches";
import type { ReservationEventType, ReservationStatus } from "@/lib/mock/reservations";
import { createReservation, updateReservationStatus as updateReservationStatusDb } from "@/lib/data/reservations";

export type CreateReservationInput = {
  slug: string;
  customer: BarndaksaCustomerSession;
  branch: CafeBranch;
  reservationType: ReservationEventType;
  serviceId?: string;
  serviceName?: string;
  reservationPrice?: number;
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

export async function createReservationFlow(input: CreateReservationInput) {
  const {
    slug,
    customer,
    branch,
    reservationType,
    serviceId,
    serviceName,
    reservationPrice,
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

  const reservationId = await createReservation({
    cafeSlug: slug,
    customerId: customer.id,
    serviceId,
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
  });

  return {
    id: reservationId,
    customerId: customer.id,
    customerName: customer.fullName,
    phone: customer.phone,
    serviceId,
    serviceName,
    reservationPrice,
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
    status: "بانتظار الرد" as const,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

export async function updateReservationStatus(
  reservationId: string,
  status: ReservationStatus,
  options?: {
    cafeMessage?: string;
    rejectionReason?: string;
  }
) {
  await updateReservationStatusDb(
    reservationId,
    status,
    options?.cafeMessage,
    options?.rejectionReason
  );

  const { getOwnerReservations } = await import("@/lib/data/reservations");
  const reservations = await getOwnerReservations();
  const reservation = reservations.find((r) => r.id === reservationId);
  if (!reservation) {
    return { ok: false as const, error: "الحجز غير موجود" };
  }

  return {
    ok: true as const,
    reservation: { ...reservation, status },
  };
}
