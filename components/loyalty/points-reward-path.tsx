import type { PointsMilestone } from "@/lib/loyalty/points-program";
import { nextPointsReward, rewardGlyphPaths } from "@/lib/loyalty/reward-path";
import s from "./points-reward-path.module.css";

export function PointsRewardPath({ balance, milestones }: { balance: number; milestones: PointsMilestone[] }) {
  const next = nextPointsReward(milestones, balance);
  return <section className={s.path} dir="rtl" aria-label="رصيد النقاط ومسار المكافآت">
    <div className={s.balance}><span>رصيد النقاط</span><strong><bdi>{balance}</bdi> <small>نقطة</small></strong></div>
    {milestones.length > 0 && <ol aria-label="مسار المكافآت">
      {milestones.map(tier => {
        const affordable = tier.points <= balance;
        return <li key={tier.points} data-affordable={affordable} aria-current={tier === next ? "step" : undefined}>
          <span className={s.icon} aria-hidden="true">{rewardGlyphPaths(tier.reward).map(d =>
            <svg key={d} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>)}</span>
          <span className={s.station}><strong>{tier.reward}</strong><small>{tier.points} نقطة</small></span>
          <span className={s.state}>{affordable ? "متاحة للاستبدال" : tier === next ? `باقي ${tier.points - balance} نقطة` : "لاحقًا"}</span>
        </li>;
      })}
    </ol>}
  </section>;
}
