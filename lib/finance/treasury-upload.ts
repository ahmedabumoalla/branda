import { requireSupabaseUrl } from "@/lib/barndaksa/env";
import { TREASURY_ATTACHMENT_BUCKET } from "./treasury-attachments";

// Supabase requires 6 MiB TUS chunks; this is a transport size, not a file limit
const CHUNK_BYTES = 6 * 1024 * 1024;
const uploads = new Map<string, string>();
const uploadError = () => new Error("تعذر رفع الملف تحقق من الاتصال ثم أعد المحاولة لاستكمال الرفع");
function requireUploadResponse(response: Response) {
  if (response.status === 413) throw new Error("الملف أكبر من السعة التي تسمح بها خدمة التخزين حاليًا تواصل مع إدارة برندة لرفع سعة التخزين");
  if (!response.ok) throw uploadError();
}

function storageEndpoint() {
  const url = new URL(requireSupabaseUrl());
  if (/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)) url.hostname = url.hostname.replace(".supabase.co", ".storage.supabase.co");
  url.pathname = "/storage/v1/upload/resumable";
  url.search = "";
  return url;
}

function readOffset(response: Response, size: number) {
  const raw = response.headers.get("Upload-Offset");
  const offset = raw === null ? NaN : Number(raw);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > size) throw uploadError();
  return offset;
}

export async function uploadTreasuryFile(file: File, path: string, token: string, progress?: (uploaded: number, total: number) => void, signal?: AbortSignal) {
  const endpoint = storageEndpoint();
  const key = `${endpoint.origin}/${path}`;
  const headers = { "Tus-Resumable": "1.0.0", "x-signature": token };
  const deadline = (ms: number) => signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
  let location = uploads.get(key);
  let offset = 0;
  if (location) {
    const response = await fetch(location, { method: "HEAD", headers, cache: "no-store", redirect: "error", signal: deadline(60_000) });
    if (response.status === 404 || response.status === 410) { uploads.delete(key); location = undefined; }
    else if (!response.ok) throw uploadError();
    else offset = readOffset(response, file.size);
  }
  if (!location) {
    const metadata = { bucketName: TREASURY_ATTACHMENT_BUCKET, objectName: path, contentType: "application/octet-stream", cacheControl: "0" };
    const response = await fetch(endpoint, {
      method: "POST", redirect: "error", signal: deadline(60_000),
      headers: { ...headers, "Upload-Length": String(file.size), "Upload-Metadata": Object.entries(metadata).map(([name, value]) => `${name} ${btoa(value)}`).join(",") },
    });
    const returned = response.headers.get("Location");
    requireUploadResponse(response);
    if (!returned) throw uploadError();
    const destination = new URL(returned, endpoint);
    // Never forward signed credentials to an untrusted origin or endpoint
    if (destination.origin !== endpoint.origin || !destination.pathname.startsWith(endpoint.pathname + "/")) throw uploadError();
    location = destination.href;
    uploads.set(key, location);
  }
  progress?.(offset, file.size);
  while (offset < file.size) {
    const end = Math.min(file.size, offset + CHUNK_BYTES);
    const response = await fetch(location, {
      method: "PATCH", redirect: "error", signal: deadline(120_000),
      headers: { ...headers, "Upload-Offset": String(offset), "Content-Type": "application/offset+octet-stream" },
      body: file.slice(offset, end),
    });
    requireUploadResponse(response);
    const next = readOffset(response, file.size);
    if (next !== end) throw uploadError();
    offset = next;
    progress?.(offset, file.size);
  }
  uploads.delete(key);
}
