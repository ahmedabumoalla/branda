import {
  optimizeImageForStorage,
  type ImageAssetPurpose,
  type OptimizedImageResult,
} from "@/lib/cafe/image-asset-pipeline";

export type LocalAssetKind =
  | "custom-theme-logo"
  | "custom-theme-background"
  | "cafe-logo"
  | "product-image"
  | "category-image"
  | "offer-banner"
  | "marketing-image"
  | "customer-avatar";

export type StoredLocalAsset = {
  id: string;
  kind: LocalAssetKind;
  blob: Blob;
  mimeType: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
};

const DB_NAME = "branda-local-assets";
const DB_VERSION = 1;
const STORE_NAME = "assets";

/** Fixed IDs — replaced in place */
export const FIXED_ASSET_IDS: Partial<Record<LocalAssetKind, string>> = {
  "custom-theme-logo": "branda-qatrah-custom-theme-logo",
  "custom-theme-background": "branda-qatrah-custom-theme-background",
  "cafe-logo": "branda-qatrah-cafe-logo",
};

/** @deprecated use FIXED_ASSET_IDS */
export const LOCAL_ASSET_IDS = FIXED_ASSET_IDS as Record<
  "custom-theme-logo" | "custom-theme-background" | "cafe-logo",
  string
>;

const PURPOSE_BY_KIND: Record<LocalAssetKind, ImageAssetPurpose> = {
  "custom-theme-logo": "custom-theme-logo",
  "custom-theme-background": "custom-theme-background",
  "cafe-logo": "cafe-logo",
  "product-image": "product-image",
  "category-image": "category-image",
  "offer-banner": "offer-banner",
  "marketing-image": "marketing-image",
  "customer-avatar": "customer-avatar",
};

function isClient() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!isClient()) {
    return Promise.reject(new Error("IndexedDB is only available in the browser"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open IndexedDB"));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
  });
}

function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function buildAssetId(kind: LocalAssetKind, entityId?: string): string {
  const fixed = FIXED_ASSET_IDS[kind];
  if (fixed) return fixed;

  if (!entityId) {
    throw new Error(`Entity id required for asset kind "${kind}"`);
  }

  switch (kind) {
    case "product-image":
      return `branda-qatrah-product-${entityId}-image`;
    case "category-image":
      return `branda-qatrah-category-${entityId}-image`;
    case "offer-banner":
      return `branda-qatrah-offer-${entityId}-banner`;
    case "marketing-image":
      return `branda-qatrah-marketing-${entityId}-image`;
    case "customer-avatar":
      return `branda-customer-${entityId}-avatar`;
    default:
      throw new Error(`Unknown asset kind "${kind}"`);
  }
}

export function revokeObjectUrl(url?: string) {
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export async function getLocalAssetBlob(assetId: string): Promise<Blob | null> {
  if (!isClient()) return null;

  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const record = await new Promise<StoredLocalAsset | undefined>((resolve, reject) => {
      const req = store.get(assetId);
      req.onsuccess = () => resolve(req.result as StoredLocalAsset | undefined);
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    db.close();
    return record?.blob ?? null;
  } catch (err) {
    console.error("[local-asset-store] getLocalAssetBlob failed", err);
    return null;
  }
}

export async function getLocalAssetObjectUrl(
  assetId?: string
): Promise<string | undefined> {
  if (!assetId || !isClient()) return undefined;
  const blob = await getLocalAssetBlob(assetId);
  if (!blob) return undefined;
  return URL.createObjectURL(blob);
}

export async function saveLocalAsset(
  kind: LocalAssetKind,
  fileOrBlob: File | Blob,
  fileName?: string,
  entityId?: string
): Promise<string> {
  if (!isClient()) {
    throw new Error("IndexedDB is only available in the browser");
  }

  const id = buildAssetId(kind, entityId);
  const now = new Date().toISOString();
  const blob = fileOrBlob instanceof File ? fileOrBlob : fileOrBlob;
  const mimeType =
    blob.type || (fileOrBlob instanceof File ? fileOrBlob.type : "application/octet-stream");
  const name =
    fileName ??
    (fileOrBlob instanceof File ? fileOrBlob.name : `${kind}.${mimeType.split("/")[1] || "bin"}`);

  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const existing = await new Promise<StoredLocalAsset | undefined>((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as StoredLocalAsset | undefined);
    req.onerror = () => reject(req.error);
  });

  const record: StoredLocalAsset = {
    id,
    kind,
    blob,
    mimeType,
    fileName: name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  store.put(record);
  await txDone(tx);
  db.close();
  return id;
}

export async function saveOptimizedImageAsset(
  kind: LocalAssetKind,
  optimized: OptimizedImageResult,
  entityId?: string
): Promise<string> {
  return saveLocalAsset(kind, optimized.blob, optimized.fileName, entityId);
}

export async function replaceOptimizedImageAsset(
  kind: LocalAssetKind,
  file: File,
  entityId?: string
): Promise<{ assetId: string; optimized: OptimizedImageResult }> {
  const purpose = PURPOSE_BY_KIND[kind];
  const optimized = await optimizeImageForStorage(file, purpose);
  const assetId = await saveOptimizedImageAsset(kind, optimized, entityId);
  return { assetId, optimized };
}

/** @deprecated use replaceOptimizedImageAsset */
export async function replaceLocalAsset(
  kind: "custom-theme-logo" | "custom-theme-background" | "cafe-logo",
  fileOrBlob: File | Blob,
  fileName?: string
): Promise<string> {
  if (fileOrBlob instanceof File) {
    const { assetId } = await replaceOptimizedImageAsset(kind, fileOrBlob);
    return assetId;
  }
  return saveLocalAsset(kind, fileOrBlob, fileName);
}

export async function deleteLocalAsset(assetId: string): Promise<void> {
  if (!isClient()) return;

  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(assetId);
    await txDone(tx);
    db.close();
  } catch (err) {
    console.error("[local-asset-store] deleteLocalAsset failed", err);
  }
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}
