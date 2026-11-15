import { localStorageUpload } from "./api";
import { TREASURY_ATTACHMENT_BUCKET } from "../../lib/finance/treasury-attachments";
export async function uploadTreasuryFile(file: File, path: string, token: string, progress?: (uploaded: number, total: number) => void, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("أُلغي رفع الملف");
  progress?.(0, file.size);
  const result = await localStorageUpload(TREASURY_ATTACHMENT_BUCKET, path, token, file);
  if (result.error) throw new Error(result.error.message);
  progress?.(file.size, file.size);
}
