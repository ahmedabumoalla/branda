
"use server";

import { getOwnerReservations, updateReservationStatus, createReservation } from "@/lib/data/reservations";
import { getOwnerReservationServices } from "@/lib/data/platform-upgrade";
import type { ReservationStatus } from "@/lib/mock/reservations";
import { createReservationFlow, updateReservationStatus as updateReservationStatusFlow, type CreateReservationInput } from "@/lib/platform/reservation-flow";

export async function fetchOwnerReservationsAction() { return getOwnerReservations(); }
export async function fetchOwnerReservationServicesAction() { return getOwnerReservationServices(); }

export async function updateReservationStatusAction(id: string, status: ReservationStatus, cafeMessage?: string, rejectionReason?: string) {
  return updateReservationStatusFlow(id, status, { cafeMessage, rejectionReason });
}
export async function createReservationFlowAction(input: CreateReservationInput) { return createReservationFlow(input); }
export async function createReservationAction(input: Parameters<typeof createReservation>[0]) { return createReservation(input); }
