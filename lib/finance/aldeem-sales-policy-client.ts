"use client";

import { getAldeemSalesPolicy, saveAldeemSalesPolicy } from "@/app/actions/aldeem-sales-policy";
import { policySchema } from "./aldeem-sales-policy";

const legacyKey = "aldeem:khayal-aldeem:sales-invoice-policy:v1";
export const aldeemPolicyChanged = "aldeem-sales-policy-changed";

/** Import previously saved choices only when the account has no policy yet. */
export async function loadAldeemAccountPolicy() {
  const result = await getAldeemSalesPolicy();
  if (!result.ok) throw new Error(result.message);
  if (result.data.revision > 0) return result.data;
  let legacy: unknown;
  try { legacy = JSON.parse(localStorage.getItem(legacyKey) ?? "null"); } catch { /* Account reads do not depend on browser storage. */ }
  const parsed = policySchema.safeParse(legacy);
  if (!parsed.success) return result.data;
  const imported = await saveAldeemSalesPolicy(parsed.data, 0);
  if (imported.ok) {
    try { localStorage.removeItem(legacyKey); } catch { /* The account is authoritative. */ }
    return imported.data;
  }
  // Another device may have won the first-save race; never overwrite it.
  const current = await getAldeemSalesPolicy();
  if (current.ok && current.data.revision > 0) return current.data;
  throw new Error(imported.message);
}
