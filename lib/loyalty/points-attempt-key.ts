// Customer identity and card credentials are excluded from browser storage.
export async function pointsAttemptKey(scope: { cafeId: string; cashierId: string }, code: string, amount?: number) {
  const identity = new TextEncoder().encode([scope.cafeId, scope.cashierId, code, amount].join("|"));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", identity));
  const prefix = amount === undefined ? "loyalty-points-redemption:" : "loyalty-invoice:";
  return prefix + Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
}
