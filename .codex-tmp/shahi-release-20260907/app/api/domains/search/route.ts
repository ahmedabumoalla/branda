import { NextResponse } from "next/server";
import { resolveAvailability, resolvePrice } from "@/lib/platform/domain-purchase-server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { domain?: string; years?: number };
    if (!body.domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    const [availability, price] = await Promise.all([
      resolveAvailability(body.domain),
      resolvePrice(body.domain, body.years ?? 1),
    ]);

    return NextResponse.json({
      domain: availability.domain,
      tld: availability.tld,
      available: availability.available,
      supportedTld: availability.supportedTld,
      availabilityStatus: availability.status,
      years: price.years,
      price: price.price,
      currency: price.currency,
      message: availability.message ?? price.message,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "search failed" },
      { status: 400 }
    );
  }
}
