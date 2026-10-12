import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// Authorization and published tenant/path filtering run in getStandaloneMenu first.
// Stable URLs allow browser/CDN reuse across 30-second catalog refreshes.
const signAssets = unstable_cache(async (paths: string[], window: number) => {
  void window;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("menu-products").createSignedUrls(paths, 3600);
  if (error) throw error;
  return data ?? [];
}, ["kath-published-menu-assets-v1"], { revalidate: 3000 });

export function getKathMenuAssets(paths: string[], now = Date.now()) {
  // A new time-window key forces renewal; an expired stale signature is never reused.
  return signAssets([...paths].sort(), Math.floor(now / 3_000_000));
}
