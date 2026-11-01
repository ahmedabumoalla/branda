import { togetherResponsiveImage } from "@/lib/menu/together-images";

// Browser-local decoded images only. Bound memory to the current and nearby gallery photos.
// Never persist signed capabilities, share them between users, or preload the full catalog.
const decoded = new Map<string, { image: HTMLImageElement; expiresAt: number }>();
const MAX_IMAGES = 4;
const LIFETIME_MS = 5 * 60_000;
function remember(key: string, image: HTMLImageElement) {
  const now = Date.now();
  for (const [stored, value] of decoded) if (value.expiresAt <= now) decoded.delete(stored);
  decoded.delete(key);
  decoded.set(key, { image, expiresAt: now + LIFETIME_MS });
  while (decoded.size > MAX_IMAGES) decoded.delete(decoded.keys().next().value!);
}
export function rememberStorePhoto(src: string, sizes: string, image: HTMLImageElement) {
  if (typeof window === "undefined" || !togetherResponsiveImage(src, sizes)) return;
  remember(`${src}\n${sizes}`, image);
}
export function warmStorePhoto(src: string | undefined, sizes: string) {
  if (!src || typeof window === "undefined") return;
  const responsive = togetherResponsiveImage(src, sizes);
  if (!responsive) return;
  const key = `${src}\n${sizes}`;
  const cached = decoded.get(key);
  if (cached && cached.expiresAt > Date.now()) return;
  const image = new Image();
  image.decoding = "async";
  image.fetchPriority = "low";
  image.onerror = () => { if (decoded.get(key)?.image === image) decoded.delete(key); };
  image.onload = () => { void image.decode?.().catch(() => {}); };
  remember(key, image);
  image.sizes = responsive.sizes;
  image.srcset = responsive.srcSet;
  image.src = responsive.src;
}
