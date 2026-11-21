import { getLoyaltyBrand } from "@/lib/data/loyalty-experience";
import { POINTS_CAFE_ID } from "@/lib/loyalty/points-program";
import { issueApplePass, walletStampArtwork } from "@/lib/wallet/apple";
import { googleCoffeeSampleSaveUrl } from "@/lib/wallet/google";
import type { WalletMember } from "@/lib/wallet/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ asset: string }> }) {
  const { asset } = await context.params;
  if (!["iphone.pkpass", "android", "path.png"].includes(asset)) return new Response(null, { status: 404 });
  try {
    const brand = await getLoyaltyBrand("test-cafe");
    if (brand?.cafeId !== POINTS_CAFE_ID || !brand.program.enabled) return new Response(null, { status: 404 });
    const points = brand.program.pointsProgram;
    const firstMilestone = points?.milestones[0]?.points ?? 0;
    const member: WalletMember = {
      cafeSlug: brand.identity.slug, cafeName: brand.identity.name, logoUrl: brand.identity.logoUrl,
      program: brand.program, experience: { rewardValidityDays: 30, nearbyMessage: "", latitude: null, longitude: null }, branchLocations: [],
      card: { id: "coffee-wallet-sample", cafeId: brand.cafeId, cardCode: "SAMPLE.COFFEE", displayNumber: "نموذج",
        customerName: "", customerPhone: "", customerEmail: "", stampsInCycle: Math.min(3, brand.program.purchasesRequired),
        availableLoyaltyPoints: firstMilestone, completedCycles: 0, availableRewards: 0, totalPurchases: 0, issuedAt: "", updatedAt: "" },
    };
    const headers = { "Cache-Control": "public, max-age=0, s-maxage=60", "X-Content-Type-Options": "nosniff" };
    if (asset === "android") {
      return new Response(null, { status: 303, headers: { ...headers, Location: googleCoffeeSampleSaveUrl(member) } });
    }
    if (asset === "iphone.pkpass") {
      const pass = await issueApplePass(member, { standaloneSample: true });
      return new Response(new Uint8Array(pass), { headers: { ...headers, "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": 'attachment; filename="coffee-sample.pkpass"' } });
    }
    const path = await walletStampArtwork(member);
    return new Response(new Uint8Array(path), { headers: { ...headers, "Content-Type": "image/png" } });
  } catch {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
