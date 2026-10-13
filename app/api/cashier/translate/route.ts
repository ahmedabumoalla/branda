import { z } from "zod";
import { lookupRastCashierCardAction, lookupRastCashierRewardAction } from "@/app/actions/loyalty-experience";
// Authorized catalog records only, never an arbitrary text translation proxy
export async function POST(request: Request) {
  const input = z.object({ kind: z.enum(["stamp", "redeem"]), code: z.string().trim().min(4).max(500) }).safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  try {
    const preview = input.data.kind === "stamp" ? await lookupRastCashierCardAction(input.data.code) : await lookupRastCashierRewardAction(input.data.code);
    return Response.json({ catalog: preview.catalog }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "CARD_UNAVAILABLE" }, { status: 403 }); }
}
