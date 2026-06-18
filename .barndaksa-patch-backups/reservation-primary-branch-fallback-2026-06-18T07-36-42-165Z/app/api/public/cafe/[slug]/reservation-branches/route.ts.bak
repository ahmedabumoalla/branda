import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicBranchesBySlug } from "@/lib/data/branches";
import { getPublicCafeFeatureCodesBySlug } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { publicCacheHeader } from "@/lib/performance/server-cache";
import { cachedServerValue } from "@/lib/performance/server-memory-cache";

type Params = { params: Promise<{ slug: string }> };

const TTL_SECONDS = 120;

async function canLoadReservationBranches(slug: string) {
  try {
    const features = await getPublicCafeFeatureCodesBySlug(slug);
    return !features.length || featureCodesAllow(features, "reservations");
  } catch {
    // Fail open: the page-level feature gate will still hide reservations if the service is disabled.
    return true;
  }
}

async function loadReservationBranches(slug: string) {
  if (!(await canLoadReservationBranches(slug))) return [];
  return getPublicBranchesBySlug(slug);
}

export async function GET(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ branches: [] }, { status: 200 });
  }

  const { slug } = await params;
  const normalizedSlug = slug.trim().toLowerCase();

  try {
    const branches = await cachedServerValue(
      `public-reservation-branches:${normalizedSlug}`,
      TTL_SECONDS * 1000,
      () => loadReservationBranches(normalizedSlug),
    );

    return NextResponse.json(
      { branches },
      {
        headers: {
          "Cache-Control": publicCacheHeader(TTL_SECONDS),
          "x-barndaksa-reservation-branches": "v1",
        },
      },
    );
  } catch (error) {
    console.error("[public/cafe/reservation-branches]", error);
    return NextResponse.json({ branches: [] }, { status: 200 });
  }
}
