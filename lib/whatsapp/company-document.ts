import "server-only";
import { selectLocoCustomerSender } from "./customer-routing";
import { LOCO_CAFE_ID } from "./brand-connection-types";
import { isGreenApiBackupOnly, getGreenApiCustomerPlatformSenders, isGreenApiCustomerSenderReady, type GreenApiCustomerSender } from "./green-api";

export async function selectCompanyDocumentSender(cafeId: string) {
  if (isGreenApiBackupOnly()) return null;
  if (cafeId === LOCO_CAFE_ID) return selectLocoCustomerSender(cafeId);
  const { primary, backup } = getGreenApiCustomerPlatformSenders();
  if (primary && await isGreenApiCustomerSenderReady(primary)) return primary;
  if (backup && await isGreenApiCustomerSenderReady(backup)) return backup;
  return null;
}

/** One submission only, including when the provider acknowledgement is uncertain */
export async function sendCompanyDocument(sender: GreenApiCustomerSender, input: { phone: string; pdf: Uint8Array; draftId: string }) {
  if (isGreenApiBackupOnly()) throw new Error("MESSAGING_TEMPORARILY_PAUSED");
  if (!/^9665\d{8}$/.test(input.phone) || !/^[a-f0-9-]{36}$/i.test(input.draftId)
    || !input.pdf.length || input.pdf.length > 8_000_000 || new TextDecoder().decode(input.pdf.slice(0, 5)) !== "%PDF-") throw new Error("INVALID_COMPANY_DOCUMENT");
  const { primary } = getGreenApiCustomerPlatformSenders();
  const configured = primary?.idInstance === sender.idInstance ? process.env.GREEN_API_MEDIA_URL?.trim() : undefined;
  const origin = new URL(configured || "https://media.green-api.com");
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.port || origin.pathname !== "/" || origin.search || origin.hash || !/(^|\.)(green-api\.com|greenapi\.com)$/.test(origin.hostname)
    || !/^\d+$/.test(sender.idInstance) || !/^[a-z0-9]+$/i.test(sender.apiTokenInstance)) throw new Error("INVALID_COMPANY_SENDER");
  const name = `invoice-${input.draftId}.pdf`;
  const body = new FormData();
  body.set("chatId", `${input.phone}@c.us`);
  body.set("caption", "فاتورتك الضريبية مرفقة شكرًا لتعاملك معنا");
  body.set("fileName", name);
  body.set("file", new Blob([new Uint8Array(input.pdf)], { type: "application/pdf" }), name);
  try {
    const response = await fetch(`${origin.origin}/waInstance${sender.idInstance}/sendFileByUpload/${sender.apiTokenInstance}`, { method: "POST", body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45_000) });
    if (!response.ok) return { status: response.status >= 400 && response.status < 500 && response.status !== 408 ? "rejected" as const : "unknown" as const };
    const result = await response.json() as { idMessage?: unknown };
    return typeof result.idMessage === "string" && result.idMessage.length > 0 && result.idMessage.length <= 200
      ? { status: "queued" as const, providerMessageId: result.idMessage } : { status: "unknown" as const };
  } catch { return { status: "unknown" as const }; }
}
