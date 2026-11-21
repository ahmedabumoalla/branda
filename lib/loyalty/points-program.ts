export const POINTS_CAFE_ID = "2e08901c-5aac-4bec-8c97-a135058e508b";

export type PointsMilestone = { points: number; reward: string };
export type PointsProgram = {
  mode: "stamps" | "points";
  rateSar: number;
  rateQuantity: number;
  milestones: PointsMilestone[];
};

export const defaultPointsProgram: PointsProgram = {
  mode: "stamps", rateSar: 1, rateQuantity: 1, milestones: [],
};

export function readPointsProgram(row: {
  points_mode?: unknown;
  points_rate_sar?: unknown;
  points_rate_quantity?: unknown;
  points_milestones?: unknown;
}): PointsProgram {
  return {
    mode: row.points_mode === "points" ? "points" : "stamps",
    rateSar: Number(row.points_rate_sar ?? 1),
    rateQuantity: Number(row.points_rate_quantity ?? 1),
    milestones: Array.isArray(row.points_milestones)
      ? row.points_milestones.map(({ points, reward }) => ({ points: Number(points), reward: String(reward) }))
      : [],
  };
}
