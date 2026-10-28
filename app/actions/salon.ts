"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { commandSalonBooking, createSalonBooking, getSalonBookings, respondSalonBooking, reviewSalonBooking, saveSalonAnnouncement } from "@/lib/data/salon";
import { runSalonMessageJobs } from "@/lib/salon/worker";
import type { SalonCommand, SalonFilter, SalonMode } from "@/lib/salon/types";
async function mutation<T>(work: () => Promise<T>, messages = true) {
  try {
    const data = await work();
    if (messages) after(async () => { try { await runSalonMessageJobs(10); } catch { /* Pending jobs remain for the scheduled worker */ } });
    return { ok: true as const, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { ok: false as const, error: /[\u0600-\u06ff]/.test(message) ? message : "تعذر تنفيذ الطلب تحقق من البيانات ثم حاول مجددًا" };
  }
}
export async function createSalonBookingAction(input: unknown) { return mutation(() => createSalonBooking(input)); }
export async function fetchSalonBookingsAction(input: SalonFilter, mode: SalonMode, pager: boolean) { return mutation(() => getSalonBookings(input, mode, pager), false); }
export async function commandSalonBookingAction(id: string, version: number, action: SalonCommand, start: string | null, mode: SalonMode) {
  return mutation(() => commandSalonBooking(id, version, action, start, mode));
}
export async function respondSalonBookingAction(token: string, version: number, accept: boolean) {
  return mutation(async () => { await respondSalonBooking(token, version, accept); revalidatePath(`/salon/booking/${token}`); });
}
export async function reviewSalonBookingAction(token: string, rating: number, review: string) {
  return mutation(async () => { await reviewSalonBooking(token, rating, review); revalidatePath(`/salon/booking/${token}`); }, false);
}
export async function saveSalonAnnouncementAction(input: unknown) {
  return mutation(async () => { await saveSalonAnnouncement(input); revalidatePath("/dashboard/offers"); revalidatePath("/salon/[slug]", "page"); }, false);
}
