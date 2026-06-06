import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/branda/env";

export function createClient() {
  return createBrowserClient(requireSupabaseUrl(), requireSupabaseAnonKey());
}
