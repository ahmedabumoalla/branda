import type { LoyaltyLanguage } from "@/lib/loyalty/customer-language";
import type { PointsMilestone } from "@/lib/loyalty/points-program";
import { nextPointsReward, rewardGlyphPaths } from "@/lib/loyalty/reward-path";
import s from "./points-reward-path.module.css";

export function PointsRewardPath({ balance, milestones, language = "ar" }: { language?: LoyaltyLanguage; balance: number; milestones: PointsMilestone[] }) {
  const en = language === "en";
  const next = nextPointsReward(milestones, balance);
  return <section className={s.path} lang={language} dir={en ? "ltr" : "rtl"} aria-label={en ? "Points balance and rewards" : "رصيد النقاط ومسار المكافآت"}>
    <div className={s.balance}><span>{en ? "Points balance" : "رصيد النقاط"}</span><strong><bdi>{balance}</bdi> <small>{en ? "points" : "نقطة"}</small></strong></div>
    {milestones.length > 0 && <ol aria-label={en ? "Rewards" : "مسار المكافآت"}>
      {milestones.map(tier => {
        const affordable = tier.points <= balance;
        return <li key={tier.points} data-affordable={affordable} aria-current={tier === next ? "step" : undefined}>
          <span className={s.icon} aria-hidden="true">{rewardGlyphPaths(tier.reward).map(d =>
            <svg key={d} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>)}</span>
          <span className={s.station}><strong>{tier.reward}</strong><small>{tier.points} {en ? "points" : "نقطة"}</small></span>
          <span className={s.state}>{affordable ? (en ? "Ready to redeem" : "متاحة للاستبدال") : tier === next ? (en ? `${tier.points - balance} points to go` : `باقي ${tier.points - balance} نقطة`) : en ? "Upcoming" : "لاحقًا"}</span>
        </li>;
      })}
    </ol>}
  </section>;
}
