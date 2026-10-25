import "server-only";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnedMenuAsset } from "@/lib/menu/standalone-menu";
import { standaloneLogoVariant } from "@/lib/menu/logo-variants";

function safeLogoUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4_000_000) return null;
  if (/^\/(?!\/)[a-z0-9_./-]+$/i.test(value) && !value.includes("..")) return value;
  if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value)) return value;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}

/** Finance authorization precedes every privileged, tenant-scoped identity read. */
export async function getFinanceReceiptBrand(slug: string) {
  const { cafe } = await getBrandFinanceContext(slug);
  const admin = createAdminClient();
  const [settings, identity] = await Promise.all([
    admin.from("cafe_settings").select("logo_storage_path,logo_url").eq("cafe_id", cafe.id).maybeSingle(),
    admin.from("cafe_custom_identity").select("palette,logo_storage_path,logo_url").eq("cafe_id", cafe.id).maybeSingle(),
  ]);
  if (settings.error || identity.error) throw new Error("تعذر تحميل هوية العلامة");
  const source = settings.data?.logo_storage_path || settings.data?.logo_url ? settings.data : identity.data;
  const path = source?.logo_storage_path;
  let logoUrl = standaloneLogoVariant(cafe.id, path || source?.logo_url);
  if (!logoUrl && path) {
    if (!isOwnedMenuAsset(path, cafe.id)) throw new Error("تعذر تحميل شعار العلامة");
    const signed = await admin.storage.from("cafe-logos").createSignedUrl(path, 600);
    if (signed.error || !signed.data?.signedUrl) throw new Error("تعذر تحميل شعار العلامة");
    logoUrl = signed.data.signedUrl;
  }
  if (!logoUrl && source?.logo_url) {
    logoUrl = safeLogoUrl(source.logo_url);
    if (!logoUrl) throw new Error("تعذر تحميل شعار العلامة");
  }
  const palette = identity.data?.palette as Record<string, unknown> | null;
  const color = palette?.primary;
  return { name: cafe.name, logoUrl, color: typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color : "#3a2117" };
}
