export const MARKETING_STOP_FOOTER = "لإيقاف الرسائل أرسل كلمة إيقاف";
export const MARKETING_MEDIA_BODY_LIMIT = 1024 - MARKETING_STOP_FOOTER.length - 2;
export const MARKETING_MEDIA_BUCKET = "marketing-media";
export const MARKETING_MEDIA_TYPES = {
  "image/jpeg": { kind: "image", extension: "jpg", maxSize: 10 * 1024 * 1024 },
  "image/png": { kind: "image", extension: "png", maxSize: 10 * 1024 * 1024 },
  "image/webp": { kind: "image", extension: "webp", maxSize: 10 * 1024 * 1024 },
  "video/mp4": { kind: "video", extension: "mp4", maxSize: 50 * 1024 * 1024 },
} as const;
export type MarketingMediaMime = keyof typeof MARKETING_MEDIA_TYPES;
export function validateMarketingMediaFile(input: { mimeType: string; size: number }): boolean {
  const rule = MARKETING_MEDIA_TYPES[input.mimeType as MarketingMediaMime];
  return Boolean(rule && Number.isSafeInteger(input.size) && input.size > 0 && input.size <= rule.maxSize);
}

export function marketingMediaSignature(bytes: Uint8Array, mime: MarketingMediaMime): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (mime === "image/jpeg") return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/png") return bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((byte, index) => bytes[index] === byte) && ascii(12,16) === "IHDR";
  if (mime === "image/webp") return bytes.length >= 16 && ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP" && ["VP8 ","VP8L","VP8X"].includes(ascii(12,16));
  return bytes.length >= 24 && ascii(4,8) === "ftyp" && /^(?:isom|iso[2-9]|mp4[12]|avc1|M4V |dash)$/.test(ascii(8,12));
}
