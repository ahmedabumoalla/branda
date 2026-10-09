import "server-only";

// Bank transfer is the only enabled checkout until online gateways are connected.
export function areOnlinePaymentsEnabled() {
  return process.env.ONLINE_PAYMENTS_ENABLED === "true";
}
