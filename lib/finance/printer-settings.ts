/** Device preferences only: never contains database credentials or authorizes a sale. */
export type FinancePrinterCopy = "customer" | "preparation";
export type FinancePrinterTarget = { enabled: boolean; deviceName: string; paper: "58" | "80" };
export type FinancePrinterSettings = {
  version: 1;
  mode: "browser" | "bridge";
  token: string;
  customer: FinancePrinterTarget;
  preparation: FinancePrinterTarget;
};
export type LocalPrinter = { name: string; displayName: string };
export type LocalPrintResult = { jobId: string; status: "submitted" | "uncertain" };
export const FINANCE_PRINTER_BRIDGE = "http://127.0.0.1:17841";

export function defaultPrinterSettings(): FinancePrinterSettings {
  return { version: 1, mode: "browser", token: "", customer: { enabled: true, deviceName: "", paper: "80" }, preparation: { enabled: true, deviceName: "", paper: "80" } };
}
export function normalizePrinterSettings(value: unknown): FinancePrinterSettings {
  const base = defaultPrinterSettings();
  if (!value || typeof value !== "object") return base;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return base;
  for (const key of ["customer", "preparation"] as const) {
    const target = record[key];
    if (target && typeof target === "object") {
      const item = target as Record<string, unknown>;
      base[key] = { enabled: item.enabled !== false, deviceName: typeof item.deviceName === "string" ? item.deviceName.slice(0, 256) : "", paper: item.paper === "58" ? "58" : "80" };
    }
  }
  base.mode = record.mode === "bridge" ? "bridge" : "browser";
  base.token = typeof record.token === "string" && /^[a-f0-9]{64}$/.test(record.token) ? record.token : "";
  return base;
}
export const printerSettingsKey = (brandId: string) => `branda:finance:printer:v1:${encodeURIComponent(brandId)}`;
export function loadPrinterSettings(brandId: string): FinancePrinterSettings {
  if (typeof window === "undefined") return defaultPrinterSettings();
  try { return normalizePrinterSettings(JSON.parse(window.localStorage.getItem(printerSettingsKey(brandId)) || "null")); }
  catch { return defaultPrinterSettings(); }
}
export function savePrinterSettings(brandId: string, settings: FinancePrinterSettings) {
  const normalized = normalizePrinterSettings(settings);
  if (normalized.mode === "bridge" && (!normalized.token || [normalized.customer, normalized.preparation].some(target => target.enabled && !target.deviceName))) throw new Error("اربط خدمة الطباعة واختر طابعة لكل نسخة مفعلة");
  try { window.localStorage.setItem(printerSettingsKey(brandId), JSON.stringify(normalized)); }
  catch { throw new Error("تعذر حفظ الإعدادات على هذا الجهاز تحقق من مساحة التخزين وإعدادات المتصفح"); }
  window.dispatchEvent(new CustomEvent("branda:printer-settings", { detail: brandId }));
}
async function bridgeRequest<T>(token: string, path: "/printers" | "/print", body?: unknown): Promise<T> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("أدخل رمز الربط الظاهر في خدمة طباعة برندة");
  let response: Response;
  try {
    response = await fetch(`${FINANCE_PRINTER_BRIDGE}${path}`, {
      method: body ? "POST" : "GET", credentials: "omit", cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45_000),
    });
  } catch { throw new Error("تعذر الاتصال بخدمة الطباعة المحلية شغّلها واسمح بالاتصال بالجهاز المحلي ثم أعد المحاولة"); }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("تعذر ربط الطابعة تحقق من رمز الربط وعنوان برندة المسموح في الخدمة");
    if (response.status === 409) throw new Error("تغيرت بيانات طلب طباعة سابق أعد الطباعة يدويًا فقط بعد التحقق من النسخة السابقة");
    throw new Error("لم تقبل خدمة الطباعة الطلب تحقق من الطابعة واتصالها ثم أعد المحاولة");
  }
  return response.json() as Promise<T>;
}
export async function discoverLocalPrinters(token: string): Promise<LocalPrinter[]> {
  const value = await bridgeRequest<{ printers: LocalPrinter[] }>(token, "/printers");
  return value.printers.filter(item => typeof item.name === "string" && typeof item.displayName === "string");
}
export async function sendToLocalPrinter(input: { brandId: string; jobId: string; copy: FinancePrinterCopy; html: string; settings?: FinancePrinterSettings }): Promise<LocalPrintResult> {
  const settings = input.settings ?? loadPrinterSettings(input.brandId);
  const target = settings[input.copy];
  if (settings.mode !== "bridge" || !target.enabled || !target.deviceName) throw new Error("اختر طابعة هذه النسخة من إعداد الطابعة أولًا");
  return bridgeRequest<LocalPrintResult>(settings.token, "/print", { brandId: input.brandId, jobId: input.jobId, copy: input.copy, html: input.html, deviceName: target.deviceName, paper: target.paper });
}
