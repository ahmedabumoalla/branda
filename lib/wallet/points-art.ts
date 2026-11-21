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

type Point = { x: number; y: number };
function between(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// Split the same cubic for every balance, so the illuminated stroke and its tip
// stay exactly on the underlying route, including inside the bend.
function trackSection(from: Point, to: Point, progress: number) {
  const span = from.x - to.x;
  const c1 = { x: from.x - span * .62, y: from.y };
  const c2 = { x: to.x + span * .62, y: to.y };
  const coord = (p: Point) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  const curve = (a: Point, b: Point, end: Point) => `M${coord(from)}C${coord(a)} ${coord(b)} ${coord(end)}`;
  const first = between(from, c1, progress);
  const middle = between(c1, c2, progress);
  const last = between(c2, to, progress);
  const second = between(first, middle, progress);
  const tip = between(second, between(middle, last, progress), progress);
  return { base: curve(c1, c2, to), lit: curve(first, second, tip), tip };
}

export async function walletPointsSvg(milestones: PointsMilestone[], balance: number, surface: string, foreground: string, accent: string, scale: number) {
  const next = milestones.findIndex(tier => tier.points > balance);
  // A reward always occupies the same slot. Longer programs turn pages of three
  // after the final reward on the current page becomes available.
  const active = next < 0 ? Math.max(0, milestones.length - 1) : next;
  const start = Math.floor(active / 3) * 3;
  const visible = milestones.slice(start, start + 3);
  const cellWidth = 350 / Math.max(1, Math.min(3, milestones.length));
  const surfaceLight = luminance(surface);
  const contrast = (candidate: string) => {
    const candidateLight = luminance(candidate);
    return (Math.max(surfaceLight, candidateLight) + .05) / (Math.min(surfaceLight, candidateLight) + .05);
  };
  const ink = contrast(foreground) >= 4.5 ? foreground : surfaceLight > .18 ? "#101418" : "#ffffff";
  const highlight = contrast(accent) >= 3 ? accent : ink;
  const origin = { x: 360, y: 64 };
  let previous = origin;
  let lastPrice = start ? milestones[start - 1].points : 0;
  let track = "";
  const stops = [];
  for (const [index, tier] of visible.entries()) {
    const x = 362.5 - cellWidth * (index + .5);
    const y = index % 2 ? 60 : 24;
    const reached = balance >= tier.points;
    const upcoming = start + index === next;
    const fraction = Math.min(1, Math.max(0, (balance - lastPrice) / (tier.points - lastPrice)));
    const route = trackSection({ x: previous.x - (index ? 19 : 5), y: previous.y }, { x: x + 19, y }, fraction);
    track += `<path d="${route.base}" stroke="${ink}" stroke-opacity=".63" stroke-width="1.9" stroke-dasharray="2.4 4.2"/>`;
    if (fraction > 0) track += `<path d="${route.lit}" stroke="${highlight}" stroke-width="3"/>`;
    if (fraction > 0 && fraction < 1) track += `<circle cx="${route.tip.x}" cy="${route.tip.y}" r="3.3" fill="${highlight}"/>`;
    const name = Array.from(tier.reward).length > 23 ? Array.from(tier.reward).slice(0, 22).join("") + "…" : tier.reward;
    const state = reached ? "متاحة للاستبدال" : upcoming ? `باقي ${digits.format(tier.points - balance)} نقطة` : "";
    stops.push(async () => {
      const [reward, price, status] = await Promise.all([
        label(name, 18, ink, cellWidth - 14, x, y + 24),
        label(`${digits.format(tier.points)} نقطة`, 14, ink, cellWidth - 14, x, y + 47),
        state ? label(state, 12, reached && contrast(highlight) >= 4.5 ? highlight : ink, cellWidth - 14, x, y + 66) : "",
      ]);
      return `<polygon points="${star(x, y, 17)}" fill="${reached ? highlight : "none"}" stroke="${reached ? highlight : ink}" stroke-width="${reached ? 1.3 : 1.9}" stroke-linejoin="round"/>
        ${reached ? `<path d="m${x - 5} ${y} 3.2 3 6.5-6.5" fill="none" stroke="${surface}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
        ${reward}${price}${status}`;
    });
    lastPrice = tier.points;
    previous = { x, y };
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${375 * scale}" height="${144 * scale}" viewBox="0 0 375 144">
    <g stroke-linecap="round" fill="none">${track}</g><circle cx="${origin.x}" cy="${origin.y}" r="3" fill="${highlight}"/>${(await Promise.all(stops.map(draw => draw()))).join("")}</svg>`;
}
