import { notFound } from "next/navigation";
import { PublicLoyaltyCardView } from "@/components/loyalty/public-loyalty-card-view";
import { getLoyaltyCardViewByCode } from "@/lib/data/loyalty-cards";
import { getPublicCafeFeatureCodesBySlug } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { getBusinessCopy } from "@/lib/platform/business-copy";

type Props = {
  params: Promise<{ cardCode: string }>;
  searchParams?: Promise<{ back?: string }>;
};

export default async function LoyaltyCardPage({ params, searchParams }: Props) {
  const { cardCode } = await params;
  const query = searchParams ? await searchParams : {};
  const view = await getLoyaltyCardViewByCode(cardCode);

  if (!view) notFound();

  const { card, program, cafeSlug, cafeName, businessCategory } = view;
  const copy = getBusinessCopy(businessCategory);
  const features = cafeSlug ? await getPublicCafeFeatureCodesBySlug(cafeSlug).catch(() => []) : [];
  if (!featureCodesAllow(features, "loyalty")) notFound();

  const required = Math.max(1, Number(program.purchasesRequired || 7));
  const lit = Math.min(required, Number(card.stampsInCycle || 0));
  const backHref = query?.back || (cafeSlug ? `/c/${cafeSlug}/account` : "/");
  const cafeHref = cafeSlug ? `/c/${cafeSlug}` : "/";

  return (
    <PublicLoyaltyCardView
      cardCode={card.cardCode}
      cafeName={cafeName}
      cafeHref={cafeHref}
      backHref={backHref}
      cardTitle={program.cardTitle}
      cardSubtitle={program.cardSubtitle}
      rewardName={program.rewardName}
      terms={program.terms}
      required={required}
      lit={lit}
      availableRewards={card.availableRewards}
      loyaltyUnitLit={copy.loyaltyUnitLit}
      loyaltyUnitPlural={copy.loyaltyUnitPlural}
    />
  );
}
