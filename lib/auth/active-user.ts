import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { transientAuthError } from "./session-policy";

/** Validate Auth plus live suspension/ban state; outages never become signed-out results. */
export const getActiveUser = cache(async (client: SupabaseClient) => {
  const { data: { user }, error } = await client.auth.getUser();
  if (transientAuthError(error)) throw new Error("Account service temporarily unavailable");
  if (error || !user) return null;
  const access = await client.rpc("current_account_active");
  if (access.error) throw new Error("Account status temporarily unavailable");
  return access.data === true ? user : null;
});
