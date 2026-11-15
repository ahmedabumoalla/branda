let csrf = "";
const browserFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const target = new URL(input instanceof Request ? input.url : String(input), location.href);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) && !["blob:", "data:"].includes(target.protocol)) return Promise.reject(new Error("هذا الإجراء يحتاج خدمة خارجية غير متاحة في النسخة المحلية"));
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (target.origin === location.origin && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined)); headers.set("X-CSRF-Token", csrf);
    return browserFetch(input, { ...init, headers });
  }
  return browserFetch(input, init);
};
export function setCsrf(value: string | undefined) { csrf = value || ""; }
export function csrfHeaders() { return { "X-CSRF-Token": csrf }; }
export async function localRequest(path: string, payload?: unknown): Promise<any> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...(payload === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(payload) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || result.error || "تعذر تنفيذ العملية المحلية");
  if (path === "/api/password") window.dispatchEvent(new Event("branda:session-refresh"));
  return result;
}
async function encode(value: any): Promise<any> {
  if (value instanceof File) {
    const bytes = new Uint8Array(await value.arrayBuffer()); let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return { $type: "File", name: value.name, type: value.type, data: btoa(binary) };
  }
  if (value instanceof FormData) return { $type: "FormData", entries: await Promise.all([...value.entries()].map(async ([key, item]) => [key, await encode(item)])) };
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await encode(item)])));
  return value;
}
export async function invokeAction(module: string, name: string, args: unknown[]) {
  if (module === "@/app/actions/finance-access" && name === "logoutFinanceAction") {
    await localRequest("/api/logout", {}); window.dispatchEvent(new Event("branda:logout")); window.dispatchEvent(new Event("branda:session-refresh")); return;
  }
  try { return await localRequest("/api/action", { module, name, args: await encode(args) }); }
  catch (error) {
    if (!module.startsWith("@/app/actions/finance")) throw error;
    return { ok: false, message: error instanceof Error ? error.message : "تعذر حفظ العملية على الجهاز" };
  }
}
export async function localStorageUpload(bucket: string, path: string, token: string, file: File | Blob) {
  const data = new FormData(); data.set("bucket", bucket); data.set("path", path); data.set("token", token); data.set("file", file);
  const response = await fetch("/api/storage/upload", { method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": csrf }, body: data });
  const result = await response.json(); return response.ok ? { data: result, error: null } : { data: null, error: { message: result.message || result.error || "تعذر رفع الملف المحلي" } };
}
