import { NextResponse } from "next/server";
import { connectDomainToProject } from "@/lib/platform/domain-purchase-server";
import { requireCafeOwnerForSlug } from "@/lib/data/domain-orders";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { domain?: string; cafeSlug?: string };
    if (!body.domain || !body.cafeSlug) {
      return NextResponse.json({ error: "domain and cafeSlug are required" }, { status: 400 });
    }
    await requireCafeOwnerForSlug(body.cafeSlug);
    const result = await connectDomainToProject(body.domain);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to connect domain";
    const status = message.includes("Unauthorized") || message.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
