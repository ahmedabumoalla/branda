"use server";

import { after } from "next/server";
import { runPagerMessageJobs } from "@/lib/pager/worker";
import { createPagerOrder, getAdminPagerPage, getPagerFeedback, getPagerPage, submitPagerFeedback, transitionPagerOrder } from "@/lib/data/pager";
import type { PagerFilter, PagerMode, PagerMutationResult } from "@/lib/pager/types";

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /[\u0600-\u06ff]/.test(message) ? message : "تعذر تنفيذ العملية تحقق من صلاحية الدخول ثم حاول مجددًا";
}
export async function fetchPagerPageAction(input: PagerFilter = {}, mode: PagerMode = "staff") { return getPagerPage(input,mode); }
export async function fetchAdminPagerPageAction(cafeId: string,input: PagerFilter = {}) { return getAdminPagerPage(cafeId,input); }
export async function createPagerOrderAction(input: { id: string; invoiceNumber: string; phone: string },mode: PagerMode = "staff"): Promise<PagerMutationResult> {
  try { return { ok: true, order: await createPagerOrder(input,mode) }; }
  catch (error) { return { ok: false, error: errorMessage(error) }; }
}
export async function updatePagerOrderAction(orderId: string,status: "ready" | "received" | "cancelled",mode: PagerMode = "staff"): Promise<PagerMutationResult> {
  try {
    const order = await transitionPagerOrder(orderId,status,mode);
    if (status === "ready" || status === "received") after(async () => {
      try { await runPagerMessageJobs(5); }
      catch { /* The durable queue is retried by the scheduled worker */ }
    });
    return { ok: true, order };
  }
  catch (error) { return { ok: false, error: errorMessage(error) }; }
}
export async function fetchPagerFeedbackAction(token: string) { return getPagerFeedback(token); }
export async function submitPagerFeedbackAction(token: string,rating: number,notes: string) {
  try { return await submitPagerFeedback(token,rating,notes); }
  catch (error) { return { ok: false as const, error: errorMessage(error) }; }
}
