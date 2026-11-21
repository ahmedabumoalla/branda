import type { PointsMilestone } from "./points-program";
import { stampPaths } from "./stamp-style";

export function nextPointsReward(milestones: PointsMilestone[], balance: number) {
  return milestones.find(tier => tier.points > balance);
}

export function pointsProgressText(milestones: PointsMilestone[], balance: number) {
  const next = nextPointsReward(milestones, balance);
  return next ? `باقي ${next.points - balance} نقطة على ${next.reward}` : "رصيدك يكفي لاختيار أي مكافأة من المسار";
}

export function describePointsRewards(milestones: PointsMilestone[], balance: number) {
  return milestones.map(tier => {
    const availability = balance >= tier.points ? "متاحة للاستبدال" : `باقي ${tier.points - balance} نقطة`;
    return `${tier.reward} · ${tier.points} نقطة · ${availability}`;
  }).join("\n");
}

const cake = "M4 12l12-7 4 6v9H4v-8Zm0 0h16M4 16c2 2 3-2 5 0s3-2 5 0 4-2 6 0";
const gift = "M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8S5 9 5 5c0-4 6-3 7 3Zm0 0s7 1 7-3c0-4-6-3-7 3Z";

// Use a neutral reward parcel for names without an identifiable coffee or dessert.
export function rewardGlyphPaths(name: string) {
  const drink = /قهوة|قهوه|كوب|مشروب|كوفي|coffee|latte|espresso/i.test(name);
  const dessert = /حلا|حلى|كيك|كرواسون|حلوى|cake|dessert|pastry/i.test(name);
  if (drink && dessert) return [stampPaths.ceramic, cake];
  return [drink ? stampPaths.ceramic : dessert ? cake : gift];
}
