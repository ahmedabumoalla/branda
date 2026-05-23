import type { CafeThemeId } from "@/lib/mock/cafe-theme";
import { isValidCafeThemeId } from "@/lib/mock/cafe-theme";

/** يبني مسار صفحة كوفي مع الحفاظ على previewTheme */
export function getCafePath(
  slug: string,
  path = "",
  previewTheme?: string | null
) {
  const normalized = path.replace(/^\//, "");
  const base = normalized ? `/c/${slug}/${normalized}` : `/c/${slug}`;
  return withThemePreview(base, previewTheme);
}

/** يضيف أو يستبدل previewTheme في الرابط */
export function withThemePreview(href: string, previewTheme?: string | null) {
  if (!previewTheme || !isValidCafeThemeId(previewTheme)) return href;

  const [pathname, search = ""] = href.split("?");
  const params = new URLSearchParams(search);
  params.set("previewTheme", previewTheme);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** يقرأ previewTheme من searchParams أو window */
export function readPreviewThemeFromSearch(
  searchParams?: URLSearchParams | null
): CafeThemeId | null {
  const raw =
    searchParams?.get("previewTheme") ??
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("previewTheme")
      : null);
  if (raw && isValidCafeThemeId(raw)) return raw;
  return null;
}

/** يدمج previewTheme الحالي في مسار نسبي */
export function preservePreviewSearchParams(
  path: string,
  previewTheme?: string | null
) {
  return withThemePreview(path, previewTheme);
}

/** لاستخدامه مع router.push */
export function appendPreviewToNextPath(
  nextPath: string,
  previewTheme?: string | null
) {
  if (!previewTheme) return nextPath;
  const sep = nextPath.includes("?") ? "&" : "?";
  return `${nextPath}${sep}previewTheme=${encodeURIComponent(previewTheme)}`;
}
