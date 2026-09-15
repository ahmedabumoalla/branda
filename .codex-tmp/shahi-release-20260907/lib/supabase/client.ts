import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/barndaksa/env";

export function createClient() {
  return createBrowserClient(requireSupabaseUrl(), requireSupabaseAnonKey());
}
