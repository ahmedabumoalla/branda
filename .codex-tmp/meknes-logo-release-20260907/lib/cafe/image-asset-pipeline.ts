export type ImageAssetPurpose =
  | "custom-theme-logo"
  | "custom-theme-background"
  | "cafe-logo"
  | "product-image"
  | "category-image"
  | "offer-banner"
  | "marketing-image"
  | "customer-avatar";

export type OptimizedImageResult = {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  originalSizeBytes: number;
  wasOptimized: boolean;
  fileName: string;
};

export class ImagePipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImagePipelineError";
  }
}

export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

const ACCEPTED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

type PurposeConfig = {
  maxWidth: number;
  maxHeight: number;
  qualityStart: number;
  qualityMin: number;
  targetBytes: number;
};

const PURPOSE_CONFIG: Record<ImageAssetPurpose, PurposeConfig> = {
  "custom-theme-logo": {
    maxWidth: 1400,
    maxHeight: 1400,
    qualityStart: 0.92,
    qualityMin: 0.72,
    targetBytes: 500 * 1024,
  },
  "cafe-logo": {
    maxWidth: 1400,
    maxHeight: 1400,
    qualityStart: 0.92,
    qualityMin: 0.72,
    targetBytes: 500 * 1024,
  },
  "custom-theme-background": {
    maxWidth: 2560,
    maxHeight: 1600,
    qualityStart: 0.88,
    qualityMin: 0.62,
    targetBytes: 1.8 * 1024 * 1024,
  },
  "offer-banner": {
    maxWidth: 2560,
    maxHeight: 1600,
    qualityStart: 0.88,
    qualityMin: 0.62,
    targetBytes: 1.8 * 1024 * 1024,
  },
  "marketing-image": {
    maxWidth: 2560,
    maxHeight: 1600,
    qualityStart: 0.88,
    qualityMin: 0.62,
    targetBytes: 1.8 * 1024 * 1024,
  },
  "product-image": {
    maxWidth: 1600,
    maxHeight: 1600,
    qualityStart: 0.9,
    qualityMin: 0.68,
    targetBytes: 900 * 1024,
  },
  "category-image": {
    maxWidth: 1600,
    maxHeight: 1600,
    qualityStart: 0.9,
    qualityMin: 0.68,
    targetBytes: 900 * 1024,
  },
  "customer-avatar": {
    maxWidth: 800,
    maxHeight: 800,
    qualityStart: 0.88,
    qualityMin: 0.7,
    targetBytes: 350 * 1024,
  },
};

function normalizeMime(type: string) {
  return type.toLowerCase().split(";")[0].trim();
}

function scaleDimensions(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number
) {
  const ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight, 1);
  return {
    width: Math.max(1, Math.round(srcWidth * ratio)),
    height: Math.max(1, Math.round(srcHeight * ratio)),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

async function loadImageSource(file: File): Promise<{
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap !== "undefined") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => {
          ctx.drawImage(bitmap, 0, 0, w, h);
          bitmap.close();
        },
        cleanup: () => {
          try {
            bitmap.close();
          } catch {
            /* ignore */
          }
        },
      };
    } catch {
      /* fall through to HTMLImageElement */
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
        cleanup: () => {},
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new ImagePipelineError("تعذر قراءة الصورة، جرّب ملف PNG أو JPG أو WEBP")
      );
    };
    img.src = objectUrl;
  });
}

async function encodeOptimized(
  file: File,
  config: PurposeConfig
): Promise<{ blob: Blob; mimeType: string; width: number; height: number }> {
  const source = await loadImageSource(file);
  const { width, height } = scaleDimensions(
    source.width,
    source.height,
    config.maxWidth,
    config.maxHeight
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    source.cleanup();
    throw new ImagePipelineError("تعذر معالجة الصورة في المتصفح");
  }

  ctx.drawImage = ctx.drawImage.bind(ctx);
  source.draw(ctx, width, height);
  source.cleanup();

  const mimeCandidates = ["image/webp", "image/jpeg"] as const;
  let bestBlob: Blob | null = null;
  let bestMime = "image/jpeg";

  for (const mime of mimeCandidates) {
    let quality = config.qualityStart;
    let candidate: Blob | null = null;

    while (quality >= config.qualityMin) {
      const blob = await canvasToBlob(canvas, mime, quality);
      if (!blob) break;
      candidate = blob;
      if (blob.size <= config.targetBytes) {
        bestBlob = blob;
        bestMime = mime;
        return { blob: bestBlob, mimeType: bestMime, width, height };
      }
      quality -= 0.06;
    }

    if (candidate && (!bestBlob || candidate.size < bestBlob.size)) {
      bestBlob = candidate;
      bestMime = mime;
    }
  }

  if (!bestBlob) {
    throw new ImagePipelineError("تعذر ضغط الصورة، جرّب ملفًا آخر");
  }

  return { blob: bestBlob, mimeType: bestMime, width, height };
}

export async function optimizeImageForStorage(
  file: File,
  purpose: ImageAssetPurpose
): Promise<OptimizedImageResult> {
  if (typeof window === "undefined") {
    throw new ImagePipelineError("Image optimization requires a browser environment");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImagePipelineError(
      "حجم الصورة كبير جدًا للمعالجة، اختر ملفًا أقل من 40MB"
    );
  }

  const mime = normalizeMime(file.type);
  if (mime === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    throw new ImagePipelineError("ارفع الشعار بصيغة PNG أو JPG أو WEBP");
  }

  if (!ACCEPTED_MIMES.has(mime)) {
    throw new ImagePipelineError("تعذر قراءة الصورة، جرّب ملف PNG أو JPG أو WEBP");
  }

  const config = PURPOSE_CONFIG[purpose];
  const encoded = await encodeOptimized(file, config);
  const ext = encoded.mimeType === "image/webp" ? "webp" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "") || purpose;

  return {
    blob: encoded.blob,
    mimeType: encoded.mimeType,
    width: encoded.width,
    height: encoded.height,
    sizeBytes: encoded.blob.size,
    originalSizeBytes: file.size,
    wasOptimized: encoded.blob.size < file.size || encoded.width < config.maxWidth,
    fileName: `${baseName}.${ext}`,
  };
}

export async function optimizeDataUrlForStorage(
  dataUrl: string,
  purpose: ImageAssetPurpose,
  fileName = "legacy-image"
): Promise<OptimizedImageResult> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const file = new File([blob], fileName, { type: blob.type || "image/png" });
  return optimizeImageForStorage(file, purpose);
}

export function isHttpImageUrl(url?: string | null): boolean {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

export function isLegacyDataImageUrl(url?: string | null): boolean {
  return Boolean(url?.startsWith("data:image"));
}
