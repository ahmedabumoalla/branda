import type { PointsMilestone } from "@/lib/loyalty/points-program";
import { rewardGlyphPaths } from "@/lib/loyalty/reward-path";

/** The strip depicts the milestones around the next reward. Native fields carry their names and values. */
export function walletPointsSvg(milestones: PointsMilestone[], balance: number, paper: string, ink: string, accent: string, scale: number) {
  const next = milestones.findIndex(tier => tier.points > balance);
  const start = Math.max(0, Math.min(milestones.length - 4, (next < 0 ? milestones.length : next) - 1));
  const visible = milestones.slice(start, start + 4);
  let route = "";
  let stations = "";
  let lastX = 355;
  let lastY = 93;
  let lastPoints = start ? milestones[start - 1].points : 0;

  visible.forEach((tier, index) => {
    const x = visible.length === 1 ? 157 : 289 - index * 248 / (visible.length - 1);
    const y = index % 2 ? 89 : 56;
    const middle = (x + lastX) / 2;
    const curve = `M${lastX} ${lastY}C${middle} ${lastY} ${middle} ${y} ${x} ${y}`;
    const fraction = Math.min(1, Math.max(0, (balance - lastPoints) / (tier.points - lastPoints)));
    route += `<path d="${curve}" stroke="${ink}" stroke-opacity=".35" stroke-width="2" stroke-dasharray="2 5"/>`;
    if (fraction > 0) route += `<path d="${curve}" pathLength="100" stroke="${ink}" stroke-width="3" stroke-dasharray="${fraction * 100} 101"/>`;
    const affordable = balance >= tier.points;
    const upcoming = next === start + index;
    const glyphs = rewardGlyphPaths(tier.reward);
    const glyph = glyphs.map((path, i) => {
      const size = glyphs.length === 1 ? 27 : 19;
      const left = glyphs.length === 1 ? -size / 2 : i === 0 ? 0 : -size;
      return `<path transform="translate(${left} ${-size / 2}) scale(${size / 24})" d="${path}"/>`;
    }).join("");
    const color = affordable ? paper : ink;
    stations += `<g transform="translate(${x} ${y})">
      ${upcoming ? `<circle r="29" fill="none" stroke="${ink}" stroke-width="1.5" stroke-dasharray="3 4"/>` : ""}
      <circle r="23" fill="${affordable ? ink : paper}" stroke="${ink}" stroke-opacity="${upcoming || affordable ? 1 : .55}" stroke-width="1.6"/>
      <g fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" opacity="${affordable || upcoming ? 1 : .65}">${glyph}</g>
      ${affordable ? `<g transform="translate(17 -17)"><circle r="8" fill="${paper}" stroke="${ink}" stroke-width="1.7"/><path d="m-3.6 0 2.4 2.3 4.7-4.7" stroke="${ink}" stroke-width="1.8" fill="none"/></g>` : ""}
    </g>`;
    lastX = x; lastY = y; lastPoints = tier.points;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${375 * scale}" height="${144 * scale}" viewBox="0 0 375 144"><rect width="375" height="144" fill="${paper}"/><circle cx="355" cy="93" r="5" fill="${accent}" stroke="${ink}" stroke-width="1.5"/><g fill="none" stroke-linecap="round">${route}</g>${stations}</svg>`;
}
