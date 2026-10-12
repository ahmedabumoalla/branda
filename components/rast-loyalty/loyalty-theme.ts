import type { CSSProperties } from "react";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";

function hex(value: string | undefined, fallback: string) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function luminance(color: string) {
  const channels = [1, 3, 5].map((index) => {
    const value = parseInt(color.slice(index, index + 2), 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

function contrast(left: string, right: string) {
  const values = [luminance(left), luminance(right)].sort((a, b) => a - b);
  return (values[1] + .05) / (values[0] + .05);
}

function readableInk(color: string) {
  let channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
  let ink = color;
  while (luminance(ink) > .13) {
    channels = channels.map((value) => Math.floor(value * .85));
    ink = `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }
  return ink;
}

export function loyaltyCommunityName(identity: LoyaltyIdentity) {
  return `أهل ${identity.name}`;
}

/** The approved Kawakib palette stays unchanged; other brands retain their card identity. */
export function loyaltyTheme(identity: LoyaltyIdentity): CSSProperties | undefined {
  if (identity.slug === "rast") return undefined;
  const background = hex(identity.cardBackground, "#263e35");
  const requestedForeground = hex(identity.cardForeground, "#ffffff");
  const foreground = contrast(background, requestedForeground) >= 4.5
    ? requestedForeground
    : contrast(background, "#ffffff") >= 4.5 ? "#ffffff" : "#000000";
  const ink = readableInk(background);
  const accent = hex(identity.cardAccent, ink);
  return {
    "--cream": "#f7f7f4", "--white": "#ffffff", "--wine": ink,
    "--red": readableInk(accent), "--blush": "#eeeee8", "--muted": "#62615d", "--border": "#deded8",
    "--card-background": background, "--card-foreground": foreground, "--card-muted": foreground,
    "--card-logo-filter": luminance(foreground) > .5 ? "brightness(0) invert(1)" : "brightness(0)",
    "--card-stamp-background": foreground, "--card-stamp-foreground": background,
    "--card-check": contrast(accent, "#ffffff") >= 4.5 ? accent : ink,
    "--cashier-ink": ink, "--cashier-paper": "#f7f7f4", "--cashier-button-text": "#ffffff",
  } as CSSProperties;
}
