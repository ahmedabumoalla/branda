import { requirePlatformAdmin } from "@/lib/data/cafes";
import { getSubscriptionQuote } from "@/lib/data/subscription-quotes";
import { createSubscriptionQuotePdf } from "@/lib/export/subscription-quote-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try { await requirePlatformAdmin(); } catch { return new Response(null, { status: 401, headers }); }
  let quote;
  try { quote = await getSubscriptionQuote((await params).id); } catch { return new Response(null, { status: 404, headers }); }
  try {
    const bytes = await createSubscriptionQuotePdf(quote);
    const mode = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `${mode}; filename="${quote.number}.pdf"` } });
  } catch { return Response.json({ error: "تعذر تجهيز ملف عرض السعر حاول مجددًا" }, { status: 503, headers }); }
}
