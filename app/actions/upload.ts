"use server";

import { uploadOptimizedImage, uploadProductVideo, uploadReservationServiceVideo, type StorageBucket } from "@/lib/storage/upload-server";
import type { ImageAssetPurpose } from "@/lib/cafe/image-asset-pipeline";

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
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Missing file");
  }
  return uploadOptimizedImage(bucket, file, PURPOSE_MAP[purpose], pathPrefix);
}


export async function uploadReservationVideoAction(formData: FormData, pathPrefix: string) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Missing file");
  }
  return uploadReservationServiceVideo(file, pathPrefix);
}

export async function uploadProductVideoAction(formData: FormData, pathPrefix: string) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Missing file");
  }
  return uploadProductVideo(file, pathPrefix);
}
