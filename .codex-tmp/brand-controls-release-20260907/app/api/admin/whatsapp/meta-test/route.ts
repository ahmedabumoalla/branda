import { requirePlatformAdmin } from "@/lib/data/cafes";
import {
  isMetaWhatsAppConfigured,
  sendMetaWhatsAppTemplate,
} from "@/lib/whatsapp/meta-cloud";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

function statusForAuthError(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Unauthorized")) return 401;
  if (message.startsWith("Forbidden")) return 403;
  return 500;
}

function safeErrorReason(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 140);
  }
  return "unknown_error";
}

export async function POST(request: Request) {
  try {
    await requirePlatformAdmin();
  } catch (error) {
    return jsonResponse(
      { ok: false, reason: statusForAuthError(error) === 500 ? "auth_check_failed" : "forbidden" },
      statusForAuthError(error),
    );
  }

  if (!isMetaWhatsAppConfigured()) {
    return jsonResponse(
      { ok: false, skipped: true, reason: "missing_config" },
      503,
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, reason: "invalid_json" }, 400);
  }

  const phone =
    payload && typeof payload === "object" && "phone" in payload
      ? String((payload as { phone?: unknown }).phone ?? "")
      : "";

  if (!phone.trim()) {
    return jsonResponse({ ok: false, reason: "missing_phone" }, 400);
  }

  try {
    const result = await sendMetaWhatsAppTemplate({
      to: phone,
      templateName: "hello_world",
      languageCode: "en_US",
    });

    if (!result.ok) {
      return jsonResponse(
        {
          ok: false,
          reason: result.reason,
          status: result.status,
          errorCode: result.errorCode,
          errorType: result.errorType,
          skipped: result.skipped,
        },
        result.skipped ? 400 : 502,
      );
    }

    return jsonResponse({ ok: true, messageId: result.messageId });
  } catch (error) {
    return jsonResponse({ ok: false, reason: safeErrorReason(error) }, 500);
  }
}
