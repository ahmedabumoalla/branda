type Entry = { value: unknown; expiresAt: number; bytes: number };

/** Process/tab-local cache. Callers remain responsible for authorization and key scope. */
export function createBoundedCache(maxEntries: number, maxBytes: number) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || !Number.isFinite(maxBytes) || maxBytes < 1) throw new Error('Invalid cache capacity');
  const entries = new Map<string, Entry>();
  const pending = new Map<string, Promise<unknown>>();
  let bytes = 0;
  function remove(key: string) {
    const entry = entries.get(key);
    if (entry) bytes -= entry.bytes;
    entries.delete(key);
  }
  function read<T>(key: string): T | null {
    const entry = entries.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) { remove(key); return null; }
    entries.delete(key);
    entries.set(key, entry);
    return entry.value as T;
  }
  function write<T>(key: string, value: T, ttlMs: number) {
    pending.delete(key);
    remove(key);
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 || value === null || value === undefined) return;
    let size: number;
    try {
      const encoded = typeof value === 'string' ? value : JSON.stringify(value);
      if (encoded === undefined) return;
      size = new TextEncoder().encode(key + encoded).byteLength;
    } catch { return; }
    if (size > maxBytes) return;
    for (const [id, entry] of entries) if (entry.expiresAt <= Date.now()) remove(id);
    while (entries.size >= maxEntries || bytes + size > maxBytes) remove(entries.keys().next().value!);
    entries.set(key, { value, expiresAt: Date.now() + ttlMs, bytes: size });
    bytes += size;
  }
  async function load<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const value = read<T>(key);
    if (value !== null) return value;
    const existing = pending.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    if (pending.size >= maxEntries) return loader();
    const request = Promise.resolve().then(loader).then(result => {
      // An invalidated in-flight read cannot resurrect old values or replace
      // newer data after a successful mutation.
      if (pending.get(key) === request) write(key, result, ttlMs);
      return result;
    }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
    pending.set(key, request);
    return request;
  }
  function clear(prefix?: string) {
    if (!prefix) { entries.clear(); pending.clear(); bytes = 0; return; }
    for (const key of entries.keys()) if (key.startsWith(prefix)) remove(key);
    for (const key of pending.keys()) if (key.startsWith(prefix)) pending.delete(key);
  }
  return { read, write, load, clear };
}
