type ServerCacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const valueCache = new Map<string, ServerCacheEntry<unknown>>();
const pendingCache = new Map<string, Promise<unknown>>();

export function readServerMemoryCache<T>(key: string): T | null {
  const entry = valueCache.get(key) as ServerCacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    valueCache.delete(key);
    return null;
  }
  return entry.value;
}

export function writeServerMemoryCache<T>(key: string, value: T, ttlMs: number) {
  valueCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export async function cachedServerValue<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = readServerMemoryCache<T>(key);
  if (cached !== null) return cached;

  const pending = pendingCache.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const request = loader()
    .then((value) => {
      writeServerMemoryCache(key, value, ttlMs);
      return value;
    })
    .finally(() => {
      pendingCache.delete(key);
    });

  pendingCache.set(key, request);
  return request;
}

export function clearServerMemoryCache(prefix?: string) {
  if (!prefix) {
    valueCache.clear();
    pendingCache.clear();
    return;
  }

  for (const key of Array.from(valueCache.keys())) {
    if (key.startsWith(prefix)) valueCache.delete(key);
  }
  for (const key of Array.from(pendingCache.keys())) {
    if (key.startsWith(prefix)) pendingCache.delete(key);
  }
}
