import { createAdminClient } from "@/lib/supabase/admin";
import { loadWalletMemberByCode } from "@/lib/data/loyalty-experience";
import { verifyWalletArtToken } from "@/lib/wallet/art";
import { walletStampArtwork } from "@/lib/wallet/apple";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ cardId: string; token: string }> };
export async function GET(_request: Request, context: Context) {
  const { cardId, token } = await context.params;
  const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
  if (!verifyWalletArtToken(cardId, token)) return new Response(null, { status: 404, headers });
  try {
    const { data, error } = await createAdminClient().from("loyalty_cards").select("card_code").eq("id", cardId).maybeSingle();
    if (error) throw new Error("wallet_art_unavailable");
    const member = data ? await loadWalletMemberByCode(data.card_code) : null;
    if (!member?.program.googleWalletEnabled) return new Response(null, { status: 404, headers });
    const image = await walletStampArtwork(member);
    return new Response(new Uint8Array(image), { headers: { ...headers, "content-type": "image/png" } });
  } catch { return new Response(null, { status: 503, headers }); }
}
