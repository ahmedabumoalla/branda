import { PlatformHomePage } from "@/components/marketing/platform-home-page";
import {
  defaultPlatformContactSettings,
  defaultPlatformHomeSettings,
  getPublicPlatformHomeData,
  type PublicPlatformHomeData,
} from "@/lib/data/platform-content";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";

const emptyData: PublicPlatformHomeData = {
  settings: defaultPlatformHomeSettings,
  contacts: defaultPlatformContactSettings,
  heroImages: [],
  loyaltyImages: [],
  brands: [],
  videoViews: 0,
  videoClicks: 0,
};

export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    return <PlatformHomePage data={emptyData} />;
  }

  try {
    return <PlatformHomePage data={await getPublicPlatformHomeData()} />;
  } catch (error) {
    console.error("[HomePage]", error);
    return <PlatformHomePage data={emptyData} />;
  }
}
