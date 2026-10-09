"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Clock3, Gift, RefreshCw, Wallet } from "lucide-react";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import type { CustomerLoyaltyCardView } from "@/lib/data/loyalty-cards";
import type { CustomerRewardInstance } from "@/lib/data/customer-rewards";
import { RastHeader } from "./rast-brand";
import { RastStampCard } from "./rast-stamp-card";
import { RastQrCode } from "./qr-code";
import s from "./rast-loyalty.module.css";

export type RastWalletAvailability = { apple: boolean; google: boolean };
export type RastMembership = CustomerLoyaltyCardView & { rewards: CustomerRewardInstance[] };

function rewardExpiry(value: string | null) {
  if (!value) return "بدون تاريخ انتهاء محدد";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "راجع الكاشير لمعرفة الصلاحية";
  return `صالحة حتى ${new Intl.DateTimeFormat("ar-SA", { calendar: "gregory", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(date)}`;
}

function RewardDetailsCopy({ reward }: { reward: CustomerRewardInstance }) {
  const raw = reward.metadata?.termsSnapshot;
  const snapshot = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const discount = snapshot.rewardKind === "discount" && typeof snapshot.discountPercent === "number" ? snapshot.discountPercent : null;
  const productName = snapshot.rewardKind === "product" && typeof snapshot.rewardProductName === "string" ? snapshot.rewardProductName : null;
  const terms = typeof snapshot.terms === "string" ? snapshot.terms : "";
  return <>{discount ? <p className={s.rewardValue}>خصم {discount}%</p> : null}{productName ? <p className={s.rewardValue}>{productName}</p> : null}{reward.rewardDescription ? <p>{reward.rewardDescription}</p> : null}{terms && terms !== reward.rewardDescription ? <p>{terms}</p> : null}</>;
}

export function RastMemberCard({ identity, member, walletAvailability }: { identity: LoyaltyIdentity; member: RastMembership; walletAvailability: RastWalletAvailability }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [openReward, setOpenReward] = useState<string | null>(member.rewards[0]?.id ?? null);
  useEffect(() => {
    function refreshVisible() { if (document.visibilityState === "visible") router.refresh(); }
    const timer = window.setInterval(refreshVisible, 30000);
    window.addEventListener("focus", refreshVisible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshVisible); };
  }, [router]);
  const remaining = Math.max(0, member.program.purchasesRequired - member.card.stampsInCycle);

  return <main className={s.publicPage} dir="rtl">
    <RastHeader identity={identity} />
    <div className={s.memberLayout}>
      <div className={s.memberIntro}>
        <span className={s.eyebrow}>أنت من أهل مقهى الكواكب</span>
        <h1>يا هلا برجعتك<br /><span>{member.card.customerName}.</span></h1>
        <p className={s.intro}>{member.rewards.length ? "لك مكافأة بانتظارك خلّ زيارتك الجاية أحلى" : remaining === 1 ? "باقي ختم واحد ومكافأتك تنتظرك" : `باقي ${remaining} أختام على مكافأتك نشوفك على خير`}</p>
        <div className={s.walletSection}>
          <h2>خلّ بطاقتك قريبة</h2><p>أضفها لمحفظة جوالك واعرضها عند الكاشير</p>
          <div className={s.walletButtons}>
            {([{ id: "apple", name: "Apple Wallet", available: walletAvailability.apple }, { id: "google", name: "Google Wallet", available: walletAvailability.google }] as const).map((wallet) => wallet.available ? <a key={wallet.id} className={s.walletButton} href={`/api/wallet/${wallet.id}/${encodeURIComponent(member.card.cardCode)}`}><Wallet aria-hidden="true" /><span><small>إضافة إلى</small><strong dir="ltr">{wallet.name}</strong></span></a> : <button key={wallet.id} type="button" className={s.walletButton} disabled aria-describedby="wallet-unavailable"><Wallet aria-hidden="true" /><span><small>غير متاحة حاليًا</small><strong dir="ltr">{wallet.name}</strong></span></button>)}
          </div>
          {!walletAvailability.apple || !walletAvailability.google ? <p className={s.hint} id="wallet-unavailable">الإضافة للمحافظ غير المتاحة لم تُفعّل بعد تقدر تستخدم رمز بطاقتك من هذه الصفحة</p> : null}
        </div>
        <button type="button" className={s.refreshButton} disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}><RefreshCw className={refreshing ? s.spinner : ""} aria-hidden="true" />{refreshing ? "جاري تحديث بطاقتك…" : "تحديث رصيد الأختام"}</button>
        {member.program.terms ? <details className={s.terms}><summary>تفاصيل البرنامج <ChevronDown aria-hidden="true" /></summary><p>{member.program.terms}</p></details> : null}
      </div>
      <div className={s.memberCardColumn}>
        <RastStampCard identity={identity} customerName={member.card.customerName} stamps={member.card.stampsInCycle} required={member.program.purchasesRequired} rewardName={member.program.rewardName} cardCode={member.card.cardCode} />
        <section className={s.rewards} aria-labelledby="rast-rewards-title">
          <div className={s.rewardHeading}><h2 id="rast-rewards-title">مكافآتك</h2><span>{member.rewards.length} متاحة</span></div>
          {member.rewards.length === 0 ? <div className={s.emptyRewards}><Gift aria-hidden="true" /><p>أول مكافأة تبدأ بأول زيارة<br /><span>اجمع أختامك وخلّ الباقي علينا</span></p></div> : member.rewards.map((reward) => <article key={reward.id} className={s.reward}>
            <button type="button" aria-expanded={openReward === reward.id} aria-controls={`reward-${reward.id}`} className={s.rewardToggle} onClick={() => setOpenReward((value) => value === reward.id ? null : reward.id)}><Gift aria-hidden="true" /><span><strong>{reward.rewardTitle}</strong><small><Clock3 aria-hidden="true" />{rewardExpiry(reward.expiresAt)}</small></span><ChevronDown aria-hidden="true" /></button>
            {openReward === reward.id ? <div id={`reward-${reward.id}`} className={s.rewardDetails}><RewardDetailsCopy reward={reward} /><RastQrCode value={reward.qrPayload || reward.rewardCode} label={`رمز استبدال ${reward.rewardTitle}`} /><strong dir="ltr">{reward.rewardCode}</strong><p>اعرض رمز المكافأة للكاشير لاستبدالها مرة واحدة</p></div> : null}
          </article>)}
        </section>
      </div>
    </div>
    <footer className={s.publicFooter}><span>أهل مقهى الكواكب</span><span>كل زيارة لها مكان</span></footer>
  </main>;
}
