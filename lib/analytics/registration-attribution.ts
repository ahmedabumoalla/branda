import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type RegistrationSource = "storefront" | "loyalty";

/** Call only after a successful INSERT, never after looking up an existing account. */
export async function recordNewCustomerRegistration(customerId: string, source: RegistrationSource) {
  try {
    const { error } = await createAdminClient().rpc("record_customer_registration_source", {
      p_customer_id: customerId, p_source: source,
    });
    if (error) console.warn("[registration-attribution] Recording unavailable");
  } catch {
    // Analytics must not prevent authentication; missing attribution stays unknown.
    console.warn("[registration-attribution] Recording unavailable");
  }
}
