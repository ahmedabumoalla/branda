import { NextResponse } from "next/server";
import { prepareShiftAttachment } from "@/lib/data/finance-shift-attachments";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Invalid metadata" }, { status: 400, headers });
    const decoder = new TextDecoder(); let text = ""; let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4096) { await reader.cancel(); return NextResponse.json({ error: "Invalid metadata" }, { status: 400, headers }); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const { slug } = await params;
    return NextResponse.json(await prepareShiftAttachment(slug, JSON.parse(text)), { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && /[\u0600-\u06ff]/.test(error.message) ? error.message : "تعذر تجهيز رفع الملف" }, { status: 400, headers });
  }
}
