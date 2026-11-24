import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Logo = { url: string; path?: string };

/** Only call after platform-admin authorization, using that authenticated client. */
export async function getAdminBrandLogos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Record<string, unknown>[],
): Promise<Map<string, Logo>> {
  const logos = new Map<string, Logo>();
  if (!rows.length) return logos;
  const identities = new Map<string, { logo_storage_path: string | null; logo_url: string | null }>();
  for (let offset = 0; offset < rows.length; offset += 100) {
    const { data } = await supabase.from("cafe_custom_identity")
      .select("cafe_id,logo_storage_path,logo_url").in("cafe_id", rows.slice(offset, offset + 100).map(row => String(row.id)));
    for (const row of data ?? []) identities.set(row.cafe_id, row);
  }
  for (const row of rows) {
    const id = String(row.id);
    const settings = row.cafe_settings as Record<string, unknown> | null;
    const identity = identities.get(id);
    const path = String(settings?.logo_storage_path || identity?.logo_storage_path || "");
    const url = String(settings?.logo_url || identity?.logo_url || "");
    logos.set(id, {
      url,
      path: path.startsWith(`${id}/`) && !path.split("/").includes("..") ? path : undefined,
    });
  }
  const paths = [...new Set([...logos.values()].flatMap(logo => logo.path ? [logo.path] : []))];
  // Batch signing avoids one Storage request per brand and does not depend on its plan.
  for (let offset = 0; offset < paths.length; offset += 100) {
    try {
      const { data: signed } = await supabase.storage.from("cafe-logos")
        .createSignedUrls(paths.slice(offset, offset + 100), 3600);
      const urls = new Map((signed ?? []).filter(row => !row.error && row.signedUrl)
        .map(row => [row.path, row.signedUrl]));
      for (const logo of logos.values()) {
        if (logo.path && urls.has(logo.path)) logo.url = urls.get(logo.path)!;
      }
    } catch {
      // A temporary image failure must not prevent managing the brand directory.
    }
  }
  return logos;
}
