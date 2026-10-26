import { NextResponse } from "next/server";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ ok: false }, { status: 403, headers });
  try {
    const raw = await request.text();
    if (raw.length > 2000) return NextResponse.json({ ok: false }, { status: 400, headers });
    const input = z.object({ shiftId: z.uuid(), deviceId: z.uuid(), pending: z.number().int().min(0).max(1_000_000), conflicts: z.number().int().min(0).max(1_000_000) }).strict().parse(JSON.parse(raw));
    const { client, cafe } = await getBrandFinanceContext((await params).slug);
    const { data, error } = await client.rpc("brand_finance_shift_heartbeat", { p_cafe_id: cafe.id, p_shift_id: input.shiftId, p_device_id: input.deviceId, p_pending: input.pending, p_conflicts: input.conflicts });
    if (error) return NextResponse.json({ ok: false }, { status: error.code === "42501" ? 403 : 400, headers });
    return NextResponse.json({ ok: true, ...data }, { headers });
  } catch { return NextResponse.json({ ok: false }, { status: 503, headers }); }
}
