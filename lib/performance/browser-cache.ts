"use client";
import { createBoundedCache } from "./bounded-cache";

const cache = createBoundedCache(64, 8 * 1024 * 1024);
export const readMemoryCache = cache.read;
export const writeMemoryCache = cache.write;
export const cachedRequest = cache.load;

export function readSessionCache<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: T };
    if (Date.now() - parsed.at > ttlMs) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeSessionCache<T>(key: string, data: T) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {}
}
