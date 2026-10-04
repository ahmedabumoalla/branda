export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { SubscriptionPageClient } from "@/components/dashboard/pages/subscription-page";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ComponentProps } from "react";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getCafeFeatureOverrides, getOwnerActivePlanId } from "@/lib/data/admin";
import { getOwnerCafeContext } from "@/lib/data/cafes";
import {
  getAvailablePlans,
  getOwnerPendingSubscription,
  getOwnerSubscriptionHistory,
} from "@/lib/data/subscription";
import { getEffectiveBrandFeatureAccess, getPlanIncludedFeatures } from "@/lib/platform/feature-access";

function ServiceUnavailable() {
  return (
    <div dir="rtl" className="mx-auto max-w-2xl rounded-3xl border border-[#E7D7C6] bg-[#FCF8F3] p-8 text-center">
      <p role="alert" className="font-bold text-[#311912]">تعذر تحميل بيانات العلامة. حاول مجددًا لاحقًا.</p>
      <Link href="/dashboard/menu" className="mt-6 inline-flex min-h-11 items-center rounded-2xl bg-[#4A281D] px-6 py-3 font-black text-white">العودة إلى المنيو</Link>
    </div>
  );
}

export default async function SubscriptionPage() {
  if (!isSupabaseConfigured()) return <ServiceUnavailable />;

  const cafe = await getOwnerCafeContext().catch(() => null);
  if (!cafe) return <ServiceUnavailable />;
  if (cafe.slug === "rast") redirect("/dashboard/menu");

  let pageProps: ComponentProps<typeof SubscriptionPageClient>;
  try {
    const [plans, activePlanId, history, pending] = await Promise.all([
      getAvailablePlans(),
      getOwnerActivePlanId(),
      getOwnerSubscriptionHistory(),
      getOwnerPendingSubscription(),
    ]);
    const featureOverrides = await getCafeFeatureOverrides(cafe.id).catch(() => []);
    const initialFeatureAccess = getEffectiveBrandFeatureAccess(
      getPlanIncludedFeatures(activePlanId, plans),
      featureOverrides,
    );

    pageProps = {
      initialPlans: plans,
      initialActivePlanId: activePlanId,
      initialHistory: history,
      initialPending: pending,
      initialFeatureAccess,
    };
  } catch (error) {
    console.error("[SubscriptionPage]", error);
    pageProps = {
      initialPlans: [],
      initialActivePlanId: "",
      initialHistory: [],
      initialPending: null,
      initialFeatureAccess: [],
      configError: "تعذر تحميل الاشتراك والباقات",
    };
  }

  return <SubscriptionPageClient {...pageProps} />;
}
