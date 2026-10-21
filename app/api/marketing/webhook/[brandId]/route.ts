import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyMarketingToken } from "@/lib/marketing/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const schema = z.object({
  typeWebhook: z.string().max(80), instanceData: z.object({ idInstance: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]) }),
  idMessage: z.string().max(200).optional(), status: z.string().max(50).optional(), stateInstance: z.string().max(50).optional(),
});
export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  if (!z.uuid().safeParse(brandId).success) return new Response(null, { status: 404, headers });
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1] ?? "";
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) return new Response(null, { status: 401, headers });
  try {
    const db = createAdminClient();
    const { data: connection, error } = await db.from("brand_marketing_connections").select("instance_id,webhook_token_hash,generation,status").eq("cafe_id", brandId).maybeSingle();
    if (error) throw new Error("CONNECTION_UNAVAILABLE");
    if (!connection?.webhook_token_hash || !verifyMarketingToken(token, connection.webhook_token_hash)) return new Response(null, { status: 401, headers });
    const raw = await request.text();
    if (raw.length > 64_000) return new Response(null, { status: 413, headers });
    let json: unknown;
    try { json = JSON.parse(raw); } catch { return new Response(null, { status: 400, headers }); }
    const parsed = schema.safeParse(json);
    if (!parsed.success || String(parsed.data.instanceData.idInstance) !== connection.instance_id) return new Response(null, { status: 400, headers });
    const event = parsed.data;
    // Owners handle incoming opt-out requests manually from the audience list.
    if (event.typeWebhook === "outgoingMessageStatus" && event.idMessage) {
      const status = ({ sent: "accepted", delivered: "delivered", read: "read", failed: "failed" } as Record<string, string>)[event.status ?? ""];
      if (status) {
        const result = await db.rpc("marketing_record_receipt", { p_instance: connection.instance_id, p_message: event.idMessage, p_status: status });
        if (result.error) throw new Error("RECEIPT_FAILED");
      }
    } else if (event.typeWebhook === "stateInstanceChanged" && event.stateInstance && event.stateInstance !== "authorized") {
      const result = await db.from("brand_marketing_connections").update({ status: "pairing", verified_phone: null, updated_at: new Date().toISOString() }).eq("cafe_id", brandId).eq("generation", connection.generation).eq("status", "connected");
      if (result.error) throw new Error("STATE_FAILED");
    }
    return new Response(null, { status: 204, headers });
  } catch { return new Response(null, { status: 503, headers }); }
}
