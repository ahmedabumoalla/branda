import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getPublicMenuBySlug } from "@/lib/data/menu";
import { getPublicOffersBySlug } from "@/lib/data/offers";
import { getPublicBranchesBySlug } from "@/lib/data/branches";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicReservationServicesBySlug } from "@/lib/data/platform-upgrade";

type Params = { params: Promise<{ slug: string }> };
export const revalidate = 30;
export async function GET(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const { slug } = await params;
  try {
    const settings = await getPublicCafeSettings(slug); if (!settings) return NextResponse.json({ error: "Cafe not found" }, { status: 404 });
    const [menu, offers, branches, reservationServices] = await Promise.all([getPublicMenuBySlug(slug), getPublicOffersBySlug(slug), getPublicBranchesBySlug(slug), getPublicReservationServicesBySlug(slug)]);
    return NextResponse.json({ ...menu, offers, branches, loyaltySettings: { pointsPerSar: 0, welcomePoints: 0, enabled: false, earnRules: [], redemptionRules: [] }, loyaltyRewards: [], pages: [], reservationServices }, { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=180" } });
  } catch (err) { console.error("[public/menu]", err); return NextResponse.json({ error: "Failed to load menu" }, { status: 500 }); }
}
