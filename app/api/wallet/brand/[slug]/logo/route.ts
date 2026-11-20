import { getBranchLoyaltyBrand } from "@/lib/data/loyalty-experience";
import { walletBrandLogo, walletStampLogo } from "@/lib/wallet/apple";
import { isMqas77Wallet } from "@/lib/wallet/mqas77-design";
import { mqas77GoogleLogo } from "@/lib/wallet/mqas77-assets";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };
export async function GET(_request: Request, context: Context) {
  const { slug } = await context.params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(slug)) return new Response(null, { status: 404 });
  try {
    const brand = await getBranchLoyaltyBrand(slug, new URL(_request.url).searchParams.get("branch"), true);
    // The public brand mark also appears in the owner's inactive-program preview.
    // getLoyaltyBrand still enforces the current brand/package entitlement.
    if (!brand) return new Response(null, { status: 404 });
    const source = { cafeName: brand.identity.name, logoUrl: brand.identity.logoUrl, program: brand.program };
    const logo = isMqas77Wallet(slug) && new URL(_request.url).searchParams.get("wallet") === "mqas77"
      ? await mqas77GoogleLogo()
      // Stamp slots use the square single-colour rendition of the same saved logo.
      : new URL(_request.url).searchParams.get("shape") === "stamp" ? await walletStampLogo(source) : await walletBrandLogo(source);
    return new Response(new Uint8Array(logo), { headers: { "content-type": "image/png", "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" } });
  } catch { return new Response(null, { status: 503, headers: { "cache-control": "no-store" } }); }
}
