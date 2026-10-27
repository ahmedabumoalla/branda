import "server-only";

export type ProviderMessageStatus = "pending" | "sent" | "delivered" | "read" | "failed" | "yellowCard";
const statuses = new Set<ProviderMessageStatus>(["pending", "sent", "delivered", "read", "failed", "yellowCard"]);

// This adapter only reads the provider journal. It cannot send or retry a message.
export async function readFinanceProviderMessageStatus(phone: string, messageId: string): Promise<ProviderMessageStatus | null> {
  const api = process.env.GREEN_API_API_URL?.trim();
  const instance = process.env.GREEN_API_ID_INSTANCE?.trim();
  const token = process.env.GREEN_API_API_TOKEN_INSTANCE?.trim();
  if (!api || !instance || !token || !/^9665\d{8}$/.test(phone) || !messageId || messageId.length > 300) return null;
  try {
    const url = new URL(api);
    if (url.protocol !== "https:" || !/(^|\.)(green-api\.com|greenapi\.com)$/.test(url.hostname) || url.username || url.password) return null;
    const chatId = `${phone}@c.us`;
    const response = await fetch(`${url.origin}/waInstance${encodeURIComponent(instance)}/getMessage/${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId, idMessage: messageId }),
      cache: "no-store", signal: AbortSignal.timeout(5000), redirect: "error",
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!data || typeof data !== "object") return null;
    const row = data as Record<string, unknown>;
    if (row.type !== "outgoing" || row.idMessage !== messageId || row.chatId !== chatId || typeof row.statusMessage !== "string") return null;
    return statuses.has(row.statusMessage as ProviderMessageStatus) ? row.statusMessage as ProviderMessageStatus : null;
  } catch { return null; }
}
