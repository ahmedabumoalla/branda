"use server";

import { uploadOptimizedImage, uploadProductVideo, type StorageBucket } from "@/lib/storage/upload-server";
import type { ImageAssetPurpose } from "@/lib/cafe/image-asset-pipeline";
import { assertOwnerServiceEnabled } from "@/lib/data/owner-service-access";

const PURPOSE_MAP: Record<string, ImageAssetPurpose> = {
  logo: "cafe-logo",
  background: "custom-theme-background",
  product: "product-image",
  category: "category-image",
  "offer-banner": "offer-banner",
  marketing: "marketing-image",
  avatar: "customer-avatar",
};

export async function uploadImageAction(
  bucket: StorageBucket,
  formData: FormData,
  purpose: "logo" | "background" | "product" | "category" | "offer-banner" | "marketing" | "avatar",
  pathPrefix: string
) {
  const feature = bucket === "menu-products" || bucket === "menu-categories" ? "menu"
    : bucket === "offer-banners" ? "offers" : bucket === "cafe-logos" ? "settings" : null;
  if (!feature) throw new Error("هذه الخدمة غير متاحة حاليًا");
  await assertOwnerServiceEnabled(feature);
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Missing file");
  }
  return uploadOptimizedImage(bucket, file, PURPOSE_MAP[purpose], pathPrefix);
}


export async function uploadProductVideoAction(formData: FormData, pathPrefix: string) {
  await assertOwnerServiceEnabled("menu");
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Missing file");
  }
  return uploadProductVideo(file, pathPrefix);
}
