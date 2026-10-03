import { getLoyaltyBrand } from "@/lib/data/loyalty-experience";
import { walletBrandLogo } from "@/lib/wallet/apple";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };
export async function GET(_request: Request, context: Context) {
  const { slug } = await context.params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(slug)) return new Response(null, { status: 404 });
  try {
    const brand = await getLoyaltyBrand(slug);
    if (!brand?.program.enabled) return new Response(null, { status: 404 });
    const logo = await walletBrandLogo({ cafeName: brand.identity.name, logoUrl: brand.identity.logoUrl, program: brand.program });
    return new Response(new Uint8Array(logo), { headers: { "content-type": "image/png", "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" } });
  } catch { return new Response(null, { status: 503, headers: { "cache-control": "no-store" } }); }
}
