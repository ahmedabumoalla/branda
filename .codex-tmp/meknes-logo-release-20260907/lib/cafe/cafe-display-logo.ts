export const DEFAULT_BARNDAKSA_CAFE_LOGO = "/brand/barndaksa-logo-brown.png";

export function normalizeCafeDisplayLogoCandidate(value?: string | null) {
  if (typeof value !== "string") return undefined;
  const next = value.trim();
  if (!next) return undefined;

  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(next)) {
    return next;
  }

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
    const normalized = normalizeCafeDisplayLogoCandidate(candidate);
    if (normalized) return normalized;
  }

  return DEFAULT_BARNDAKSA_CAFE_LOGO;
}

export function isDefaultBarndaksaCafeLogo(value?: string | null) {
  return value === DEFAULT_BARNDAKSA_CAFE_LOGO;
}
