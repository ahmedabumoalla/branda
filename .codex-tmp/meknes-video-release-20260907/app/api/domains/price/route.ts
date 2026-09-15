import { NextResponse } from "next/server";
import { resolvePrice } from "@/lib/platform/domain-purchase-server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { domain?: string; years?: number };
    if (!body.domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }
    const result = await resolvePrice(body.domain, body.years ?? 1);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to get price" },
      { status: 400 }
    );
  }
}
