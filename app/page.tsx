// BARNDAKSA_HOME_PAGE_VIDEO_DYNAMIC_FIX
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { BrandaHome } from "@/components/marketing/branda-home";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import {
  defaultPlatformContactSettings,
  getPublicPlatformContactSettings,
} from "@/lib/data/platform-content";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getHomeAccount } from "@/lib/data/home-account";
import { getPublicHomePlans } from "@/lib/data/public-home-catalog";
const homeFont = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-branda-home", display: "swap" });

export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    return <div className={homeFont.variable}><BrandaHome contacts={defaultPlatformContactSettings} /></div>;
  }

  const [contacts, account, catalog] = await Promise.all([
    getPublicPlatformContactSettings().catch(error => { console.error("[HomePage]", error); return defaultPlatformContactSettings; }),
    getHomeAccount(),
    getPublicHomePlans(),
  ]);
  return <div className={homeFont.variable}><BrandaHome contacts={contacts} account={account} accountHref={account?.href ?? "/login"} plans={catalog.plans} plansError={catalog.error} /></div>;
}
