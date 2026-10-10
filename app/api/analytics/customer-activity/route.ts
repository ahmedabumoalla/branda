import { customerDevice, customerUsageInput } from "@/lib/analytics/customer-usage";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicCafeFeatureCodesBySlug } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
export const runtime = "nodejs";
const response = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
async function readBody(request: Request) {
    if (Number(request.headers.get("content-length")) > 1024)
        throw new Error("body too large");
    const reader = request.body?.getReader();
    if (!reader)
        throw new Error("missing body");
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > 1024) {
                await reader.cancel();
                throw new Error("body too large");
            }
            chunks.push(value);
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    finally {
        reader.releaseLock();
    }
}
export async function POST(request: Request) {
    const site = request.headers.get("sec-fetch-site");
    if (request.headers.get("origin") !== new URL(request.url).origin || (site && site !== "same-origin"))
        return response(403);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
        return response(415);
    const input = await readBody(request).then(body => customerUsageInput.safeParse(body)).catch(() => null);
    if (!input?.success)
        return response(400);
    try {
        const client = await createClient();
        const { data: { user } } = await client.auth.getUser();
        if (!user || user.is_anonymous)
            return response(204);
        const features = await getPublicCafeFeatureCodesBySlug(input.data.slug);
        if ((input.data.kind.startsWith("menu_") && !featureCodesAllow(features, "menu")) || (input.data.kind !== "menu_view" && !featureCodesAllow(features, "loyalty")))
            return response(204);
        const { error } = await createAdminClient().rpc("record_customer_activity", { p_user_id: user.id, p_slug: input.data.slug, p_id: input.data.sessionId, p_kind: input.data.kind, p_seconds: input.data.seconds, p_device: customerDevice(request.headers.get("user-agent") || "") });
        return response(error ? 503 : 204);
    }
    catch {
        return response(503);
    }
}
