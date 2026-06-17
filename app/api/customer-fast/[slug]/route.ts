import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicBranchesBySlug } from "@/lib/data/branches";
import { getCustomerProfileByUser, mapCustomerProfileToSession } from "@/lib/data/customers";
import { getPublicCafeFeatureCodesBySlug } from "@/lib/data/feature-entitlements";
import { getPublicLoyaltyProgramBySlug, getCurrentCustomerLoyaltyCardView } from "@/lib/data/loyalty-cards";
import { getPublicMenuBySlug } from "@/lib/data/menu";
import { getPublicOffersBySlug } from "@/lib/data/offers";
import { getPublicPagesBySlug } from "@/lib/data/pages";
import { getPublicReservationServicesBySlug } from "@/lib/data/platform-upgrade";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity, getPublicThemeId } from "@/lib/data/theme";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Params = { params: Promise<{ slug: string }> };

const emptyMenu = { products: [], categories: [] };

function cleanSlug(slug: string) {
  return slug.trim().toLowerCase();
}

async function safeFeatures(slug: string) {
  try {
    return await getPublicCafeFeatureCodesBySlug(slug);
  } catch (error) {
    console.warn("[customer-fast/features]", error);
    return [];
  }
}

async function safeCustomer(slug: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;
    const profile = await getCustomerProfileByUser(slug, user.id);
    return profile ? mapCustomerProfileToSession(slug, profile) : null;
  } catch (error) {
    console.warn("[customer-fast/customer]", error);
    return null;
  }
}

export async function GET(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { slug: rawSlug } = await params;
  const slug = cleanSlug(rawSlug);

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json({ error: "Invalid cafe slug" }, { status: 400 });
  }

  try {
    const [settings, themeId, customIdentity, features] = await Promise.all([
      getPublicCafeSettings(slug),
      getPublicThemeId(slug).catch(() => null),
      getPublicCustomIdentity(slug).catch(() => null),
      safeFeatures(slug),
    ]);

    if (!settings) {
      return NextResponse.json({ error: "Cafe not found" }, { status: 404 });
    }

    const canUseFeature = (feature: string) => {
      if (!features.length) return true;
      return featureCodesAllow(features, feature);
    };

    const [menu, offers, branches, pages, reservationServices, loyaltyProgram, customer] = await Promise.all([
      canUseFeature("menu") ? getPublicMenuBySlug(slug) : Promise.resolve(emptyMenu),
      canUseFeature("offers") ? getPublicOffersBySlug(slug) : Promise.resolve([]),
      canUseFeature("branches") ? getPublicBranchesBySlug(slug) : Promise.resolve([]),
      canUseFeature("pages") ? getPublicPagesBySlug(slug) : Promise.resolve([]),
      canUseFeature("reservations") ? getPublicReservationServicesBySlug(slug) : Promise.resolve([]),
      canUseFeature("loyalty") ? getPublicLoyaltyProgramBySlug(slug).catch(() => null) : Promise.resolve(null),
      safeCustomer(slug),
    ]);

    let loyaltyCard = null;
    if (customer && canUseFeature("loyalty") && loyaltyProgram?.enabled !== false) {
      loyaltyCard = await getCurrentCustomerLoyaltyCardView(slug).catch((error) => {
        console.warn("[customer-fast/loyalty-card]", error);
        return null;
      });
    }

    return NextResponse.json(
      {
        slug,
        generatedAt: new Date().toISOString(),
        settings,
        themeId,
        customIdentity,
        features,
        products: menu.products,
        categories: menu.categories,
        offers,
        branches,
        pages,
        reservationServices,
        loyaltyProgram,
        customer,
        loyaltyCard,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=0, no-cache",
        },
      },
    );
  } catch (error) {
    console.error("[customer-fast]", error);
    return NextResponse.json({ error: "Failed to load customer app" }, { status: 500 });
  }
}
