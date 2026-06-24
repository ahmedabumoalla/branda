
"use server";

import { getOwnerReservations, createReservation, confirmOwnerReservationCode } from "@/lib/data/reservations";
import type { ConfirmOwnerReservationCodeResult } from "@/lib/data/reservations";
import { getOwnerReservationServices } from "@/lib/data/platform-upgrade";
import type { ReservationService } from "@/lib/data/platform-upgrade";
import type { CafeReservation, ReservationStatus } from "@/lib/mock/reservations";
import { createReservationFlow, updateReservationStatus as updateReservationStatusFlow, type CreateReservationInput } from "@/lib/platform/reservation-flow";

type ReservationStatusActionResult =
  | { ok: true; reservation: CafeReservation }
  | { ok: false; error: string };

type CreateReservationFlowActionResult =
  | { ok: true; reservation: CafeReservation }
  | {
      ok: false;
      code: "login_required" | "reservation_failed";
      message: string;
    };

export async function fetchOwnerReservationsAction(): Promise<CafeReservation[]> {
  return getOwnerReservations();
}

export async function fetchOwnerReservationServicesAction(): Promise<ReservationService[]> {
  return getOwnerReservationServices();
}

export async function updateReservationStatusAction(
  id: string,
  status: ReservationStatus,
  cafeMessage?: string,
  rejectionReason?: string,
): Promise<ReservationStatusActionResult> {
  return updateReservationStatusFlow(id, status, { cafeMessage, rejectionReason });
}

export async function createReservationFlowAction(
  input: CreateReservationInput,
): Promise<CreateReservationFlowActionResult> {
  try {
    const reservation = await createReservationFlow(input);
    return { ok: true as const, reservation };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const loginRequired =
      message === "Unauthorized" ||
      message === "Customer profile not found" ||
      message.includes("customer mismatch");

    return {
      ok: false as const,
      code: loginRequired ? ("login_required" as const) : ("reservation_failed" as const),
      message: loginRequired
        ? "يجب تسجيل الدخول بحساب العميل لإرسال الحجز."
        : "تعذر إرسال الحجز. تحقق من البيانات وحاول مرة أخرى.",
    };
  }
}
export async function createReservationAction(
  input: Parameters<typeof createReservation>[0],
): Promise<string> {
  return createReservation(input);
}


export async function confirmOwnerReservationCodeAction(
  code: string,
): Promise<ConfirmOwnerReservationCodeResult> {
  return confirmOwnerReservationCode(code);
}
