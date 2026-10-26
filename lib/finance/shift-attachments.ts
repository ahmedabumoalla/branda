export type FinanceShiftAttachment = { id: string; name: string; size: number; mime: string };
export const FINANCE_ATTACHMENT_BUCKET = "branda-finance-shift-files";

export function attachmentName(name: string) {
  return name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim().slice(0, 255) || "attachment";
}

// Only photographic formats are recompressed; PDFs, documents and unsupported
// images remain intact. Keep the original whenever conversion would enlarge it
export async function compressShiftImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    // Invoice text remains readable at 2400px; no enlargement or heavy decoding loops
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", .84));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" }) : file;
  } catch { return file; } finally { bitmap?.close(); }
}
