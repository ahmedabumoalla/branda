import { NextResponse } from "next/server";
import { purchaseDomain } from "@/lib/platform/domain-purchase-server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      cafeSlug?: string;
      domain?: string;
      years?: number;
      autoRenew?: boolean;
      price?: number;
      currency?: string;
    };

    if (!body.cafeSlug || !body.domain) {
      return NextResponse.json({ error: "cafeSlug and domain are required" }, { status: 400 });
    }

    const result = await purchaseDomain({
      cafeSlug: body.cafeSlug,
      domain: body.domain,
      years: body.years ?? 1,
      autoRenew: Boolean(body.autoRenew),
      price: body.price,
      currency: body.currency,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to buy domain" },
      { status: 400 }
    );
  }
}
