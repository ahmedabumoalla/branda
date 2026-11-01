type Pending = { fingerprint: string; id: string };
type Persistence = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const memory = new Map<string, Pending>();
function browserStorage(): Persistence | undefined { try { return window.localStorage; } catch { return undefined; } }

/** Persist only a one-way payload fingerprint and random retry identifier, never customer details. */
export async function pendingGiftRequest(slug: string, payload: unknown, storage = browserStorage()): Promise<string> {
  const key = `gift-pending-request:${slug}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  let previous = memory.get(key);
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(key) ?? "null");
    if (parsed && typeof parsed === "object" && "fingerprint" in parsed && "id" in parsed && parsed.fingerprint === fingerprint && typeof parsed.id === "string" && /^[0-9a-f-]{36}$/i.test(parsed.id)) previous = { fingerprint: parsed.fingerprint, id: parsed.id };
  } catch { /* An old or unavailable local record must not block ordering. */ }
  const pending = previous?.fingerprint === fingerprint ? previous : { fingerprint, id: crypto.randomUUID() };
  memory.set(key, pending);
  try { storage?.setItem(key, JSON.stringify(pending)); } catch { /* Same-page retries retain the in-memory identifier. */ }
  return pending.id;
}

export function clearPendingGiftRequest(slug: string, requestId: string, storage = browserStorage()) {
  const key = `gift-pending-request:${slug}`;
  if (memory.get(key)?.id === requestId) memory.delete(key);
  try { const value = JSON.parse(storage?.getItem(key) ?? "null"); if (value?.id === requestId) storage?.removeItem(key); } catch { /* A saved receipt is already available. */ }
}
