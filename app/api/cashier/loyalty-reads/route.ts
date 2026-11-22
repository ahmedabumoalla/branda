import { enqueueLoyaltyReadAction, loadCashierLoyaltyReadsAction } from "@/app/actions/loyalty-read-operations";

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin ||
      request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return reply({ ok: false, code: "unauthorized" }, 403);
  }
  const body = await request.json().catch(() => null);
  if (body?.step === "enqueue") return reply(await enqueueLoyaltyReadAction(body.input));
  if (body?.step === "status") return reply(await loadCashierLoyaltyReadsAction(body.ids, body.scope));
  return reply({ ok: false, code: "invalid_input" }, 400);
}
