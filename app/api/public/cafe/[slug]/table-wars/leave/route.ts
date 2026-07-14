import { leaveTableWarsV2RoundForCustomer } from "@/lib/table-wars/v2-data";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const body = (await request.json().catch(() => null)) as { roundId?: unknown } | null;
    const roundId = typeof body?.roundId === "string" ? body.roundId.trim() : "";
    if (!roundId) return Response.json({ ok: false }, { status: 400 });

    await leaveTableWarsV2RoundForCustomer(slug, roundId);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[TableWarsLeaveRoute]", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
