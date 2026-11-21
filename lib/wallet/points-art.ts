import path from "node:path";
import sharp from "sharp";
import type { PointsMilestone } from "@/lib/loyalty/points-program";

const digits = new Intl.NumberFormat("ar-SA-u-nu-arab");
const fontFile = path.join(process.cwd(), "public/fonts/tajawal-bold.ttf");

function mix(from: string, to: string, ratio: number) {
  const channel = (index: number) => {
    const a = parseInt(from.slice(index, index + 2), 16), b = parseInt(to.slice(index, index + 2), 16);
    return Math.round(a + (b - a) * ratio).toString(16).padStart(2, "0");
  };
  return "#" + channel(1) + channel(3) + channel(5);
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Pango shapes Arabic using the bundled font even when the host has no Arabic fonts.
async function label(value: string, size: number, color: string, maxWidth: number, x: number, top: number) {
  const printable = value.replace(/\p{Cc}/gu, " ").trim() || "مكافأة";
  const escaped = printable.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const result = await sharp({ text: { text: `<span foreground="${color}">${escaped}</span>`, rgba: true,
    dpi: 72, font: `Tajawal Bold ${size * 3}`, fontfile: fontFile } }).png().toBuffer({ resolveWithObject: true });
  const width = Math.min(maxWidth, result.info.width / 3);
  const height = width * result.info.height / result.info.width;
  return `<image x="${x - width / 2}" y="${top}" width="${width}" height="${height}" xlink:href="data:image/png;base64,${result.data.toString("base64")}"/>`;
}

type Point = { x: number; y: number };
const fmt = (value: number) => value.toFixed(2);

// Interpolate around an irregular coastline. Smaller rings become elevation contours.
function coast(cx: number, cy: number, rx: number, ry: number, seed: number) {
  const points = Array.from({ length: 34 }, (_, i) => {
    const a = Math.PI * 2 * i / 34;
    const ridge = 1 + 0.11 * Math.sin(3 * a + seed) + 0.07 * Math.cos(5 * a - seed) + 0.045 * Math.sin(8 * a + seed);
    return { x: cx + rx * ridge * Math.cos(a), y: cy + ry * ridge * Math.sin(a) };
  });
  const mid = (a: Point, b: Point) => `${fmt((a.x + b.x) / 2)} ${fmt((a.y + b.y) / 2)}`;
  return "M" + mid(points.at(-1)!, points[0]) + points.map((p, i) =>
    `Q${fmt(p.x)} ${fmt(p.y)} ${mid(p, points[(i + 1) % points.length])}`).join("") + "Z";
}

function star(x: number, y: number, size: number) {
  const points = Array.from({ length: 10 }, (_, index) => {
    const a = index * Math.PI / 5 - Math.PI / 2, radius = index % 2 ? size * 0.48 : size;
    return `${fmt(x + Math.cos(a) * radius)},${fmt(y + Math.sin(a) * radius)}`;
  });
  return points.join(" ");
}

// Engraved ridgelines and pine groves give each reachable stop a landmark.
function landmarks(x: number, y: number, size: number, mirror: boolean, dark: boolean) {
  const ridge = dark ? "#a6b59b" : "#688575";
  const shade = dark ? "#31584f" : "#839e87";
  const light = dark ? "#d0d4ac" : "#f4edd1";
  return `<g transform="translate(${x} ${y}) scale(${mirror ? -size : size} ${size})" stroke-linejoin="round">
    <g transform="translate(21 -5)" stroke-width=".55" stroke="${shade}">
      <path d="m-5 2 8-12L9-1l6-7 10 15-14-4Z" fill="${ridge}"/>
      <path d="M3-10 3-4 9 1l-2-3ZM15-8l-2 7 3-2 5 7Z" fill="${light}" stroke="none"/>
      <path d="m-11 8 11-16 7 11 4-5 10 14Z" fill="${ridge}"/>
      <path d="m0-8-2 10 3-3 5 6Z" fill="${light}" stroke="none"/>
      <path d="m-7 7 4-6m-1 7 3-5m12 0 5 7m-3-3 2 3" stroke="${shade}" fill="none"/>
    </g>
    <g transform="translate(-33 -5)" fill="${shade}" stroke="${shade}" stroke-width=".55">
      <path d="m-8 1 3-6 3 6h-2l2 3h-6l2-3Z M0-2l3-7 3 7H4l3 4H0l2-4Z M6 3l3-6 3 6h-2l2 3H6l2-3Z"/>
      <path d="M-5 3v3M3 1v4m6 0v3" fill="none"/>
    </g></g>`;
}

export async function walletPointsSvg(milestones: PointsMilestone[], balance: number, paper: string, ink: string, accent: string, scale: number) {
  const next = milestones.findIndex(tier => tier.points > balance);
  const start = Math.max(0, Math.min(milestones.length - 3, (next < 0 ? milestones.length : next) - 1));
  const tiers = milestones.slice(start, start + 3);
  const dark = luminance(paper) < 0.37;
  const sea = dark ? mix(paper, "#11464e", 0.45) : mix(paper, "#bad8d3", 0.58);
  const land = dark ? "#36655e" : "#becab0";
  const peak = dark ? "#547666" : "#9cb49a";
  const shore = dark ? "#9bb598" : "#f6ebcd";
  const gold = mix("#ffcd72", accent, 0.22);
  const trail = dark ? "#ffe4a6" : "#855026";
  const washed = dark ? "#bcddd2" : "#325b58";
  const labelBg = dark ? mix(paper, "#153938", 0.33) : "#fcf7e9";
  const text = dark ? "#fff8e8" : "#1d342f";
  const smallText = dark ? "#d7e9dc" : "#38514a";
  const width = tiers.length > 2 ? 98 : 135;
  const stops = tiers.map((tier, i) => ({
    ...tier, x: tiers.length === 1 ? 187.5 : 375 - (i + 0.5) * 375 / tiers.length,
    y: tiers.length > 2 ? [46, 37, 52][i] : [43, 57][i], available: balance >= tier.points,
  }));
  const terrain = [
    [365, 144, 95, 22, 3.5], [9, -8, 65, 27, 1.3],
    ...stops.map((s, i) => [s.x, s.y - 1, tiers.length > 2 ? 48 : 67, 29 + (i % 2) * 4, 2 + (start + i) * 1.27]),
  ].map(([x, y, rx, ry, seed]) => {
    const rim = coast(x, y, rx, ry, seed);
    const rings = [0.78, 0.63, 0.48, 0.34, 0.21].map((r, i) => {
      const d = coast(x - (1 - r) * rx * 0.26, y - (1 - r) * 10, rx * r, ry * r, seed + (1 - r) * 0.5);
      return `<path d="${d}" fill="${i === 1 || i === 3 ? peak : "none"}" fill-opacity=".63" stroke="${peak}" stroke-width=".95"/>`;
    }).join("");
    return `<path d="${rim}" fill="none" stroke="${washed}" opacity=".17" stroke-width="12"/>
      <path d="${rim}" fill="none" stroke="${sea}" stroke-width="8"/>
      <path d="${rim}" transform="translate(0 2)" fill="${shore}" stroke="${shore}" stroke-width="2.8"/>
      <path d="${rim}" fill="${land}" stroke="${shore}" stroke-width="1.15"/>${rings}
      ${landmarks(x, y, Math.min(1.15, rx / 61), Math.round(seed) % 2 === 0, dark)}`;
  }).join("");
  let previous = { x: 381, y: 76, points: start ? milestones[start - 1].points : 0 };
  let route = "";
  for (const stop of stops) {
    const dx = previous.x - stop.x;
    // Sample the curve so a partial balance lights exactly its travelled length on all SVG renderers.
    const bend = previous.y < stop.y ? -20 : 29;
    const points = Array.from({ length: 49 }, (_, i) => {
      const t = i / 48, u = 1 - t;
      return { x: u ** 3 * previous.x + 3 * u ** 2 * t * (previous.x - dx * .43) + 3 * u * t ** 2 * (stop.x + dx * .44) + t ** 3 * stop.x,
        y: u ** 3 * previous.y + 3 * u ** 2 * t * (previous.y + bend) + 3 * u * t ** 2 * (stop.y - bend) + t ** 3 * stop.y };
    });
    const line = (ps: Point[]) => "M" + ps.map(p => `${fmt(p.x)} ${fmt(p.y)}`).join("L");
    const fraction = Math.max(0, Math.min(1, (balance - previous.points) / (stop.points - previous.points)));
    const distance = [0];
    for (let i = 1; i < points.length; i++) distance.push(distance[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    const target = fraction * distance.at(-1)!;
    const end = distance.findIndex(d => d >= target);
    const travelled = points.slice(0, Math.max(1, end));
    if (end > 0) {
      const lo = points[end - 1], hi = points[end], ratio = (target - distance[end - 1]) / (distance[end] - distance[end - 1]);
      travelled.push({ x: lo.x + (hi.x - lo.x) * ratio, y: lo.y + (hi.y - lo.y) * ratio });
    }
    route += `<path d="${line(points)}" fill="none" stroke="${sea}" stroke-opacity=".6" stroke-width="5"/>
      <path d="${line(points)}" fill="none" stroke="${washed}" stroke-width="1.85" stroke-dasharray="2 4.5"/>`;
    if (fraction > 0) route += `<path d="${line(travelled)}" fill="none" stroke="${trail}" stroke-width="3"/>`;
    if (fraction > 0 && fraction < 1) {
      const current = travelled.at(-1)!;
      route += `<circle cx="${current.x}" cy="${current.y}" r="4" fill="${trail}" stroke="${sea}" stroke-width="1.6"/>`;
    }
    previous = stop;
  }
  const stations = await Promise.all(stops.map(async (s, index) => {
    const upcoming = next === start + index;
    const name = Array.from(s.reward).length > 23 ? Array.from(s.reward).slice(0, 22).join("") + "…" : s.reward;
    const status = s.available ? "متاحة" : upcoming ? `باقي ${digits.format(s.points - balance)}` : "";
    const detail = `${digits.format(s.points)} نقطة${status ? " · " + status : ""}`;
    const plateTop = s.y + 22;
    const [nameImage, detailImage] = await Promise.all([
      label(name, 17, text, width - 14, s.x, plateTop + 5),
      label(detail, 12, smallText, width - 10, s.x, plateTop + 26),
    ]);
    const fill = s.available ? gold : labelBg;
    return `<g><path d="M${s.x} ${s.y + 11}v11" stroke="${shore}" stroke-width="1.4"/>
      <rect x="${s.x - width / 2}" y="${plateTop}" width="${width}" height="42" rx="7" fill="${labelBg}" stroke="${s.available ? trail : washed}" stroke-opacity="${s.available ? .68 : .32}" stroke-width=".9"/>
      ${nameImage}${detailImage}
      <circle cx="${s.x}" cy="${s.y + 1}" r="19.5" fill="${s.available ? gold : sea}" fill-opacity="${s.available ? .22 : .6}"/>
      <polygon points="${star(s.x, s.y + 2, 16)}" fill="${sea}" opacity=".8"/>
      <polygon points="${star(s.x, s.y, 16)}" stroke-linejoin="round" fill="${fill}" stroke="${s.available ? "#fff0c9" : washed}" stroke-width="1.8"/>
      ${s.available ? `<path d="m${s.x-5} ${s.y} 3.1 3.2 6.4-6.1" fill="none" stroke="#5b4227" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
      </g>`;
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${375 * scale}" height="${144 * scale}" viewBox="0 0 375 144">
    <defs><pattern id="grid" width="36" height="30" patternUnits="userSpaceOnUse"><path d="M36 0H0V30" fill="none" stroke="${ink}" stroke-opacity=".06" stroke-width=".65"/><path d="M6 15q2-1.5 4 0t4 0t4 0m-6 2.4q2-1.2 4 0" fill="none" stroke="${washed}" stroke-opacity=".23" stroke-width=".65"/></pattern></defs>
    <rect width="375" height="144" fill="${sea}"/><rect width="375" height="144" fill="url(#grid)"/>${terrain}
    <g stroke-linecap="round">${route}</g>${stations.join("")}
    <g transform="translate(18 124)" fill="none" stroke="${washed}" stroke-width=".75" opacity=".85"><circle r="7.5"/><path d="M0-11 2.6 0 0 10-2.6 0Z"/><path d="M0-11 2.6 0 0-1Z" fill="${washed}"/><path d="M-11 0h6m10 0h6"/></g>
    </svg>`;
}
