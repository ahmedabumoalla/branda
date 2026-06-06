
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getPublicMenuBySlug } from "@/lib/data/menu";
import { getPublicOffersBySlug } from "@/lib/data/offers";
import { getPublicBranchesBySlug } from "@/lib/data/branches";
import { getPublicLoyaltyBySlug } from "@/lib/data/loyalty";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicPagesBySlug } from "@/lib/data/pages";
import { getPublicReservationServicesBySlug } from "@/lib/data/platform-upgrade";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const { slug } = await params;
  try {
    const settings = await getPublicCafeSettings(slug);
    if (!settings) return NextResponse.json({ error: "Cafe not found" }, { status: 404 });
    const [menu, offers, branches, loyalty, pages, reservationServices] = await Promise.all([getPublicMenuBySlug(slug), getPublicOffersBySlug(slug), getPublicBranchesBySlug(slug), getPublicLoyaltyBySlug(slug), getPublicPagesBySlug(slug), getPublicReservationServicesBySlug(slug)]);
    return NextResponse.json({ ...menu, offers, branches, loyaltySettings: loyalty.settings, loyaltyRewards: loyalty.rewards, pages, reservationServices });
  } catch (err) {
    console.error("[public/menu]", err);
    return NextResponse.json({ error: "Failed to load menu" }, { status: 500 });
  }
}
