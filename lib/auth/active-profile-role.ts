import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Callers obtain userId from getActiveUser first. Deduplicate this exact projection
// only inside the current server request; never reuse authority across requests.
export const readActiveProfileRole = cache(async (client: SupabaseClient, userId: string) =>
  client.from("profiles").select("role").eq("id", userId).maybeSingle()
);
