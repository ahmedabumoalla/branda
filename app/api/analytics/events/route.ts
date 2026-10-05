import { createHmac } from "node:crypto";
import { engagementInputSchema } from "@/lib/analytics/brand-analytics";
import { getSupabaseServiceRoleKey } from "@/lib/barndaksa/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const maxBodyBytes = 1024;

async function boundedJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBodyBytes) throw new Error("Body too large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > maxBodyBytes) { await reader.cancel(); throw new Error("Body too large"); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function POST(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== new URL(request.url).origin || (site && site !== "same-origin")) {
    return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return new Response(null, { status: 415 });
  }
  const input = await boundedJson(request).then(body => engagementInputSchema.safeParse(body)).catch(() => null);
  if (!input?.success) return new Response(null, { status: 400 });
  try {
    // Store a domain-separated hash, never a raw identifier, IP, URL or referrer.
    const visitorKey = createHmac("sha256", getSupabaseServiceRoleKey()).update(`brand-engagement:${input.data.visitorId}`).digest("hex");
    const { error } = await createAdminClient().rpc("record_brand_engagement", {
      p_slug: input.data.slug, p_kind: input.data.kind, p_event_id: input.data.eventId, p_visitor_key: visitorKey,
    });
    if (error) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch { return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
