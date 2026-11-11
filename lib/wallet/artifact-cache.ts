import "server-only";
import { createHash } from "node:crypto";

export function walletArtifactKey(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

// Only derived artwork belongs here. Authorization and member/balance reads must
// run on every request before using an artifact. Both retained bytes and work
// awaiting completion are bounded per server instance.
export function createWalletArtifactCache(maxBytes: number, maxEntries: number, ttlMs: number) {
  const entries = new Map<string, { value: Buffer; expires: number }>();
  const pending = new Map<string, Promise<Buffer>>();
  let bytes = 0;
  const remove = (key: string) => {
    const entry = entries.get(key);
    if (entry) bytes -= entry.value.byteLength;
    entries.delete(key);
  };
  return async (key: string, generate: () => Promise<Buffer>): Promise<Buffer> => {
    const entry = entries.get(key);
    if (entry && entry.expires > Date.now()) {
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    }
    remove(key);
    const existing = pending.get(key);
    if (existing) return existing;
    if (pending.size >= maxEntries) return generate();
    const request = Promise.resolve().then(generate).then(value => {
      if (value.byteLength <= maxBytes) {
        for (const [id, cached] of entries) if (cached.expires <= Date.now()) remove(id);
        while (entries.size >= maxEntries || bytes + value.byteLength > maxBytes) remove(entries.keys().next().value!);
        entries.set(key, { value, expires: Date.now() + ttlMs });
        bytes += value.byteLength;
      }
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}
