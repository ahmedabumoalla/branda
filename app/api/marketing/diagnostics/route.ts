import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptMarketingSecret } from "@/lib/marketing/crypto";
import { getGreenApiMarketingState, getGreenApiMarketingQr, GreenApiProviderError, type GreenApiMarketingCredentials } from "@/lib/whatsapp/green-api-marketing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;
const headers = { "Cache-Control": "private, no-store" };

/** Operations-only read probe: no credentials, QR payload, phone, or customer data leave this route */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401, headers });
  const cafeId = new URL(request.url).searchParams.get("brand");
  if (!cafeId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cafeId)) return new Response(null, { status: 400, headers });
  try {
    const { data, error } = await createAdminClient().from("brand_marketing_connections").select("cafe_id,instance_id,encrypted_credentials,status").eq("cafe_id", cafeId).maybeSingle();
    if (error) return Response.json({ stage: "database", ok: false }, { status: 503, headers });
    if (!data?.encrypted_credentials || !data.instance_id || ["disconnected", "disconnecting"].includes(data.status)) return Response.json({ stage: "connection", ok: false }, { status: 409, headers });
    const credentials = decryptMarketingSecret<GreenApiMarketingCredentials>(data.encrypted_credentials, `${data.cafe_id}:${data.instance_id}`);
    const state = await getGreenApiMarketingState(credentials);
    if (state !== "notAuthorized") return Response.json({ stage: "state", ok: state === "authorized", state }, { headers });
    const qr = await getGreenApiMarketingQr(credentials);
    return Response.json({ stage: "qr", ok: qr.type === "qrCode", state, qrType: qr.type, qrAvailable: qr.type === "qrCode" && qr.message.length > 0 }, { headers });
  } catch (error) {
    const code = error instanceof GreenApiProviderError && /^GREEN_API_[A-Z0-9_]+$/.test(error.code) ? error.code : "INTERNAL_DIAGNOSTIC_FAILURE";
    return Response.json({ stage: "provider", ok: false, code }, { status: 503, headers });
  }
}
