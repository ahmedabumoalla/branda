import { getCashierLoyaltySummary, type CashierLoyaltySummaryResult } from "@/lib/data/cashier-loyalty-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(result: CashierLoyaltySummaryResult) {
  const status = result.ok ? 200 : result.code === "invalid_input" ? 400
    : result.code === "not_found" ? 404 : result.code === "session_invalid" ? 401
      : result.code === "unavailable" ? 503 : 403;
  return Response.json(result, { status, headers: {
    "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie, Origin", "X-Content-Type-Options": "nosniff",
  } });
}

export async function POST(request: Request) {
  // POST keeps phone/card identifiers out of URLs and shared caches.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return response({ ok: false, code: "permission_denied" });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return response({ ok: false, code: "invalid_input" });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return response({ ok: false, code: "invalid_input" });
  try {
    const body = await request.text();
    if (body.length > 4096) return response({ ok: false, code: "invalid_input" });
    return response(await getCashierLoyaltySummary(JSON.parse(body), request.signal));
  } catch {
    return response({ ok: false, code: "invalid_input" });
  }
}
