import { createBoundedCache } from './bounded-cache';

// Public projections only; private authority checks stay outside this cache.
const cache = createBoundedCache(256, 32 * 1024 * 1024);
export const readServerMemoryCache = cache.read;
export const writeServerMemoryCache = cache.write;
export const cachedServerValue = cache.load;
export const clearServerMemoryCache = cache.clear;
