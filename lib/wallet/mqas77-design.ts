import type { WalletMember } from "./types";

export const MQAS77_WALLET_SLUG = "brand-edbc2c01385b";
export const MQAS77_WALLET_VERSION = "mqas77-clean-20261114-v2";
export const MQAS77_WALLET_NAME = "BARBER SHOP 77";
export const MQAS77_WALLET_COLORS = { background: "#080808", foreground: "#f6dca6", accent: "#d8a34f" };
export const isMqas77Wallet = (slug: string) => slug === MQAS77_WALLET_SLUG;

/** Decoration only. Balances and each customer's signed QR stay native Wallet fields. */
export function mqas77StampSvg(member: WalletMember, emblem: string, scale: 1 | 2 | 3, apple: boolean) {
  const required = Math.max(1, Math.min(100, Math.trunc(member.program.purchasesRequired) || 1));
  const earned = Math.max(0, Math.min(required, Math.trunc(member.card.stampsInCycle) || 0));
  const height = apple ? 144 : 375 * 812 / 1032;
  const widthPx = apple ? 375 * scale : 516 * scale;
  const heightPx = apple ? 144 * scale : 406 * scale;
  const columns = Math.min(required, 5), rows = Math.ceil(required / columns);
  const size = Math.min(apple ? 48 : 64, ((apple ? 52 : 82) - (rows - 1) * 7) / rows);
  const gap = apple ? 15 : 12;
  const top = apple ? 84 : 195;
  const logoSize = apple ? 64 : 140;
  const logoTop = apple ? 8 : 24;
  const image = (x: number, y: number, side: number, opacity = 1) => `<image x="${x}" y="${y}" width="${side}" height="${side}" href="${emblem}" opacity="${opacity}"/>`;
  const tiles = Array.from({ length: required }, (_, index) => {
    const row = Math.floor(index / columns), count = Math.min(columns, required - row * columns);
    const rowWidth = count * size + (count - 1) * gap;
    const x = (375 + rowWidth) / 2 - size - (index % columns) * (size + gap), y = top + row * (size + 7);
    const filled = index < earned;
    return `<g data-stamp="${index + 1}" data-earned="${filled}">
      ${filled ? `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * .23}" fill="none" stroke="#ffb438" stroke-width="2.3" filter="url(#glow)"/>` : ""}
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * .23}" fill="url(#tile)" stroke="url(#${filled ? "gold" : "quietGold"})" stroke-width="${filled ? 1.6 : 1}"/>
      ${image(x + size * .16, y + size * .12, size * .68, filled ? 1 : .48)}
      ${filled ? `<path d="m${x + size - 11} ${y + 8} 2 2 4-4" stroke="#fff0c9" fill="none" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
    </g>`;
  }).join("");
  const starY = apple ? 75 : 178;
  const star = (x: number, size: number) => `<path d="M0,-5 1.5,-1.5 5,-1.5 2.3,1 3.2,4.7 0,2.5 -3.2,4.7 -2.3,1 -5,-1.5 -1.5,-1.5Z" transform="translate(${x} ${starY}) scale(${size})" fill="url(#gold)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 375 ${height}">
    <defs>
      <linearGradient id="gold" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#81501f"/><stop offset=".22" stop-color="#f4ba56"/><stop offset=".38" stop-color="#fff6d8"/><stop offset=".48" stop-color="#c4802d"/><stop offset=".72" stop-color="#f5cf81"/><stop offset="1" stop-color="#a15d21"/></linearGradient>
      <linearGradient id="quietGold" x2=".7" y2="1"><stop stop-color="#b58c55"/><stop offset=".4" stop-color="#e0c8a2"/><stop offset=".65" stop-color="#684b2d"/><stop offset="1" stop-color="#af8250"/></linearGradient>
      <linearGradient id="tile" x2="1" y2="1"><stop stop-color="#17130e"/><stop offset=".5" stop-color="#080808"/><stop offset="1" stop-color="#191209"/></linearGradient>
      <radialGradient id="light"><stop stop-color="#302111"/><stop offset="1" stop-color="#080808"/></radialGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
    </defs>
    <rect width="375" height="${height}" fill="#080808"/>
    <ellipse cx="187.5" cy="${logoTop + logoSize * .6}" rx="116" ry="${logoSize * .7}" fill="url(#light)"/>
    ${image((375 - logoSize) / 2, logoTop, logoSize)}
    <path d="M115,${starY}H165M210,${starY}H260" stroke="url(#gold)" stroke-width=".7"/>
    ${star(174, .45)}${star(187.5, .7)}${star(201, .45)}
    ${tiles}
  </svg>`;
}
