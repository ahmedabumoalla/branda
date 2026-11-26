"use client";

import { loyaltyText, type LoyaltyLanguage } from "@/lib/loyalty/customer-language";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Clock3, Gift, RefreshCw, Wallet } from "lucide-react";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import type { CustomerLoyaltyCardView } from "@/lib/data/loyalty-cards";
import type { CustomerRewardInstance } from "@/lib/data/customer-rewards";
import { RastHeader } from "./rast-brand";
import { RastStampCard } from "./rast-stamp-card";
import { WalletDownloadLink } from "./wallet-download-link";
import { RastQrCode } from "./qr-code";
import s from "./rast-loyalty.module.css";
import { loyaltyCommunityName, loyaltyTheme } from "./loyalty-theme";
import { PointsRewardPath } from "@/components/loyalty/points-reward-path";
import { pointsProgressText } from "@/lib/loyalty/reward-path";

export type RastWalletAvailability = { apple: boolean; google: boolean };
export type RastMembership = CustomerLoyaltyCardView & { rewards: CustomerRewardInstance[] };

function rewardExpiry(value: string | null, en: boolean) {
  if (!value) return en ? "No expiry date" : "بدون تاريخ انتهاء محدد";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return en ? "Ask the cashier about expiry" : "راجع الكاشير لمعرفة الصلاحية";
  return `${en ? "Valid until" : "صالحة حتى"} ${new Intl.DateTimeFormat(en ? "en-GB" : "ar-SA", { calendar: "gregory", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(date)}`;
}

function RewardDetailsCopy({ reward, language }: { language: LoyaltyLanguage; reward: CustomerRewardInstance }) {
  const raw = reward.metadata?.termsSnapshot;
  const snapshot = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const discount = snapshot.rewardKind === "discount" && typeof snapshot.discountPercent === "number" ? snapshot.discountPercent : null;
  const productName = snapshot.rewardKind === "product" && typeof snapshot.rewardProductName === "string" ? snapshot.rewardProductName : null;
  const terms = typeof snapshot.terms === "string" ? snapshot.terms : "";
  return <>{discount ? <p className={s.rewardValue}>{language === "en" ? "Discount" : "خصم"} {discount}%</p> : null}{productName ? <p className={s.rewardValue}>{loyaltyText(productName, language)}</p> : null}{reward.rewardDescription ? <p>{loyaltyText(reward.rewardDescription, language)}</p> : null}{terms && terms !== reward.rewardDescription ? <p>{loyaltyText(terms, language)}</p> : null}</>;
}

export function RastMemberCard({ language = "ar", identity, member, walletAvailability, loadedAt }: { language?: LoyaltyLanguage; identity: LoyaltyIdentity; member: RastMembership; walletAvailability: RastWalletAvailability; loadedAt: number }) {
  const en = language === "en";
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const initialBalanceChecked = useRef(false);
  const [openReward, setOpenReward] = useState<string | null>(member.rewards[0]?.id ?? null);
  useEffect(() => {
    let lastRefresh = loadedAt;
    function refreshVisible() {
      const now = Date.now();
      if (document.visibilityState !== "visible" || (now >= lastRefresh && now - lastRefresh < 5000)) return;
      lastRefresh = now;
      // Background reconciliation must not show the manual refresh spinner or
      // interfere with a native Wallet download initiated from this page.
      router.refresh();
    }
    // Cached routes remain instant, then reconcile an older balance without
    // refetching a fresh server render or duplicating focus/visibility events.
    // A device clock ahead of the server must not trigger an endless refresh
    // after every new server render. Reconcile an old initial snapshot once.
    if (!initialBalanceChecked.current) {
      initialBalanceChecked.current = true;
      refreshVisible();
    }
    const timer = window.setInterval(refreshVisible, 30000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshVisible); document.removeEventListener("visibilitychange", refreshVisible); };
  }, [router, loadedAt]);
  const remaining = Math.max(0, member.program.purchasesRequired - member.card.stampsInCycle);
  const points = member.program.pointsProgram?.mode === "points" ? member.program.pointsProgram : null;
  const balance = member.card.availableLoyaltyPoints ?? 0;

  return <main className={s.publicPage} style={loyaltyTheme(identity)} dir={en ? "ltr" : "rtl"} lang={language}>
    <RastHeader language={language} identity={identity} />
    <div className={s.memberLayout}>
      <div className={s.memberIntro}>
        <span className={s.eyebrow}>{en ? loyaltyText(identity.name, language) : `أنت من ${loyaltyCommunityName(identity)}`}</span>
        <h1>{en ? "Welcome back" : "يا هلا برجعتك"} <span className={s.memberName}><bdi>{member.card.customerName}</bdi></span></h1>
        <p className={s.intro}>{en ? (points ? `${balance} points` : member.rewards.length ? "Your reward is ready to redeem" : `${remaining} ${remaining === 1 ? "stamp" : "stamps"} to your next reward`) : points ? pointsProgressText(points.milestones, balance) : member.rewards.length ? "لك مكافأة بانتظارك خلّ زيارتك الجاية أحلى" : remaining === 1 ? "باقي ختم واحد ومكافأتك تنتظرك" : `باقي ${remaining} أختام على مكافأتك نشوفك على خير`}</p>
        <div className={s.walletSection}>
          <h2>{en ? "Add your loyalty card" : identity.slug === "taza" ? "حمّل بطاقة الولاء من هنا" : "خلّ بطاقتك قريبة"}</h2><p>{en ? "Save your card to your mobile wallet and show it to the cashier" : identity.slug === "taza" ? "اضغط على محفظة جوالك بالأسفل ثم اختر إضافة لحفظ بطاقتك واعرضها عند الكاشير في كل زيارة" : "أضفها لمحفظة جوالك واعرضها عند الكاشير"}</p>
          <div className={s.walletButtons}>
            {([{ id: "apple", name: "Apple Wallet", available: walletAvailability.apple }, { id: "google", name: "Google Wallet", available: walletAvailability.google }] as const).map((wallet) => wallet.available ? <WalletDownloadLink language={language} key={wallet.id} provider={wallet.id} cardCode={member.card.cardCode} /> : <button key={wallet.id} type="button" className={s.walletButton} disabled aria-describedby="wallet-unavailable"><Wallet aria-hidden="true" /><span><small>{en ? "Currently unavailable" : "غير متاحة حاليًا"}</small><strong dir="ltr">{wallet.name}</strong></span></button>)}
          </div>
          {!walletAvailability.apple || !walletAvailability.google ? <p className={s.hint} id="wallet-unavailable">{en ? "You can use the code on this page if your wallet is unavailable" : "الإضافة للمحافظ غير المتاحة لم تُفعّل بعد تقدر تستخدم رمز بطاقتك من هذه الصفحة"}</p> : null}
        </div>
        <button type="button" className={s.refreshButton} disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}><RefreshCw className={refreshing ? s.spinner : ""} aria-hidden="true" />{en ? (refreshing ? "Refreshing balance" : "Refresh balance") : `${refreshing ? "جار تحديث" : "تحديث"} ${points ? "رصيد النقاط" : "رصيد الأختام"}`}</button>
        {member.program.terms ? <details className={s.terms}><summary>{en ? "Program details" : "تفاصيل البرنامج"} <ChevronDown aria-hidden="true" /></summary><p>{loyaltyText(member.program.terms, language)}</p></details> : null}
      </div>
      <div className={s.memberCardColumn}>
        {points ? <>
          <PointsRewardPath balance={balance} milestones={points.milestones} />
          <div className={`${s.memberQr} ${s.pointsQr}`}><RastQrCode value={member.card.cardCode} label="رمز بطاقتك لجمع النقاط واستبدالها عند الكاشير" /><div><strong>اعرض بطاقتك للكاشير</strong><p>اجمع نقاط الفاتورة أو اختر مكافأة لخصم تكلفتها من رصيدك</p><span dir="ltr">{member.card.displayNumber || member.card.cardCode}</span></div></div>
        </> : <RastStampCard language={language} identity={identity} customerName={member.card.customerName} stamps={member.card.stampsInCycle} required={member.program.purchasesRequired} rewardName={member.program.rewardName} cardCode={member.card.cardCode} displayNumber={member.card.displayNumber} stampStyle={member.program.stampStyle} />}
        {(!points || member.rewards.length > 0) && <section className={s.rewards} aria-labelledby="rast-rewards-title">
          <div className={s.rewardHeading}><h2 id="rast-rewards-title">{en ? "Your rewards" : points ? "مكافآت الأختام السابقة" : "مكافآتك"}</h2><span>{member.rewards.length} {en ? "available" : "متاحة"}</span></div>
          {member.rewards.length === 0 ? <div className={s.emptyRewards}><Gift aria-hidden="true" /><p>{en ? "Your first reward starts with your first visit" : "أول مكافأة تبدأ بأول زيارة"}<br /><span>{en ? "Collect stamps each time you visit" : "اجمع أختامك وخلّ الباقي علينا"}</span></p></div> : member.rewards.map((reward) => <article key={reward.id} className={s.reward}>
            <button type="button" aria-expanded={openReward === reward.id} aria-controls={`reward-${reward.id}`} className={s.rewardToggle} onClick={() => setOpenReward((value) => value === reward.id ? null : reward.id)}><Gift aria-hidden="true" /><span><strong>{loyaltyText(reward.rewardTitle, language)}</strong><small><Clock3 aria-hidden="true" />{rewardExpiry(reward.expiresAt, en)}</small></span><ChevronDown aria-hidden="true" /></button>
            {openReward === reward.id ? <div id={`reward-${reward.id}`} className={s.rewardDetails}><RewardDetailsCopy language={language} reward={reward} /><RastQrCode value={reward.qrPayload || reward.rewardCode} label={en ? "Reward redemption code" : `رمز استبدال ${reward.rewardTitle}`} /><strong dir="ltr">{reward.rewardCode}</strong><p>{en ? "Show this code to the cashier to redeem your reward once" : "اعرض رمز المكافأة للكاشير لاستبدالها مرة واحدة"}</p></div> : null}
          </article>)}
        </section>}
      </div>
    </div>
    <footer className={s.publicFooter}><span>{en ? loyaltyText(identity.name, language) : loyaltyCommunityName(identity)}</span><span>{en ? "Every visit counts" : "كل زيارة لها مكان"}</span></footer>
  </main>;
}
