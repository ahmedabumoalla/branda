import type { MenuProductImage } from "@/lib/mock/menu";
import { getLocalAssetBlob } from "@/lib/cafe/local-asset-store";

/** Fetch the stored bytes, never a resized display thumbnail or canvas conversion. */
export async function getProductImageDownload(image: MenuProductImage, original?: File): Promise<Blob> {
  if (original) return original;
  let source = image.imageDataUrl;
  if (image.imageAssetId?.includes("/")) {
    source = `/api/owner/menu-media?path=${encodeURIComponent(image.imageAssetId)}`;
  } else if (image.imageAssetId) {
    const local = await getLocalAssetBlob(image.imageAssetId);
    if (local) return local;
  }
  if (!source || !/^(https?:\/\/|blob:|data:image\/|\/api\/owner\/menu-media\?)/i.test(source)) {
    throw new Error("Image unavailable");
  }
  const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error("Image download failed");
  const blob = await response.blob();
  if (!blob.size || !blob.type.startsWith("image/")) throw new Error("Invalid image response");
  return blob;
}

export function saveProductImageDownload(blob: Blob, name: string) {
  const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg", "image/heic": "heic", "image/heif": "heif" };
  const extension = extensions[blob.type] ?? "img";
  const filename = (name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim().slice(0, 100) || "product") + "." + extension;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try { link.click(); } finally {
    link.remove();
    // Give the browser time to start writing before releasing the original bytes.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
