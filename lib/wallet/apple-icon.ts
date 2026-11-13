import "server-only";
import sharp from "sharp";

// Current Wallet HIG specifies 38pt square icons, including Lock Screen banners.
export const APPLE_ICON_SIZE = 38;
export const APPLE_ICON_VERSION = "2026-11-13-brand-icon-38pt-v1";

function luminance(red: number, green: number, blue: number) {
  const linear = [red, green, blue].map(value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

/** Keep the original mark's colors legible on an opaque brand-colored tile. */
export async function appleIconBackground(asset: Buffer, background: string, foreground: string) {
  const { data } = await sharp(asset, { limitInputPixels: 16_000_000 }).resize(64, 64, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let weightedLight = 0, weight = 0;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    weightedLight += luminance(data[index], data[index + 1], data[index + 2]) * alpha;
    weight += alpha;
  }
  if (!weight) return background;
  const markLight = weightedLight / weight;
  const contrast = (hex: string) => { const light = luminance(parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)); return (Math.max(markLight,light)+0.05)/(Math.min(markLight,light)+0.05); };
  return contrast(background) >= contrast(foreground) ? background : foreground;
}
