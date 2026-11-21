import path from "node:path";
import sharp from "sharp";
import type { PointsMilestone } from "@/lib/loyalty/points-program";

const digits = new Intl.NumberFormat("ar-SA-u-nu-arab");
const fontFile = path.join(process.cwd(), "public/fonts/tajawal-bold.ttf");

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => {
    const n = parseInt(hex.slice(i, i + 2), 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return .2126 * r + .7152 * g + .0722 * b;
}

// Keep Arabic shaping and the brand font independent of the server's installed fonts.
async function label(value: string, size: number, color: string, maxWidth: number, x: number, top: number) {
  const printable = value.replace(/\p{Cc}/gu, " ").trim() || "مكافأة";
  const escaped = printable.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const result = await sharp({ text: { text: `<span foreground="${color}">${escaped}</span>`, rgba: true,
    dpi: 72, font: `Tajawal Bold ${size * 3}`, fontfile: fontFile } }).png().toBuffer({ resolveWithObject: true });
  const width = Math.min(maxWidth, result.info.width / 3);
  const height = width * result.info.height / result.info.width;
  return `<image x="${x - width / 2}" y="${top}" width="${width}" height="${height}" xlink:href="data:image/png;base64,${result.data.toString("base64")}"/>`;
}

function star(x: number, y: number, radius: number) {
  return Array.from({ length: 10 }, (_, i) => {
    const angle = i * Math.PI / 5 - Math.PI / 2;
    const length = i % 2 ? radius * .52 : radius;
    return `${(x + Math.cos(angle) * length).toFixed(2)},${(y + Math.sin(angle) * length).toFixed(2)}`;
  }).join(" ");
}

export async function walletPointsSvg(milestones: PointsMilestone[], balance: number, surface: string, foreground: string, accent: string, scale: number) {
  const next = milestones.findIndex(tier => tier.points > balance);
  const start = Math.max(0, Math.min(milestones.length - 3, (next < 0 ? milestones.length : next) - 1));
  const visible = milestones.slice(start, start + 3);
  const cellWidth = 350 / Math.max(visible.length, 1);
  const surfaceLight = luminance(surface);
  const contrast = (candidate: string) => {
    const candidateLight = luminance(candidate);
    return (Math.max(surfaceLight, candidateLight) + .05) / (Math.min(surfaceLight, candidateLight) + .05);
  };
  const ink = contrast(foreground) >= 4.5 ? foreground : surfaceLight > .18 ? "#101418" : "#ffffff";
  const highlight = contrast(accent) >= 3 ? accent : ink;
  const trackY = 36;
  const origin = 360;
  let lastX = origin;
  let lastPrice = start ? milestones[start - 1].points : 0;
  let track = "";
  const stops = [];
  for (const [index, tier] of visible.entries()) {
    const x = 362.5 - cellWidth * (index + .5);
    const reached = balance >= tier.points;
    const upcoming = start + index === next;
    const right = lastX - (index ? 24 : 7);
    const left = x + 24;
    const fraction = Math.min(1, Math.max(0, (balance - lastPrice) / (tier.points - lastPrice)));
    const at = right + (left - right) * fraction;
    if (right > left) {
      track += `<path d="M${right} ${trackY}H${left}" stroke="${ink}" stroke-opacity=".55" stroke-width="1.4"/>`;
      if (fraction > 0) track += `<path d="M${right} ${trackY}H${at}" stroke="${highlight}" stroke-width="3"/>`;
      if (fraction > 0 && fraction < 1) track += `<circle cx="${at}" cy="${trackY}" r="3.4" fill="${highlight}"/>`;
    }
    const name = Array.from(tier.reward).length > 23 ? Array.from(tier.reward).slice(0, 22).join("") + "…" : tier.reward;
    const state = reached ? "متاحة للاستبدال" : upcoming ? `باقي ${digits.format(tier.points - balance)} نقطة` : "";
    stops.push(async () => {
      const [reward, price, status] = await Promise.all([
        label(name, 19, ink, cellWidth - 10, x, 63),
        label(`${digits.format(tier.points)} نقطة`, 14, ink, cellWidth - 12, x, 91),
        state ? label(state, 12, reached && contrast(highlight) >= 4.5 ? highlight : ink, cellWidth - 10, x, 114) : "",
      ]);
      return `<polygon points="${star(x, trackY, 18)}" fill="${reached ? highlight : "none"}" stroke="${reached ? highlight : ink}" stroke-width="${reached ? 1.3 : 1.9}" stroke-linejoin="round"/>
        ${reached ? `<path d="m${x - 5} ${trackY} 3.2 3 6.5-6.5" fill="none" stroke="${surface}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
        ${reward}${price}${status}`;
    });
    lastPrice = tier.points;
    lastX = x;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${375 * scale}" height="${144 * scale}" viewBox="0 0 375 144">
    <g stroke-linecap="round" fill="none">${track}</g><circle cx="${origin}" cy="${trackY}" r="2.7" fill="${highlight}"/>${(await Promise.all(stops.map(draw => draw()))).join("")}</svg>`;
}
