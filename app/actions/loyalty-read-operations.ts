"use server";

import { after } from "next/server";
import { ZodError } from "zod";
import { enqueueLoyaltyRead, getCashierLoyaltyReads, getOwnerLoyaltyReads, retryOwnerLoyaltyReads, processLoyaltyReads, LoyaltyReadError, loyaltyReadErrorMessage } from "@/lib/data/loyalty-read-operations";
import { dispatchStampCardLinks } from "@/lib/loyalty/read-card-links";
import type { LoyaltyReadInput, LoyaltyReadScope, LoyaltyReadFilters, LoyaltyReadFailure } from "@/lib/loyalty/read-operation-types";

function failure(error: unknown): LoyaltyReadFailure {
  let code = "unavailable", retryable = true;
  if (error instanceof LoyaltyReadError) { code = error.code; retryable = error.retryable; }
  else if (error instanceof ZodError) { code = "invalid_input"; retryable = false; }
  else if (error instanceof Error && /session expired|session context is invalid|account is inactive|Unauthorized/i.test(error.message)) { code = "session_invalid"; retryable = false; }
  else if (error instanceof Error && /صلاحية|غير متاح|Forbidden/i.test(error.message)) { code = "permission_denied"; retryable = false; }
  return { ok: false, code, retryable, message: loyaltyReadErrorMessage(code) };
}
function continueReads(options: { requestIds?: string[]; cafeId?: string }) {
  after(async () => {
    try { await processLoyaltyReads({ ...options, limit: 10 }); }
    catch { console.error("loyalty_read_background_failed"); }
    try { await dispatchStampCardLinks(2); }
    catch { console.error("loyalty_card_link_background_failed"); }
  });
}
export async function enqueueLoyaltyReadAction(input: LoyaltyReadInput) {
  try {
    const operation = await enqueueLoyaltyRead(input);
    continueReads({ cafeId: input.cafeId, requestIds: [operation.requestId] });
    return { ok: true as const, operation };
  } catch (error) { return failure(error); }
}
export async function loadCashierLoyaltyReadsAction(requestIds: string[], expectedScope: LoyaltyReadScope) {
  try {
    const operations = await getCashierLoyaltyReads(requestIds, expectedScope);
    const pending = operations.filter(item => item.status === "pending").map(item => item.requestId);
    if (pending.length) continueReads({ cafeId: expectedScope.cafeId, requestIds: pending });
    return { ok: true as const, operations };
  } catch (error) { return failure(error); }
}
export async function loadOwnerLoyaltyReadsAction(input: LoyaltyReadFilters = {}) {
  try { return { ok: true as const, data: await getOwnerLoyaltyReads(input) }; }
  catch (error) { return failure(error); }
}
export async function retryOwnerLoyaltyReadsAction(requestIds?: string[]) {
  try {
    const result = await retryOwnerLoyaltyReads(requestIds);
    if (result.retried) continueReads({ cafeId: result.cafeId });
    return { ok: true as const, retried: result.retried };
  } catch (error) { return failure(error); }
}
