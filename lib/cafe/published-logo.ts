import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedServerValue } from "@/lib/performance/server-memory-cache";
import { isOwnedMenuAsset } from "@/lib/menu/standalone-menu";
import { clearUniformLogoBackground } from "@/lib/cafe/logo-transparency";

/** Call after the public menu entitlement gate. Derivatives never replace the
 * uploaded original and are reused across instances and subsequent page views. */
export async function publishedMenuLogo(admin: SupabaseClient, cafeId: string, source: string) {
  if (!isOwnedMenuAsset(source, cafeId)) return null;
  return cachedServerValue(`transparent-menu-logo:v1:${cafeId}:${source}`, 30 * 60_000, async () => {
    const bucket = admin.storage.from("cafe-logos");
    const originalUrl = async () => (await bucket.createSignedUrl(source, 3600)).data?.signedUrl ?? null;
    try {
      const info = await bucket.info(source);
      if (!info.data || (info.data.size ?? 0) > 8 * 1024 * 1024) return originalUrl();
      const hash = createHash("sha256").update(`${source}:${info.data.version}:${info.data.etag ?? ""}`).digest("hex");
      const derivative = `${cafeId}/processed-logos/v1-${hash}.webp`;
      if (!(await bucket.info(derivative)).data) {
        const downloaded = await bucket.download(source);
        if (!downloaded.data || downloaded.data.size > 8 * 1024 * 1024) return originalUrl();
        const { data, info: pixels } = await sharp(Buffer.from(await downloaded.data.arrayBuffer()), { limitInputPixels: 16_000_000 })
          .rotate().resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const rgba = new Uint8ClampedArray(data);
        clearUniformLogoBackground(rgba, pixels.width, pixels.height);
        const output = await sharp(Buffer.from(rgba), { raw: { width: pixels.width, height: pixels.height, channels: 4 } }).webp({ quality: 92 }).toBuffer();
        // Unique content/version path makes concurrent identical creation safe.
        const uploaded = await bucket.upload(derivative, output, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
        if (uploaded.error && !(await bucket.info(derivative)).data) return originalUrl();
      }
      return (await bucket.createSignedUrl(derivative, 3600)).data?.signedUrl ?? originalUrl();
    } catch {
      return originalUrl();
    }
  });
}
