// BARNDAKSA_HOME_PAGE_VIDEO_DYNAMIC_FIX
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { PlatformHomePage } from "@/components/marketing/platform-home-page";
import {
  defaultPlatformContactSettings,
  defaultPlatformHomeSettings,
  getPublicPlatformHomeData,
  type PublicPlatformHomeData,
} from "@/lib/data/platform-content";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getHomeAccountHref } from "@/lib/data/home-account";
import { getPublicHomeCatalog } from "@/lib/data/public-home-catalog";

const emptyData: PublicPlatformHomeData = {
  settings: defaultPlatformHomeSettings,
  contacts: defaultPlatformContactSettings,
  heroImages: [],
  loyaltyImages: [],
  brands: [],
  promotions: [],
  videoViews: 0,
  videoClicks: 0,
};

export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    return <PlatformHomePage data={emptyData} />;
  }

  const [data, accountHref, initialCatalog] = await Promise.all([
    getPublicPlatformHomeData().catch(error => { console.error("[HomePage]", error); return emptyData; }),
    getHomeAccountHref(),
    getPublicHomeCatalog(),
  ]);
  return <PlatformHomePage data={data} accountHref={accountHref} initialCatalog={initialCatalog} />;
}
