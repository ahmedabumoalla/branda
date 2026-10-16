import type { MenuProduct, MenuProductImage } from "@/lib/mock/menu";

export function imageKey(image: MenuProductImage) {
  return image.imageAssetId || image.imageDataUrl || "";
}

/** The first persisted media item is the owner's cover choice. Legacy video covers stay videos. */
export function primaryMediaType(product: Pick<MenuProduct, "media" | "videoAssetId">): "image" | "video" {
  return product.media?.find((item) => item.primary)?.type
    ?? (product.videoAssetId || product.media?.some((item) => item.type === "video") ? "video" : "image");
}

export function orderedProductMedia(images: MenuProductImage[], video: NonNullable<MenuProduct["media"]>[number] | undefined, primary: "image" | "video") {
  const media = images.map((item) => ({ type: "image" as const, assetId: item.imageAssetId, url: item.imageDataUrl, alt: item.alt }));
  const ordered = video ? primary === "video" ? [video, ...media] : [...media, video] : media;
  return ordered.map((item, index) => ({ ...item, primary: index === 0 }));
}
