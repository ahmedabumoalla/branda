export const DEFAULT_BARNDAKSA_CAFE_LOGO = "/brand/barndaksa-logo-brown.png";

function normalizeLogoCandidate(value?: string | null) {
  if (typeof value !== "string") return undefined;
  const next = value.trim();
  if (!next || next.startsWith("data:")) return undefined;

  if (
    next.startsWith("/") ||
    next.startsWith("blob:") ||
    /^https?:///i.test(next)
  ) {
    return next;
  }

  return undefined;
}

export function getPreferredCafeDisplayLogoUrl(
  ...candidates: Array<string | null | undefined>
) {
  for (const candidate of candidates) {
    const normalized = normalizeLogoCandidate(candidate);
    if (normalized) return normalized;
  }

  return DEFAULT_BARNDAKSA_CAFE_LOGO;
}
