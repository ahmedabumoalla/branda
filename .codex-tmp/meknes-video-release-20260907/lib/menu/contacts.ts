import type { StandaloneMenu } from "./standalone-menu";

/** Verified from the brand's original menu on 2026-09-06 */
export function menuContacts(cafeId: string, instagram?: string | null): StandaloneMenu["contacts"] {
  const handle = instagram?.trim().replace(/^https:\/\/(?:www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/$/, "");
  return {
    feedbackEnabled: false,
    instagramUrl: handle && /^[a-zA-Z0-9._]{1,30}$/.test(handle) ? `https://www.instagram.com/${handle}/` : null,
    location: cafeId === "bb404c1a-a439-41ab-aed8-ea0c17875bd9" ? {
      label: "دبل بي بيسترو في خميس مشيط",
      googleUrl: "https://maps.app.goo.gl/yFDxC5GhmvgZdX9v9",
      appleUrl: "https://maps.apple.com/?daddr=18.2791535,42.6921294&dirflg=d",
    } : null,
  };
}
