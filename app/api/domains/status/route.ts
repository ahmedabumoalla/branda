import { NextResponse } from "next/server";
import { resolveDomainStatus } from "@/lib/platform/domain-purchase-server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { domain?: string };
    if (!body.domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }
    const result = await resolveDomainStatus(body.domain);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to check status" },
      { status: 400 }
    );
  }
}
