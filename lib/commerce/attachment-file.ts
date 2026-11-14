import sharp from "sharp";

export const COMMERCE_ATTACHMENT_LIMIT = 3 * 1024 * 1024;
export async function prepareCommerceAttachment(input: Buffer, declaredType: string) {
  if (!input.length || input.length > COMMERCE_ATTACHMENT_LIMIT) throw new Error("حجم الملف يجب ألا يتجاوز ٣ ميجابايت");
  if (!["image/png", "image/jpeg", "image/webp"].includes(declaredType)) throw new Error("ارفع صورة بصيغة PNG أو JPG أو WebP");
  const image = sharp(input, { limitInputPixels: 20_000_000, animated: false, failOn: "warning" });
  const meta = await image.metadata();
  const mime = meta.format === "png" ? "image/png" : meta.format === "jpeg" ? "image/jpeg" : meta.format === "webp" ? "image/webp" : null;
  if (!mime || mime !== declaredType || (meta.pages ?? 1) !== 1) throw new Error("نوع الصورة غير مطابق أو الملف متحرك");
  // Re-encode raster content; never retain executable payloads, EXIF or metadata.
  const bytes = await image.rotate().toBuffer();
  if (bytes.length > COMMERCE_ATTACHMENT_LIMIT) throw new Error("حجم الصورة بعد المعالجة يتجاوز ٣ ميجابايت");
  return { bytes, mime, name: `design.${mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp"}` };
}
