import { downloadTreasuryAttachment, finalizeTreasuryAttachment } from "@/lib/data/finance-treasury-attachments";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string; id: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request, { params }: Context) {
  try {
    const { slug, id } = await params;
    const { blob, name } = await downloadTreasuryAttachment(slug, new URL(request.url).searchParams.get("documentId") ?? "", id);
    return new Response(blob, { headers: { ...headers, "Content-Type": "application/octet-stream", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}` } });
  } catch { return Response.json({ error: "المرفق غير متاح أو لا تملك صلاحية تنزيله" }, { status: 403, headers }); }
}
export async function POST(request: Request, { params }: Context) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403, headers });
  try {
    const { slug, id } = await params;
    return Response.json({ attachment: await finalizeTreasuryAttachment(slug, new URL(request.url).searchParams.get("documentId") ?? "", id) }, { headers });
  } catch { return Response.json({ error: "لم يكتمل ربط المرفق أعد المحاولة دون إعادة حفظ السند" }, { status: 400, headers }); }
}
