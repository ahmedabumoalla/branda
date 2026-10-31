// BARNDAKSA_HOME_PAGE_VIDEO_DYNAMIC_FIX
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { BrandaHome } from "@/components/marketing/branda-home";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import {
  defaultPlatformContactSettings,
  defaultPlatformHomeSettings,
  getPublicPlatformHomeData,
  type PublicPlatformHomeData,
} from "@/lib/data/platform-content";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getHomeAccountHref } from "@/lib/data/home-account";
const homeFont = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-branda-home", display: "swap" });

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
    return <div className={homeFont.variable}><BrandaHome contacts={emptyData.contacts} /></div>;
  }

  const [data, accountHref] = await Promise.all([
    getPublicPlatformHomeData().catch(error => { console.error("[HomePage]", error); return emptyData; }),
    getHomeAccountHref(),
  ]);
  return <div className={homeFont.variable}><BrandaHome contacts={data.contacts} accountHref={accountHref ?? "/login"} /></div>;
}
