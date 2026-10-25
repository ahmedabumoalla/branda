export const TREASURY_ATTACHMENT_BUCKET = "branda-finance-treasury-files";
export type TreasuryAttachment = { id: string; name: string; size: number; createdAt: string };

export function treasuryAttachmentName(name: string) {
  return name.replace(/[\u0000-\u001f\u007f/\\\u202a-\u202e\u2066-\u2069]/g, "_").trim().slice(0, 180) || "attachment";
}

// Compress photographic documents only; preserve PDFs and all other bytes
export async function compressTreasuryImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", .9));
    return blob && blob.size < file.size
      ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" }) : file;
  } catch { return file; } finally { bitmap?.close(); }
}
