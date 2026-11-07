import "server-only";
import { getCurrentMaintenanceSession } from "@/lib/platform/maintenance";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getFinanceCashierMaintenance(cafeId: string) {
  const session = await getCurrentMaintenanceSession();
  if (!session || session.cafeId !== cafeId || session.expiresAt <= Date.now()) return null;
  const client = createAdminClient();
  const parameters = {
    p_cafe_id: cafeId,
    p_actor_id: session.adminUserId,
    p_maintenance_expires_at: new Date(session.expiresAt).toISOString(),
  };
  const result = await client.rpc("brand_finance_maintenance_cashier", {
    ...parameters, p_operation: "authorize", p_payload: {},
  });
  if (result.error || result.data?.authorized !== true) return null;
  return {
    execute: (operation: "add" | "link" | "update", payload: Record<string, unknown>) =>
      client.rpc("brand_finance_maintenance_cashier", { ...parameters, p_operation: operation, p_payload: payload }),
  };
}
