export const PUBLIC_CAFE_CACHE_SECONDS = 300;
export const PUBLIC_MENU_CACHE_SECONDS = 300;
export const PUBLIC_STORAGE_CACHE_SECONDS = 60 * 60 * 24 * 7;
export const PRIVATE_SHORT_CACHE_SECONDS = 30;

export function publicCacheHeader(seconds = PUBLIC_CAFE_CACHE_SECONDS) {
  return `public, max-age=30, s-maxage=${seconds}, stale-while-revalidate=${seconds * 6}`;
}

export function immutableAssetCacheHeader(seconds = PUBLIC_STORAGE_CACHE_SECONDS) {
  return `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=${seconds * 4}`;
}
