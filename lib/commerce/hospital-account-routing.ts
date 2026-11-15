/** Exact live financial-portal routes, independent of the archived storefront. */
export const hospitalAccountRouteHeader = "x-barndaksa-hospital-account";
export const hospitalAccountPath = "/c/mind-hospital/hospital-account";
export const hospitalAccountLoginPath = `${hospitalAccountPath}/login`;

/** A stable query bypasses the formerly cached permanent storefront redirect. */
export function hospitalAccountEntryHref(slug = "mind-hospital") {
  return `/c/${encodeURIComponent(slug)}/hospital-account?portal=1`;
}

export function isHospitalAccountRoute(pathname: string) {
  return [hospitalAccountPath, hospitalAccountLoginPath].some(path => pathname === path || pathname === `${path}/`);
}

export function isLegacyHospitalAccountLogin(pathname: string, next: string | null) {
  return (pathname === "/c/mind-hospital/login" || pathname === "/c/mind-hospital/login/")
    && (next === hospitalAccountPath || next === `${hospitalAccountPath}/` || next === hospitalAccountEntryHref());
}
